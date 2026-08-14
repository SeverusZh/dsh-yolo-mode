/**
 * dsh-yolo-mode —— 策略层单测（design.md §7 矩阵第 1 组，覆盖 §4）。
 * 运行：node --test test/policy.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PRESETS,
  POLICIES,
  ESCALATION_RE,
  normalizeConfig,
  resolvePolicy,
  parseJudgeOutput,
  judgeFallback,
} from '../lib/policy.js'

/* ------------------------------------------------------------------ *
 * 组 1：normalizeConfig —— 全默认 / 非法值 fail-loud / 冻结输出
 * ------------------------------------------------------------------ */
test('normalizeConfig: 全默认合并', () => {
  const cfg = normalizeConfig(undefined)
  assert.deepEqual(cfg.preset, 'balanced')
  assert.deepEqual(cfg.modes, ['workspace-write'])
  assert.deepEqual(cfg.levels, {})
  assert.deepEqual(cfg.judge, {
    provider: '',
    model: '',
    systemPrompt: '',
    timeoutMs: 20000,
    maxTokens: 256,
    concurrency: 2,
  })
  assert.equal(cfg.includeSubagents, true)
  assert.equal(cfg.auditFile, '')
})

test('normalizeConfig: 部分字段会被默认合并补全', () => {
  const cfg = normalizeConfig({ judge: { timeoutMs: 5000 } })
  assert.equal(cfg.preset, 'balanced')
  assert.deepEqual(cfg.modes, ['workspace-write'])
  assert.equal(cfg.judge.timeoutMs, 5000)
  assert.equal(cfg.judge.maxTokens, 256)
  assert.equal(cfg.judge.concurrency, 2)
  assert.equal(cfg.includeSubagents, true)
})

test('normalizeConfig: 非法 preset 抛错', () => {
  assert.throws(() => normalizeConfig({ preset: 'nonsense' }))
  assert.throws(() => normalizeConfig({ preset: 'YOLO' }))
  assert.throws(() => normalizeConfig({ preset: 3 }))
})

test('normalizeConfig: modes 非数组/含非法模式抛错', () => {
  assert.throws(() => normalizeConfig({ modes: 'write' }))
  assert.throws(() => normalizeConfig({ modes: ['workspace-write', 'quantum'] }))
  assert.throws(() => normalizeConfig({ modes: [] }))
})

test('normalizeConfig: levels 非法 policy 抛错', () => {
  assert.throws(() => normalizeConfig({ levels: { 'danger-full-access': 'auto' } }))
  assert.throws(() => normalizeConfig({ levels: { tools: { pwsh: 'maybe' } } }))
  assert.throws(() => normalizeConfig({ levels: { tools: 'nope' } }))
})

test('normalizeConfig: judge 字段非法抛错', () => {
  assert.throws(() => normalizeConfig({ judge: { timeoutMs: 0 } }))
  assert.throws(() => normalizeConfig({ judge: { timeoutMs: -1 } }))
  assert.throws(() => normalizeConfig({ judge: { timeoutMs: 1.5 } }))
  assert.throws(() => normalizeConfig({ judge: { maxTokens: '256' } }))
  assert.throws(() => normalizeConfig({ judge: { concurrency: 0 } }))
  assert.throws(() => normalizeConfig({ judge: { provider: 42 } }))
})

test('normalizeConfig: includeSubagents 非布尔抛错', () => {
  assert.throws(() => normalizeConfig({ includeSubagents: 'yes' }))
  assert.throws(() => normalizeConfig({ includeSubagents: 1 }))
})

test('normalizeConfig: 输出为深冻结对象', () => {
  const cfg = normalizeConfig({ levels: { tools: { pwsh: 'deny' } }, modes: ['workspace-write', 'danger-full-access'] })
  assert.equal(Object.isFrozen(cfg), true)
  assert.equal(Object.isFrozen(cfg.modes), true)
  assert.equal(Object.isFrozen(cfg.judge), true)
  assert.equal(Object.isFrozen(cfg.levels), true)
  assert.equal(Object.isFrozen(cfg.levels.tools), true)
})

