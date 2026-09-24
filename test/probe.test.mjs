/**
 * dsh-yolo-mode —— REAL-CORDIS 探针（test/probe.test.mjs）
 *
 * 与其余单测（fake-ctx 或纯函数）不同，本文件在真实 @deepseek-ai/cordis
 * Context 上挂载插件本体（lib/index.js 的 apply），提供插件所需的最小服务：
 *   - settings：真实 cordis Service 子类的轻量替身，仅实现插件用到的
 *     `configure(presentation, owner)`（0.1.7 SettingsForms 页面策略）——
 *     用于断言插件以 { auto:false }（自建 UI）注册页面策略；
 *   - llm：FakeLlm（真实 cordis Service 子类，stream() 由测试注入分片流）；
 *   - sandboxPolicy：普通对象 stub（插件经 ctx.get('sandboxPolicy') 惰性读取）。
 * 然后经 ctx.waterfall('approval/request', req, tail) 派发真实审批请求，
 * 断言插件的激活、设置读取、裁决/委托/取消/过滤全链路。
 *
 * 0.1.7 迁移：插件不再经 installSection 注册 settings 命名空间，而是导出
 * Config schema（volatile 字段）并由 cordis 解析条目 config；设置读取用
 * `config.<field>.get()`。故本探针经真实 cordis 的 Config 解析路径挂载插件，
 * 并用 cosmokit 的 `updateVolatile`（loader `_commitVolatile` 的同一原语）
 * 就地更新 volatile 引用，验证"改设置不重启插件即生效"——DSH 真实装载下的
 * 完整 settingsMutate → loader 链路另见本次迁移的 DSH e2e 记录。
 *
 * 目的：捕获 fake-ctx 单测漏掉的契约漂移（0.1.7 Config/volatile 解析、
 * approval/request 事件载荷、llm stream 签名等）。
 *
 * 运行：node --test test/probe.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { isVolatile, updateVolatile } from '@deepseek-ai/cosmokit'

import { name, inject, apply, Config } from '../lib/index.js'
import { stats, getStatusPayload } from '../lib/state.js'

/* ------------------------------------------------------------------ *
 * 最小服务实现（真实 cordis Service 基类）
 * ------------------------------------------------------------------ */

/** 轻量 settings 替身：只实现插件用到的页面策略注册（0.1.7 SettingsForms）。 */
class FakeSettings extends Service {
  constructor(ctx) {
    super(ctx, 'settings')
    this.policies = []
  }

  configure(presentation, owner) {
    this.policies.push({ presentation, owner })
    return () => {}
  }
}

/** 假 llm：stream() 转交测试注入的 produce(options)。 */
class FakeLlm extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
    this.produce = undefined
  }

  listProviders() {
    return [{ provider: 'opencode-go', models: ['probe-model'] }]
  }

  stream(options) {
    const produce = this.produce
    if (typeof produce !== 'function') {
      return (async function* empty() {})()
    }
    return produce(options)
  }
}

/** 把一段文本按 alpha.4 StreamChunk 分片协议组装为完整 chunk 序列。 */
function textChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 2, outputTokens: 3 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/* ------------------------------------------------------------------ *
 * 探针装配
 * ------------------------------------------------------------------ */

/**
 * 启动一个真实 cordis Context：提供 settings/llm/sandboxPolicy 后挂载插件。
 * @param {object} [config] 插件行 config（经真实 Config schema 解析）
 * @param {{mode?:string, workspaceRoot?:string}} [policy] sandboxPolicy.resolve 返回值
 * @param {Function} [produce] FakeLlm 的 stream 产出
 * @returns {Promise<{ctx: Context, settings: FakeSettings, llm: FakeLlm, fiber: object}>}
 */
