/**
 * dsh-yolo-mode 消融探针（ablation/probe.mjs）
 *
 * 用法：node ablation/probe.mjs <variant-id>   （M1..M8）
 *
 * 对每个变体在真实 Cordis Context 上挂载插件本体（lib/index.js 的 apply），
 * 提供最小服务（MemorySettings + FakeLlm + sandboxPolicy stub，镜像
 * test/probe.test.mjs 的挂载方式），经 ctx.waterfall('approval/request', req, tail)
 * 派发真实审批请求，断言：
 *   - loadOk：apply 不抛错（插件仍能正常加载）；
 *   - ablationEffective（负向）：被消融模块的功能确实消失；
 *   - corePass（正向）：保留模块的核心功能仍可用（裁决/委托/审计仍工作）。
 *
 * 变体类型：
 *   - M1–M6：code 变体（run.mjs 先 git apply ablation/variants/<ID>.patch，
 *     探针用默认/变体 config 挂载）；
 *   - M7：组合消融（不挂载 bridge 条目，验证主条目不注册 webServer 路由）；
 *   - M8：静态验证（client 独立构建产物、主条目不依赖 client）。
 *
 * 输出：单行 JSON { variant, loadOk, checks, pass, note }。
 */
import { Context, Service } from '@deepseek-ai/cordis'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { name, inject, apply } from '../lib/index.js'
import { YOLO_SETTINGS_NAMESPACE } from '../lib/settings.js'
import { stats } from '../lib/state.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/* ------------------------------------------------------------------ *
 * 最小服务实现（与 test/probe.test.mjs 一致）
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
 * 装配辅助
 * ------------------------------------------------------------------ */

/**
 * 启动一个真实 cordis Context：提供 settings/llm/sandboxPolicy（可选 webServer）
 * 后挂载插件。挂载失败（apply 抛错）→ 本函数抛错 → loadOk=false。
 * @param {object} [config] 插件行 config
 * @param {{mode?:string, workspaceRoot?:string}} [policy] sandboxPolicy.resolve 返回值
 * @param {Function} [produce] FakeLlm 的 stream 产出
 * @param {object} [webServer] 可选 webServer stub（M7 用 register 间谍）
 * @returns {Promise<{ctx: Context, settings: SettingsProvider, llm: FakeLlm}>}
 */