test('normalizeConfig: 合法 levels.tools 与 modes 通过', () => {
  const cfg = normalizeConfig({
    preset: 'custom',
    levels: { 'danger-full-access': 'deny', tools: { pwsh: 'allow', write: 'judge' } },
    modes: ['workspace-write'],
  })
  assert.deepEqual(cfg.levels['danger-full-access'], 'deny')
  assert.deepEqual(cfg.levels.tools.pwsh, 'allow')
  assert.deepEqual(cfg.levels.tools.write, 'judge')
})

/* ------------------------------------------------------------------ *
 * 组 2：resolvePolicy —— 预设全表 / tools 覆盖优先 / custom 缺省
 * ------------------------------------------------------------------ */
test('resolvePolicy: 内置预设全表（含 custom 相对规则）', () => {
  // off / strict / balanced / permissive / yolo 五个内置预设 × 2 目标模式
  const expect = {
    off: { 'workspace-write': 'delegate', 'danger-full-access': 'delegate' },
    strict: { 'workspace-write': 'judge', 'danger-full-access': 'delegate' },
    balanced: { 'workspace-write': 'judge', 'danger-full-access': 'judge' },
    permissive: { 'workspace-write': 'judge', 'danger-full-access': 'judge' },
    yolo: { 'workspace-write': 'allow', 'danger-full-access': 'allow' },
  }
  for (const preset of Object.keys(expect)) {
    for (const mode of ['workspace-write', 'danger-full-access']) {
      assert.equal(
        resolvePolicy({ preset, levels: {}, targetMode: mode }),
        expect[preset][mode],
        `${preset}/${mode}`,
      )
    }
  }

  // custom + 缺省 levels → delegate（两种模式均缺省）
  assert.equal(resolvePolicy({ preset: 'custom', levels: {}, targetMode: 'workspace-write' }), 'delegate')
  assert.equal(resolvePolicy({ preset: 'custom', levels: {}, targetMode: 'danger-full-access' }), 'delegate')
})

test('resolvePolicy: levels.tools 覆盖优先于模式行/预设', () => {
  const levels = { tools: { pwsh: 'allow' }, 'danger-full-access': 'deny' }
  // strict 的 danger-full-access 行是 delegate，但 tools.pwsh=allow 抢在此之前
  assert.equal(resolvePolicy({ preset: 'strict', levels, targetMode: 'danger-full-access', toolName: 'pwsh' }), 'allow')
  // permissive 的 workspace-write 行是 judge，tools.pwsh=allow 被覆盖为 allow
  assert.equal(resolvePolicy({ preset: 'permissive', levels, targetMode: 'workspace-write', toolName: 'pwsh' }), 'allow')
  // 工具不同 → 回落到 preset 表
  assert.equal(resolvePolicy({ preset: 'strict', levels, targetMode: 'workspace-write', toolName: 'write' }), 'judge')
})

test('resolvePolicy: custom 用 levels[targetMode]，缺省 delegate', () => {
  const levels = { 'workspace-write': 'allow', 'danger-full-access': 'deny' }
  assert.equal(resolvePolicy({ preset: 'custom', levels, targetMode: 'workspace-write' }), 'allow')
  assert.equal(resolvePolicy({ preset: 'custom', levels, targetMode: 'danger-full-access' }), 'deny')
  // 未配置的目标 → delegate
  assert.equal(resolvePolicy({ preset: 'custom', levels, targetMode: 'other' }), 'delegate')
})

test('resolvePolicy: custom 中 tools 仍优先', () => {
  const levels = { 'workspace-write': 'deny', tools: { pwsh: 'judge' } }
  assert.equal(resolvePolicy({ preset: 'custom', levels, targetMode: 'workspace-write', toolName: 'pwsh' }), 'judge')
  assert.equal(resolvePolicy({ preset: 'custom', levels, targetMode: 'workspace-write' }), 'deny')
})

