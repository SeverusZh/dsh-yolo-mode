/**
 * dsh-yolo-mode —— REAL-CORDIS 探针（test/probe.test.mjs）
 *
 * 与其余单测（fake-ctx 或纯函数）不同，本文件在真实 @deepseek-ai/cordis
 * Context 上挂载插件本体（lib/index.js 的 apply），提供插件所需的最小服务：
 *   - settings：真实 @deepseek-ai/dsh-settings 的 SettingsProvider 子类
 *     （内存文档，走 alpha.4 的 load/persist/register/installSection 真实路径）；
 *   - llm：FakeLlm（真实 cordis Service 子类，stream() 由测试注入分片流；
 *     listProviders 供未来扩展）；
 *   - sandboxPolicy：普通对象 stub（插件经 ctx.get('sandboxPolicy') 惰性读取）。
 * 然后经 ctx.waterfall('approval/request', req, tail) 派发真实审批请求，
 * 断言插件的激活、settings 命名空间注册、裁决/委托/取消/过滤全链路。
 *
 * 目的：捕获 fake-ctx 单测漏掉的契约漂移（alpha.4 把 dsh-settings 改为
 * SettingsProvider 类服务、approval/request 事件载荷、llm stream 签名等）。
 *
 * 运行：node --test test/probe.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import SettingsProvider from '@deepseek-ai/dsh-settings'

import { name, inject, apply } from '../lib/index.js'
import { YOLO_SETTINGS_NAMESPACE } from '../lib/settings.js'
import { stats } from '../lib/state.js'

/* ------------------------------------------------------------------ *
 * 最小服务实现（真实 cordis/dsh-settings 基类）
 * ------------------------------------------------------------------ */

/** 内存文档的 SettingsProvider（alpha.4 抽象基类的最小实现）。 */
class MemorySettings extends SettingsProvider {
  constructor(ctx) {
    super(ctx)
    this._doc = {}
  }

  get writable() {
    return true
  }

  async load() {
    return structuredClone(this._doc)
  }

  async persist(ns, section) {
    this._doc[ns] = structuredClone(section)
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
 * @param {object} [config] 插件行 config
 * @param {{mode?:string, workspaceRoot?:string}} [policy] sandboxPolicy.resolve 返回值
 * @param {Function} [produce] FakeLlm 的 stream 产出
 * @returns {Promise<{ctx: Context, settings: SettingsProvider, llm: FakeLlm}>}
 */
async function boot(config, { policy, produce } = {}) {
  const ctx = new Context()
  await ctx.plugin(MemorySettings, {})
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
  await ctx.plugin({ name, inject, apply }, config ?? {})
  return { ctx, settings: ctx.get('settings'), llm }
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

test('probe: 插件在真实 Context 上激活且 yolo-mode settings 命名空间注册（alpha.4 class API）', async () => {
  const { ctx, settings } = await boot({})
  try {
    // 命名空间已注册并可读（schema 决议：preset 有默认；空集合字段为 []/{}）。
    const resolved = settings.get(YOLO_SETTINGS_NAMESPACE)
    assert.ok(resolved, 'yolo-mode namespace must be registered')
    assert.equal(resolved.preset, 'balanced')
    // schema 层 modes 无默认 → []；['workspace-write'] 默认发生在插件层
    // effectiveConfig() 的 normalizeConfig（本文件其余用例行为验证）。
    assert.deepEqual(resolved.modes, [])

    const descriptors = settings.describe({ redactSecrets: true })
    const view = descriptors.find((d) => d.ns === YOLO_SETTINGS_NAMESPACE)
    assert.ok(view, 'describe() must surface the yolo-mode namespace')
    assert.equal(view.applies, 'live')
    assert.equal(typeof view.revision, 'number')
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
    // 裁判确实经 ctx.llm.stream() 被调用，且携带行配置的 provider/model。
    assert.deepEqual(seen, [{ provider: 'opencode-go', model: 'probe-model' }])
    // 审计统计递增（模块级 state 单例；本文件独立进程，无跨文件污染）。
    assert.equal(stats.total, beforeTotal + 1)
    assert.equal(stats.allowed, beforeAllowed + 1)
  } finally {
    await ctx.dispose?.()
  }
})

test('probe: settings 用户层更新后 effective config 立即生效（balanced → yolo）', async () => {
  const { ctx, settings } = await boot({ preset: 'balanced' })
  try {
    // 初始 balanced：workspace-write 升权走 judge → 未配置裁判 → delegate。
    assert.equal(await ask(ctx, makeRequest()), 'unavailable')
    // 用户层写 preset: yolo → resolved 变化 → 插件 sourceThunk 读到新值。
    await settings.update(YOLO_SETTINGS_NAMESPACE, { preset: 'yolo' })
    assert.equal(await ask(ctx, makeRequest()), 'allowed-once')
  } finally {
    await ctx.dispose?.()
  }
})
