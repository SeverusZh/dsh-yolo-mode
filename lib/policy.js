/**
 * dsh-yolo-mode —— 策略层（纯函数，零依赖零 import）
 *
 * 对应 design.md 第 2 节（配置 Schema）与第 4 节（策略层契约）。
 * 全部导出为纯函数与冻结常量，可独立单测；任何非法输入 fail-loud 抛出。
 *
 * @module lib/policy.js
 */

/** 内置预设枚举（冻结） */
export const PRESETS = Object.freeze(['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'])

/** 可用的权限策略（冻结） */
export const POLICIES = Object.freeze(['allow', 'judge', 'delegate', 'deny'])

/**
 * 沙箱升权申请 reason 匹配（design.md §0/§4）。
 * 格式经本机 `dsh-sandbox/lib/index.js:101` 核实：
 *   `escalate sandbox to ${mode}: ${justification}`，mode ∈ workspace-write | danger-full-access。
 */
export const ESCALATION_RE =
  /^escalate sandbox to (workspace-write|danger-full-access): (.+)$/

/** 合法沙箱文件模式（冻结） */
const SANDBOX_MODES = Object.freeze(['read-only', 'workspace-write', 'danger-full-access'])

/**
 * 内置预设表（design.md §4，非 custom 使用）。
 * 目标模式 → 策略：
 *   off → 全部 delegate；strict → ws-write=judge, dfa=delegate；
 *   balanced/permissive → 全部 judge；yolo → 全部 allow。
 */
const PRESET_TABLE = Object.freeze({
  off: Object.freeze({ 'workspace-write': 'delegate', 'danger-full-access': 'delegate' }),
  strict: Object.freeze({ 'workspace-write': 'judge', 'danger-full-access': 'delegate' }),
  balanced: Object.freeze({ 'workspace-write': 'judge', 'danger-full-access': 'judge' }),
  permissive: Object.freeze({ 'workspace-write': 'judge', 'danger-full-access': 'judge' }),
  yolo: Object.freeze({ 'workspace-write': 'allow', 'danger-full-access': 'allow' }),
})

/**
 * 六预设的默认 levels（design.md §2；设置页预填充/预览用，含 error/unsure 回退行）。
 * 与 PRESET_TABLE 的模式行一致，另按 judgeFallback 语义补齐回退行：
 *   strict   → error='deny'、unsure='delegate'（strict+error → rejected）；
 *   permissive → unsure='allow'（permissive+unsure → allowed-once）；
 *   off/balanced/yolo → 未声明回退行（judgeFallback 缺省 delegate）；
 *   custom → 空对象（用户自填）。
 */
const DEFAULT_LEVELS = Object.freeze({
  off: Object.freeze({ 'workspace-write': 'delegate', 'danger-full-access': 'delegate' }),
  strict: Object.freeze({
    'workspace-write': 'judge',
    'danger-full-access': 'delegate',
    error: 'deny',
    unsure: 'delegate',
  }),
  balanced: Object.freeze({ 'workspace-write': 'judge', 'danger-full-access': 'judge' }),
  permissive: Object.freeze({
    'workspace-write': 'judge',
    'danger-full-access': 'judge',
    unsure: 'allow',
  }),
  yolo: Object.freeze({ 'workspace-write': 'allow', 'danger-full-access': 'allow' }),
  custom: Object.freeze({}),
})

/**
 * 返回某预设的默认 levels 对象（design.md §2；设置页选中预设时预填充）。
 *   off/balanced/yolo → 模式行（error/unsure 走 judgeFallback 缺省 delegate）；
 *   strict → 额外 error='deny'、unsure='delegate'；
 *   permissive → 额外 unsure='allow'；
 *   custom → 空对象 {}（用户自填）。
 * 非法 preset fail-loud 抛出（与 resolvePolicy / judgeFallback 一致）。
 * @param {string} preset 预设名（PRESETS 之一）
 * @returns {Readonly<object>} 冻结的默认 levels 对象
 */
export function defaultLevelsFor(preset) {
  if (typeof preset !== 'string' || !PRESETS.includes(preset)) {
    throw new Error(`defaultLevelsFor: 非法 preset "${preset}"（允许 ${PRESETS.join('|')}）`)
  }
  return DEFAULT_LEVELS[preset]
}

/** 默认配置（design.md §2）。每次调用返回新鲜的可变默认值，交由 normalizeConfig 合并与冻结。 */
function defaultConfig() {
  return {
    preset: 'balanced',
    modes: ['workspace-write'],
    levels: {},
    judge: { provider: '', model: '', systemPrompt: '', timeoutMs: 20000, maxTokens: 256, concurrency: 2 },
    includeSubagents: true,
    auditFile: '',
  }
}

/** 仅接受正整数 */
function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0
}