/* ------------------------------------------------------------------ *
 * 组 3：parseJudgeOutput —— 合法三态 / 围栏 / 噪声 / 非法 → null
 * ------------------------------------------------------------------ */
test('parseJudgeOutput: 合法三态', () => {
  assert.deepEqual(parseJudgeOutput('{"decision":"allow","reason":"ok"}'), { decision: 'allow', reason: 'ok' })
  assert.deepEqual(parseJudgeOutput('{"decision":"deny","reason":"risky"}'), { decision: 'deny', reason: 'risky' })
  assert.deepEqual(parseJudgeOutput('{"decision":"unsure","reason":"unclear"}'), { decision: 'unsure', reason: 'unclear' })
})

test('parseJudgeOutput: reason 缺失补空串', () => {
  assert.deepEqual(parseJudgeOutput('{"decision":"allow"}'), { decision: 'allow', reason: '' })
})

test('parseJudgeOutput: 代码围栏包裹', () => {
  const out = parseJudgeOutput('```json\n{"decision":"deny","reason":"写入系统目录"}\n```')
  assert.deepEqual(out, { decision: 'deny', reason: '写入系统目录' })
  const out2 = parseJudgeOutput('```\n{"decision":"unsure","reason":"?"}\n```')
  assert.deepEqual(out2, { decision: 'unsure', reason: '?' })
})

test('parseJudgeOutput: 前后噪声文本仍提取首个对象', () => {
  const out = parseJudgeOutput('思考……\n随机前缀\n{"decision":"allow","reason":"安全"} 后记')
  assert.deepEqual(out, { decision: 'allow', reason: '安全' })
})

test('parseJudgeOutput: 含嵌套对象与字符串内大括号', () => {
  // 字符串值里含一对 `{}`，配平提取不应被误导
  const out = parseJudgeOutput('{"decision":"deny","reason":"目标包含 {未授权} 操作"}')
  assert.deepEqual(out, { decision: 'deny', reason: '目标包含 {未授权} 操作' })
})

test('parseJudgeOutput: 非法 JSON → null', () => {
  assert.equal(parseJudgeOutput('{"decision":"allow", malformed'), null)
  assert.equal(parseJudgeOutput('not a json at all'), null)
  assert.equal(parseJudgeOutput(''), null)
})

test('parseJudgeOutput: decision 非法 → null / reason 非字符串 → null', () => {
  assert.equal(parseJudgeOutput('{"decision":"grant","reason":"x"}'), null)
  assert.equal(parseJudgeOutput('{"decision":"allow","reason":123}'), null)
  assert.equal(parseJudgeOutput('{"decision":1,"reason":"x"}'), null)
})

test('parseJudgeOutput: 大写归一', () => {
  assert.deepEqual(parseJudgeOutput('{"decision":"ALLOW","reason":"大写"}'), { decision: 'allow', reason: '大写' })
  assert.deepEqual(parseJudgeOutput('{"decision":"Deny","reason":"x"}'), { decision: 'deny', reason: 'x' })
  assert.deepEqual(parseJudgeOutput('{"decision":"UNSURE","reason":"x"}'), { decision: 'unsure', reason: 'x' })
})

test('parseJudgeOutput: 非字符串输入 → null', () => {
  assert.equal(parseJudgeOutput(undefined), null)
  assert.equal(parseJudgeOutput(null), null)
  assert.equal(parseJudgeOutput(42), null)
})

/* ------------------------------------------------------------------ *
 * 组 4：judgeFallback —— 各预设 × kind 组合与 custom 映射
 * ------------------------------------------------------------------ */
test('judgeFallback: strict + error → rejected', () => {
  assert.equal(judgeFallback({ preset: 'strict', levels: {}, kind: 'error' }), 'rejected')
})