async function boot(config, { policy, produce } = {}) {
  const ctx = new Context()
  await ctx.plugin(FakeSettings, {})
  await ctx.plugin(FakeLlm, {})
  const llm = ctx.get('llm')
  llm.produce = produce
  await ctx.plugin(function probeSandboxPolicy(inner) {
    ctx.provide('sandboxPolicy', {
      resolve: ({ session }) => ({
        mode: policy?.mode ?? 'workspace-write',
        workspaceRoot: policy?.workspaceRoot ?? '/tmp',
        ...(session !== undefined ? { sessionId: session.id } : {}),
      }),
    })
  })
  const fiber = ctx.plugin({ name, inject, apply, Config }, config ?? {})
  await fiber
  // 让 settings 的 ctx.inject 回调落地（页面策略注册）。
  await Promise.resolve()
  return { ctx, settings: ctx.get('settings'), llm, fiber }
}

/** 构造一个升权审批申请（agent.session 为裸 DSH 会话字形）。 */
function makeRequest(overrides) {
  return {
    agent: {
      id: 'probe-agent',
      session: {
        id: 'probe-session',
        header: { origin: 'main', delegationDepth: 0, cwd: '/tmp' },
        events: [],
      },
    },
    toolName: 'bash',
    callId: 'call-1',
    reason: 'escalate sandbox to workspace-write: write the build output',
    ...overrides,
  }
}

/** 经真实 cordis waterfall 派发一个审批请求。 */
function ask(ctx, req) {
  return ctx.waterfall('approval/request', req, () => Promise.resolve('unavailable'))
}

/* ------------------------------------------------------------------ *
 * 探针用例
 * ------------------------------------------------------------------ */