async function boot(config, { policy, produce, webServer } = {}) {
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
  if (webServer !== undefined) {
    await ctx.plugin(function probeWebServer(inner) {
      ctx.provide('webServer', webServer)
    })
  }
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

/** 等待异步 fire-and-forget 副作用（fs.promises.appendFile）落盘。 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

/** 审计 JSONL 行数（文件不存在 → 0）。 */
function auditLines(file) {
  if (!fs.existsSync(file)) return 0
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter((l) => l.length > 0).length
}

/* ------------------------------------------------------------------ *
 * 变体矩阵：每个变体的 run() 返回 { loadOk, checks }
 * ------------------------------------------------------------------ */

const VARIANTS = {
  M1: {
    note: '移除 getJudge 的 createJudge 调用 → 裁判恒 null，judge 路径按预设 error 回退（balanced → delegate）',
    run: async () => {
      const checks = {}
      // 负向：balanced + judge 已配置 → 裁判路径被消融 → error 回退 delegate → unavailable；llm 不被调用。
      const seen = []
      const { ctx } = await boot(
        { preset: 'balanced', judge: { provider: 'opencode-go', model: 'probe-model' } },
        {
          produce: async function* (options) {
            seen.push(options)
            yield* textChunks('{"decision":"allow","reason":"probe says ok"}')
          },
        },
      )
      try {
        const outcome = await ask(ctx, makeRequest())
        checks['judge-path-ablated'] =
          outcome === 'unavailable' ? 'ok' : `FAIL: expected unavailable (error fallback delegate), got ${outcome}`
        checks['llm-not-called'] = seen.length === 0 ? 'ok' : `FAIL: llm.stream called ${seen.length} times`
      } finally {
        await ctx.dispose?.()
      }
      // 正向：确定性路径保留（yolo 预设仍放行）。
      const { ctx: ctx2 } = await boot({ preset: 'yolo' })
      try {
        const outcome = await ask(ctx2, makeRequest())
        checks['yolo-allow-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
      } finally {
        await ctx2.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M2: {
    note: '移除 audit() 的 fs.promises.appendFile → 审计 JSONL 不追加（保留 logger + recordDecision）',
    run: async () => {
      const checks = {}
      const auditFile = path.join(os.tmpdir(), 'dsh-yolo-ablation', `M2-${process.pid}.jsonl`)
      fs.rmSync(auditFile, { force: true })
      const { ctx } = await boot({ preset: 'yolo', auditFile })
      try {
        const before = stats.total
        const outcome = await ask(ctx, makeRequest())
        checks['decision-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
        // 负向：审计 JSONL 不追加（文件不存在）。
        checks['jsonl-not-appended'] = fs.existsSync(auditFile) ? 'FAIL: audit file was appended' : 'ok'
        // 正向：统计单例保留（recordDecision 未被消融）。
        checks['stats-kept'] = stats.total === before + 1 ? 'ok' : `FAIL: stats.total ${before} → ${stats.total}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M3: {
    note: '移除 audit() 的 recordDecision 调用 → 统计单例不更新（保留 logger + JSONL 追加）',
    run: async () => {
      const checks = {}
      const auditFile = path.join(os.tmpdir(), 'dsh-yolo-ablation', `M3-${process.pid}.jsonl`)
      fs.rmSync(auditFile, { force: true })
      const { ctx } = await boot({ preset: 'yolo', auditFile })
      try {
        const before = stats.total
        const outcome = await ask(ctx, makeRequest())
        checks['decision-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
        // 负向：统计不更新。
        checks['stats-not-updated'] = stats.total === before ? 'ok' : `FAIL: stats.total ${before} → ${stats.total}`
        // 正向：审计 JSONL 保留（appendFile 异步落盘，稍候）。
        await settle()
        checks['jsonl-kept'] = auditLines(auditFile) === 1 ? 'ok' : `FAIL: expected 1 audit line, got ${auditLines(auditFile)}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M4: {
    note: '移除 installYoloSettings → yolo-mode 命名空间不注册，effectiveConfig 回落插件行 config',
    run: async () => {
      const checks = {}
      const { ctx, settings } = await boot({ preset: 'yolo' })
      try {
        // 负向：命名空间未注册（get 返回 undefined、describe 无该视图）。
        const resolved = settings.get(YOLO_SETTINGS_NAMESPACE)
        checks['namespace-not-registered'] = resolved === undefined ? 'ok' : 'FAIL: yolo-mode namespace still registered'
        const descriptors = settings.describe({ redactSecrets: true })
        const view = descriptors.find((d) => d.ns === YOLO_SETTINGS_NAMESPACE)
        checks['describe-no-view'] = view === undefined ? 'ok' : 'FAIL: describe() still surfaces yolo-mode'
        // 正向：行配置仍驱动裁决（preset yolo → 放行）。
        const outcome = await ask(ctx, makeRequest())
        checks['row-config-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once (row preset yolo), got ${outcome}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M5: {
    note: '移除 extractArgumentsSummary 提取 → 裁判仅凭 reason 裁决（无 tool/call 实参摘要）',
    run: async () => {
      const checks = {}
      const seen = []
      const { ctx } = await boot(
        { preset: 'balanced', judge: { provider: 'opencode-go', model: 'probe-model' } },
        {
          produce: async function* (options) {
            seen.push(options)
            yield* textChunks('{"decision":"allow","reason":"probe says ok"}')
          },
        },
      )
      try {
        // 会话事件带与 req.callId 匹配的 tool/call 实参（含唯一标记）。
        const req = makeRequest({
          agent: {
            id: 'probe-agent',
            session: {
              id: 'probe-session',
              header: { origin: 'main', delegationDepth: 0, cwd: '/tmp' },
              events: [
                {
                  seq: 1,
                  time: Date.now(),
                  type: 'tool/call',
                  data: { callId: 'call-1', name: 'bash', arguments: '{"command":"echo ABLATION_MARKER_123"}' },
                },
              ],
            },
          },
        })
        const outcome = await ask(ctx, req)
        // 正向：裁判路径保留（allow → 放行）。
        checks['judge-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
        // 负向：裁判输入不含实参摘要（llm.stream 收到的消息里无标记）。
        const serialized = JSON.stringify(seen[0] ?? {})
        checks['no-arguments-summary'] = serialized.includes('ABLATION_MARKER_123')
          ? 'FAIL: arguments summary still passed to judge'
          : 'ok'
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M6: {
    note: '移除 includeSubagents 门 → includeSubagents=false 时子代理会话也裁决',
    run: async () => {
      const checks = {}
      const { ctx } = await boot({ preset: 'yolo', includeSubagents: false })
      try {
        // 负向：子代理会话不再被过滤（yolo 预设 → 放行而非委托）。
        const subReq = makeRequest({
          agent: {
            id: 'probe-agent',
            session: {
              id: 'probe-session',
              header: { origin: 'subagent', delegationDepth: 1, cwd: '/tmp' },
              events: [],
            },
          },
        })
        const subOutcome = await ask(ctx, subReq)
        checks['subagent-gate-ablated'] =
          subOutcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once (gate removed), got ${subOutcome}`
        // 正向：主会话裁决保留。
        const mainOutcome = await ask(ctx, makeRequest())
        checks['main-kept'] = mainOutcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${mainOutcome}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M7: {
    note: '组合消融：不挂载 bridge 条目 → 主条目不注册任何 webServer 路由（/yolo-mode 桥消失）',
    run: async () => {
      const checks = {}
      // 静态：bridge-entry.js 是独立插件条目（name/inject/apply 形状 + 注入 webServer）。
      const bridge = await import('../lib/bridge-entry.js')
      checks['bridge-plugin-shape'] =
        typeof bridge.name === 'string' && Array.isArray(bridge.inject) && typeof bridge.apply === 'function'
          ? 'ok'
          : 'FAIL: bridge-entry.js is not a plugin entry'
      checks['bridge-injects-webserver'] = bridge.inject.includes('webServer')
        ? 'ok'
        : 'FAIL: bridge does not inject webServer'
      // 动态：只挂载主条目 + webServer 间谍 → 无路由注册；裁决仍工作。
      const registered = []
      const { ctx } = await boot(
        { preset: 'yolo' },
        { webServer: { register: (r) => { registered.push(r); return () => {} } } },
      )
      try {
        checks['no-route-registered'] = registered.length === 0 ? 'ok' : `FAIL: main entry registered ${registered.length} routes`
        const outcome = await ask(ctx, makeRequest())
        checks['main-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },

  M8: {
    note: '静态验证：client 独立构建产物存在、主条目不依赖 client、package.json 独立导出',
    run: async () => {
      const checks = {}
      // 主条目不引用 client 产物。
      const mainSrc = fs.readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
      checks['main-no-client-ref'] = /client/i.test(mainSrc) ? 'FAIL: lib/index.js references client' : 'ok'
      // client 独立构建产物存在（scripts/build-client.mjs 产出 lib/client/index.js）。
      checks['client-bundle-exists'] = fs.existsSync(path.join(root, 'lib', 'client', 'index.js'))
        ? 'ok'
        : 'FAIL: lib/client/index.js missing'
      checks['client-build-script'] = fs.existsSync(path.join(root, 'scripts', 'build-client.mjs'))
        ? 'ok'
        : 'FAIL: scripts/build-client.mjs missing'
      // package.json 独立导出（./client 与 ./bridge）。
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      checks['client-export'] = pkg.exports && pkg.exports['./client'] ? 'ok' : 'FAIL: no ./client export'
      checks['bridge-export'] = pkg.exports && pkg.exports['./bridge'] ? 'ok' : 'FAIL: no ./bridge export'
      // 主条目仍可正常挂载（loadOk）。
      const { ctx } = await boot({ preset: 'yolo' })
      try {
        const outcome = await ask(ctx, makeRequest())
        checks['main-kept'] = outcome === 'allowed-once' ? 'ok' : `FAIL: expected allowed-once, got ${outcome}`
      } finally {
        await ctx.dispose?.()
      }
      return { loadOk: true, checks }
    },
  },
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const variantId = process.argv[2]
if (!variantId || !VARIANTS[variantId]) {
  console.error('usage: node ablation/probe.mjs <variant-id>')
  console.error('variants: ' + Object.keys(VARIANTS).join(', '))
  process.exit(2)
}

const result = { variant: variantId, loadOk: false, checks: {}, pass: false, note: VARIANTS[variantId].note }

try {
  const { loadOk, checks } = await VARIANTS[variantId].run()
  result.loadOk = loadOk
  result.checks = checks
  result.pass = loadOk && Object.values(checks).every((v) => v === 'ok')
} catch (err) {
  result.checks.scenario = 'FAIL: ' + String(err?.message ?? err)
  result.pass = false
}

console.log(JSON.stringify(result))