test('judgeFallback: permissive + unsure → allowed-once', () => {
  assert.equal(judgeFallback({ preset: 'permissive', levels: {}, kind: 'unsure' }), 'allowed-once')
})

test('judgeFallback: balanced 组合 → delegate', () => {
  assert.equal(judgeFallback({ preset: 'balanced', levels: {}, kind: 'error' }), 'delegate')
  assert.equal(judgeFallback({ preset: 'balanced', levels: {}, kind: 'unsure' }), 'delegate')
})

test('judgeFallback: 其他预设组合 → delegate', () => {
  // off / yolo 系列全部 delegate
  assert.equal(judgeFallback({ preset: 'off', levels: {}, kind: 'error' }), 'delegate')
  assert.equal(judgeFallback({ preset: 'off', levels: {}, kind: 'unsure' }), 'delegate')
  assert.equal(judgeFallback({ preset: 'yolo', levels: {}, kind: 'error' }), 'delegate')
  assert.equal(judgeFallback({ preset: 'yolo', levels: {}, kind: 'unsure' }), 'delegate')
  // strict + unsure → delegate（只有 strict+error 拒绝）
  assert.equal(judgeFallback({ preset: 'strict', levels: {}, kind: 'unsure' }), 'delegate')
  // permissive + error → delegate（只有 permissive+unsure 放行）
  assert.equal(judgeFallback({ preset: 'permissive', levels: {}, kind: 'error' }), 'delegate')
})

test('judgeFallback: custom levels.error / levels.unsure 映射', () => {
  const levels = {
    error: 'allow', // allow → allowed-once
    unsure: 'deny', // deny → rejected
  }
  assert.equal(judgeFallback({ preset: 'custom', levels, kind: 'error' }), 'allowed-once')
  assert.equal(judgeFallback({ preset: 'custom', levels, kind: 'unsure' }), 'rejected')

  // 反向组合
  const levels2 = { error: 'deny', unsure: 'allow' }
  assert.equal(judgeFallback({ preset: 'custom', levels: levels2, kind: 'error' }), 'rejected')
  assert.equal(judgeFallback({ preset: 'custom', levels: levels2, kind: 'unsure' }), 'allowed-once')

  // 缺失 → delegate
  assert.equal(judgeFallback({ preset: 'custom', levels: {}, kind: 'error' }), 'delegate')
  assert.equal(judgeFallback({ preset: 'custom', levels: {}, kind: 'unsure' }), 'delegate')
  // 显式 delegate → delegate
  assert.equal(judgeFallback({ preset: 'custom', levels: { error: 'delegate' }, kind: 'error' }), 'delegate')
})

/* ------------------------------------------------------------------ *
 * 追加：导出常量冻结与 ESCALATION_RE 语义
 * ------------------------------------------------------------------ */
test('导出常量冻结且枚举齐全', () => {
  assert.equal(Object.isFrozen(PRESETS), true)
  assert.equal(Object.isFrozen(POLICIES), true)
  assert.deepEqual(PRESETS, ['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'])
  assert.deepEqual(POLICIES, ['allow', 'judge', 'delegate', 'deny'])
})

test('ESCALATION_RE 匹配升权 reason 并捕获目标模式与理由文本', () => {
  const m1 = 'escalate sandbox to danger-full-access: 需要写系统配置'
  const r1 = m1.match(ESCALATION_RE)
  assert.ok(r1)
  assert.equal(r1[1], 'danger-full-access')
  assert.equal(r1[2], '需要写系统配置')

  const m2 = 'escalate sandbox to workspace-write: 修改工作区文件'
  const r2 = m2.match(ESCALATION_RE)
  assert.ok(r2)
  assert.equal(r2[1], 'workspace-write')
  assert.equal(r2[2], '修改工作区文件')

  // 非升权原因不匹配
  assert.equal('写文件吧'.match(ESCALATION_RE), null)
  assert.equal('escalate sandbox to administrator: hi'.match(ESCALATION_RE), null)
})