test('probe: 插件在真实 Context 上激活且以 auto:false 注册设置页面策略（0.1.7 SettingsForms）', async () => {
  const { ctx, settings } = await boot({})
  try {
    assert.ok(settings instanceof FakeSettings, 'settings service must be mounted')
    assert.equal(settings.policies.length, 1, 'the plugin must register exactly one page policy')
    assert.equal(settings.policies[0].presentation.auto, false, 'auto:false keeps the plugin-owned UI page')
    assert.ok(settings.policies[0].owner, 'the policy must be bound to the plugin fiber')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: 空条目 config → Config schema 解析出 volatile 引用与默认值', async () => {
  const { ctx, fiber } = await boot({})
  try {
    // cordis 用插件导出的 Config 解析条目 config：空 config 也得到对象。
    const resolved = fiber.config
    assert.equal(isVolatile(resolved.preset), true, 'preset must be a live volatile reference')
    assert.equal(resolved.preset.get(), 'balanced', 'preset default applies')
    assert.deepEqual(resolved.modes.get(), [], 'unset modes resolve to the empty collection')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: 已中止的申请 → cancelled（不委托）', async () => {
  const { ctx } = await boot({})
  try {
    const signal = AbortSignal.abort()
    const outcome = await ask(ctx, makeRequest({ signal }))
    assert.equal(outcome, 'cancelled')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: 非升权 reason → 透明委托（tail 返回 unavailable）', async () => {
  const { ctx } = await boot({})
  try {
    const outcome = await ask(ctx, makeRequest({ reason: 'run the test suite please' }))
    assert.equal(outcome, 'unavailable')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: 会话沙箱模式不在 modes 内 → 透明委托', async () => {
  const { ctx } = await boot(
    { modes: ['danger-full-access'] },
    { policy: { mode: 'read-only', workspaceRoot: '/tmp' } },
  )
  try {
    const outcome = await ask(ctx, makeRequest())
    assert.equal(outcome, 'unavailable')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: includeSubagents=false 时子代理会话 → 透明委托', async () => {
  const { ctx } = await boot(
    { preset: 'yolo', includeSubagents: false },
    { policy: { mode: 'workspace-write' } },
  )
  try {
    // 子代理会话即使 reason 合法、预设 yolo（否则必放行）也被过滤 → 委托。
    const req = makeRequest({
      agent: {
        id: 'probe-agent',
        session: {
          id: 'probe-session',
          header: { origin: 'subagent', delegationDepth: 1, cwd: '/tmp' },
          events: [],
        },
      },
    })
    const outcome = await ask(ctx, req)
    assert.equal(outcome, 'unavailable')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: yolo 预设 → allowed-once（确定性放行，不触裁判）', async () => {
  const { ctx } = await boot({ preset: 'yolo' })
  try {
    const outcome = await ask(ctx, makeRequest())
    assert.equal(outcome, 'allowed-once')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: balanced 预设 + 裁判 allow → allowed-once（真实 dsh-llm 组装）', async () => {
  const seen = []
  const { ctx } = await boot(
    {
      preset: 'balanced',
      judge: { provider: 'opencode-go', model: 'probe-model' },
      auditFile: '',
    },
    {
      produce: async function* (options) {
        seen.push({ provider: options.provider, model: options.model })
        yield* textChunks('{"decision":"allow","reason":"probe says ok"}')
      },
    },
  )
  try {
    const beforeTotal = stats.total
    const beforeAllowed = stats.allowed
    const outcome = await ask(ctx, makeRequest())
    assert.equal(outcome, 'allowed-once')
    // 裁判确实经 ctx.llm.stream() 被调用，且携带 Config 的 provider/model。
    assert.deepEqual(seen, [{ provider: 'opencode-go', model: 'probe-model' }])
    // 审计统计递增（模块级 state 单例；本文件独立进程，无跨文件污染）。
    assert.equal(stats.total, beforeTotal + 1)
    assert.equal(stats.allowed, beforeAllowed + 1)
    // 成功路径审计条目形状不变：带 reason、不带 error。
    const top = getStatusPayload({}).recent[0]
    assert.equal(top.outcome, 'allowed-once')
    assert.equal(top.reason, 'probe says ok')
    assert.equal('error' in top, false, '成功路径审计条目不携带 error 字段')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: 裁判只产出 reasoning 块（推理预算耗尽，Issue #1）→ BAD_OUTPUT 回退 delegate 且审计带 error', async () => {
  const { ctx } = await boot(
    { preset: 'balanced', judge: { provider: 'opencode-go', model: 'probe-model' }, auditFile: '' },
    {
      produce: async function* () {
        // 模拟推理型模型：token 预算全部消耗在 reasoning 块上，无 text 块，
        // finish_reason=length → 裁判抛 BAD_OUTPUT（Issue #1 的根因场景）。
        yield { type: 'block-start', index: 0, blockType: 'reasoning' }
        yield { type: 'reasoning-delta', index: 0, text: 'the request seems fine but let me weigh the scope...' }
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'the request seems fine but let me weigh the scope...' } }
        yield { type: 'finish', reason: { kind: 'length' } }
      },
    },
  )
  try {
    const beforeFailures = stats.judgeFailures
    const outcome = await ask(ctx, makeRequest())
    // balanced + error 回退 → delegate → next() → 人工（tail unavailable）。
    assert.equal(outcome, 'unavailable')
    assert.equal(stats.judgeFailures, beforeFailures + 1)
    const top = getStatusPayload({}).recent[0]
    assert.equal(top.outcome, 'delegate')
    assert.equal(top.error, 'BAD_OUTPUT', '裁判失败审计条目必须带 JudgeError 码')
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: volatile 设置就地更新后 effective config 立即生效（balanced → yolo，不重启插件）', async () => {
  const { ctx, fiber } = await boot({ preset: 'balanced' })
  try {
    // 初始 balanced：workspace-write 升权走 judge → 未配置裁判 → delegate。
    assert.equal(await ask(ctx, makeRequest()), 'unavailable')
    // loader `_commitVolatile` 的同一原语：把新解析值的 preset 写回插件持有的
    // volatile 引用（就地，不重启）。插件 effectiveConfig() 读到新值。
    const refBefore = fiber.config.preset
    updateVolatile(fiber.config.preset, Config({ preset: 'yolo' }).preset)
    assert.equal(fiber.config.preset, refBefore, 'volatile reference identity is stable (in-place update)')
    assert.equal(fiber.config.preset.get(), 'yolo')
    assert.equal(await ask(ctx, makeRequest()), 'allowed-once')
  } finally {
    await ctx.dispose?.()
  }
})