/** 深冻结任何对象/数组图（原样返回不可变值）。 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    return Object.freeze(value)
  }
  for (const key of Object.keys(value)) deepFreeze(value[key])
  return Object.freeze(value)
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 读取裁判分级值（levels.error / levels.unsure 之类）。
 * @param {object} levels
 * @param {string} key
 * @returns {string|undefined} 分级 policy 值或 undefined（未配置）
 */
function readLevel(levels, key) {
  if (!isPlainObject(levels)) return undefined
  return Object.prototype.hasOwnProperty.call(levels, key) ? levels[key] : undefined
}

/**
 * 配置规范化（design.md §2；fail-loud）。
 * 返回完整默认合并后的深冻结配置对象。所有非法值一律抛出。
 * @param {object|undefined} raw 原始插件 config
 * @returns {Readonly<Config>} 冻结配置对象
 */
export function normalizeConfig(raw) {
  const r = raw === undefined || raw === null ? {} : raw
  if (!isPlainObject(r)) throw new TypeError('normalizeConfig: config 必须是一个普通对象')

  // preset
  const preset = r.preset === undefined ? defaultConfig().preset : r.preset
  if (typeof preset !== 'string' || !PRESETS.includes(preset)) {
    throw new Error(`normalizeConfig: 非法 preset "${preset}"（允许 ${PRESETS.join('|')}）`)
  }

  // modes
  let modes
  if (r.modes === undefined) {
    modes = [...defaultConfig().modes]
  } else {
    if (!Array.isArray(r.modes)) throw new Error('normalizeConfig: modes 必须是数组')
    if (r.modes.length === 0) throw new Error('normalizeConfig: modes 不能为空数组')
    for (const m of r.modes) {
      if (typeof m !== 'string' || !SANDBOX_MODES.includes(m)) {
        throw new Error(`normalizeConfig: 非法沙箱模式 "${m}"（允许 ${SANDBOX_MODES.join('|')}）`)
      }
    }
    modes = [...r.modes]
  }

  // levels
  const levels = {}
  if (r.levels !== undefined && r.levels !== null) {
    if (!isPlainObject(r.levels)) throw new Error('normalizeConfig: levels 必须是对象')
    for (const key of Object.keys(r.levels)) {
      const val = r.levels[key]
      if (key === 'tools') {
        if (!isPlainObject(val)) throw new Error('normalizeConfig: levels.tools 必须是对象')
        levels.tools = {}
        for (const tool of Object.keys(val)) {
          if (!POLICIES.includes(val[tool])) {
            throw new Error(`normalizeConfig: levels.tools.${tool} 非法 policy "${val[tool]}"（允许 ${POLICIES.join('|')}）`)
          }
          levels.tools[tool] = val[tool]
        }
      } else {
        if (!POLICIES.includes(val)) {
          throw new Error(`normalizeConfig: levels.${key} 非法 policy "${val}"（允许 ${POLICIES.join('|')}）`)
        }
        levels[key] = val
      }
    }
  }

  // judge
  const jraw = r.judge === undefined || r.judge === null ? {} : r.judge
  if (!isPlainObject(jraw)) throw new Error('normalizeConfig: judge 必须是对象')
  const judge = {
    provider: jraw.provider === undefined ? '' : jraw.provider,
    model: jraw.model === undefined ? '' : jraw.model,
    systemPrompt: jraw.systemPrompt === undefined ? '' : jraw.systemPrompt,
    timeoutMs: jraw.timeoutMs === undefined ? 20000 : jraw.timeoutMs,
    maxTokens: jraw.maxTokens === undefined ? 256 : jraw.maxTokens,
    concurrency: jraw.concurrency === undefined ? 2 : jraw.concurrency,
  }
  for (const field of ['provider', 'model', 'systemPrompt']) {
    if (typeof judge[field] !== 'string') {
      throw new Error(`normalizeConfig: judge.${field} 必须是字符串`)
    }
  }
  for (const field of ['timeoutMs', 'maxTokens', 'concurrency']) {
    if (!isPositiveInt(judge[field])) {
      throw new Error(`normalizeConfig: judge.${field} 必须为正整数`)
    }
  }

  // includeSubagents
  const includeSubagents = r.includeSubagents === undefined ? true : r.includeSubagents
  if (typeof includeSubagents !== 'boolean') {
    throw new Error('normalizeConfig: includeSubagents 必须是布尔值')
  }

  // auditFile
  const auditFile = r.auditFile === undefined ? '' : r.auditFile
  if (typeof auditFile !== 'string') {
    throw new Error('normalizeConfig: auditFile 必须是字符串')
  }

  const config = { preset, modes, levels, judge, includeSubagents, auditFile }
  return deepFreeze(config)
}

/**
 * 解析一次升权请求的策略（design.md §4，优先级从高到低）：
 *   1. `levels.tools[toolName]` 存在 → 用它；
 *   2. `preset === 'custom'` → `levels[targetMode]`，缺省 `'delegate'`；
 *   3. 否则按内置预设表（PRESET_TABLE）。
 * @param {{preset: string, levels?: object, targetMode: string, toolName?: string}} param0
 * @returns {'allow'|'judge'|'delegate'|'deny'} 该请求适用的策略
 */
export function resolvePolicy({ preset, levels, targetMode, toolName } = {}) {
  if (typeof preset !== 'string' || !PRESETS.includes(preset)) {
    throw new Error(`resolvePolicy: 非法 preset "${preset}"（允许 ${PRESETS.join('|')}）`)
  }

  // 规则 1：逐工具覆盖优先于任何模式行 / 预设表。
  if (toolName !== undefined && toolName !== null && toolName !== '') {
    const tools = isPlainObject(levels) && isPlainObject(levels.tools) ? levels.tools : {}
    if (Object.prototype.hasOwnProperty.call(tools, toolName) && tools[toolName] !== undefined && tools[toolName] !== null) {
      const p = tools[toolName]
      if (!POLICIES.includes(p)) {
        throw new Error(`resolvePolicy: levels.tools.${toolName} 非法 policy "${p}"（允许 ${POLICIES.join('|')}）`)
      }
      return p
    }
  }

  // 规则 3：custom 预设读取 levels[targetMode]，缺省 delegate。
  if (preset === 'custom') {
    const p = readLevel(isPlainObject(levels) ? levels : {}, targetMode)
    if (p === undefined || p === null) return 'delegate'
    if (!POLICIES.includes(p)) {
      throw new Error(`resolvePolicy: levels.${targetMode} 非法 policy "${p}"（允许 ${POLICIES.join('|')}）`)
    }
    return p
  }

  // 规则 2：内置预设表。
  const table = PRESET_TABLE[preset]
  if (!Object.prototype.hasOwnProperty.call(table, targetMode)) {
    throw new Error(`resolvePolicy: 预设 "${preset}" 不支持的目标模式 "${targetMode}"`)
  }
  return table[targetMode]
}

/**
 * 提取文本中首个配平的 JSON 对象字面量（跨字符串字面量内的 `{}`）。
 * @param {string} text
 * @returns {string|null} 配平的 `{...}` 子串，无 `{` 或无法配平则 null
 */
function extractFirstBalancedObject(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 解析 LLM 裁判输出（design.md §4）：
 *   剥 ``` 代码围栏与首尾空白 → 提取首个配平 `{...}` → JSON.parse →
 *   校验 decision ∈ {allow,deny,unsure}（大小写不敏感归一）且 reason 为字符串（缺失补 ''）。
 *   任何失败返回 null。
 * @param {string} text 裁判原始输出
 * @returns {{decision:'allow'|'deny'|'unsure', reason:string}|null}
 */
export function parseJudgeOutput(text) {
  if (typeof text !== 'string') return null
  const cleaned = text.replace(/```/g, '').trim()
  const expr = extractFirstBalancedObject(cleaned)
  if (expr === null) return null

  let parsed
  try {
    parsed = JSON.parse(expr)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  if (typeof parsed.decision !== 'string') return null
  const decision = parsed.decision.toLowerCase()
  if (decision !== 'allow' && decision !== 'deny' && decision !== 'unsure') return null

  let reason = parsed.reason
  if (reason === undefined) reason = ''
  if (typeof reason !== 'string') return null

  return { decision, reason }
}

/**
 * 裁判失败/不确定时的回退决策（design.md §4，修正后返回值域 `'allowed-once'|'rejected'|'delegate'`）：
 *   strict + error        → 'rejected'
 *   permissive + unsure   → 'allowed-once'（文档警示）
 *   custom                → levels.error / levels.unsure：allow→'allowed-once'、deny→'rejected'、其余/缺省→'delegate'
 *   其他任何组合          → 'delegate'
 * 调用方将 'delegate' 视为 next()（转人工）。
 * @param {{preset: string, levels?: object, kind:'error'|'unsure'}} param0
 * @returns {'allowed-once'|'rejected'|'delegate'}
 */
export function judgeFallback({ preset, levels, kind } = {}) {
  if (typeof preset !== 'string' || !PRESETS.includes(preset)) {
    throw new Error(`judgeFallback: 非法 preset "${preset}"（允许 ${PRESETS.join('|')}）`)
  }

  const haveLevels = isPlainObject(levels) ? levels : {}

  // custom：按 error/unsure 独立映射。
  if (preset === 'custom') {
    const key = kind === 'error' || kind === 'unsure' ? kind : 'error'
    const v = readLevel(haveLevels, key)
    if (v === 'allow') return 'allowed-once'
    if (v === 'deny') return 'rejected'
    return 'delegate' // delegate / judge / 缺失 → 转人工
  }

  if (preset === 'strict' && kind === 'error') return 'rejected'
  if (preset === 'permissive' && kind === 'unsure') return 'allowed-once'
  return 'delegate'
}
