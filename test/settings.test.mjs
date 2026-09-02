/**
 * dsh-yolo-mode —— 设置分区单测（test/settings.test.mjs）
 *
 * 覆盖 design.md §12.2/12.7：validateYoloSettings（= normalizeConfig）合法值通过、
 * 非法值抛错；命名空间与 schema 导出形状。
 *
 * 运行：node --test test/settings.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  YOLO_SETTINGS_NAMESPACE,
  YoloSettingsSchema,
  validateYoloSettings,
} from '../lib/settings.js'

test('命名空间为 yolo-mode（alpha.4 起为纯 kebab-case 字符串字面量）', () => {
  assert.equal(YOLO_SETTINGS_NAMESPACE, 'yolo-mode')
})

test('validateYoloSettings: 合法值通过（空分区 → 全默认）', () => {
  const cfg = validateYoloSettings({})
  assert.equal(cfg.preset, 'balanced')
  assert.deepEqual(cfg.modes, ['workspace-write'])
  assert.equal(cfg.judge.timeoutMs, 20000)
  assert.equal(cfg.includeSubagents, true)
})

test('validateYoloSettings: 完整合法配置通过', () => {
  const cfg = validateYoloSettings({
    preset: 'strict',
    modes: ['workspace-write', 'danger-full-access'],
    levels: { 'danger-full-access': 'deny', tools: { pwsh: 'allow' } },
    judge: { provider: 'p', model: 'm', systemPrompt: 'x', timeoutMs: 5000, maxTokens: 128, concurrency: 3 },
    includeSubagents: false,
    auditFile: '/tmp/a.log',
  })
  assert.equal(cfg.preset, 'strict')
  assert.deepEqual(cfg.modes, ['workspace-write', 'danger-full-access'])
  assert.equal(cfg.levels['danger-full-access'], 'deny')
  assert.equal(cfg.levels.tools.pwsh, 'allow')
  assert.equal(cfg.judge.timeoutMs, 5000)
  assert.equal(cfg.includeSubagents, false)
  assert.equal(cfg.auditFile, '/tmp/a.log')
})

test('validateYoloSettings: 非法 preset 抛错', () => {
  assert.throws(() => validateYoloSettings({ preset: 'nonsense' }), /preset/)
})

test('validateYoloSettings: judge.timeoutMs 非正整数抛错', () => {
  assert.throws(() => validateYoloSettings({ judge: { timeoutMs: 0 } }), /timeoutMs/)
  assert.throws(() => validateYoloSettings({ judge: { timeoutMs: -1 } }), /timeoutMs/)
  assert.throws(() => validateYoloSettings({ judge: { timeoutMs: 1.5 } }), /timeoutMs/)
})

test('validateYoloSettings: modes 非法抛错', () => {
  assert.throws(() => validateYoloSettings({ modes: ['quantum'] }), /非法沙箱模式/)
})

test('validateYoloSettings: 空 modes 视为未设 → 回落默认（schema 默认空数组容错）', () => {
  const cfg = validateYoloSettings({ modes: [] })
  assert.deepEqual(cfg.modes, ['workspace-write'])
})

test('validateYoloSettings: 回归——schema 解析形状（空集合默认 + 部分 judge）不抛错', () => {
  // 注册时 resolve(base+默认值) 的形状：array/dict 缺省为 []/{}，标量缺省 absent
  const cfg = validateYoloSettings({
    preset: 'balanced',
    modes: [],
    levels: {},
    judge: { provider: 'opencode-go', model: 'deepseek-v4-flash', concurrency: 2 },
  })
  assert.equal(cfg.preset, 'balanced')
  assert.deepEqual(cfg.modes, ['workspace-write'])
  assert.equal(cfg.judge.provider, 'opencode-go')
  assert.equal(cfg.judge.timeoutMs, 20000) // 缺失字段回落 normalizeConfig 默认
})

test('validateYoloSettings: 输出为冻结对象', () => {
  const cfg = validateYoloSettings({})
  assert.equal(Object.isFrozen(cfg), true)
  assert.equal(Object.isFrozen(cfg.modes), true)
  assert.equal(Object.isFrozen(cfg.judge), true)
})

test('YoloSettingsSchema 为可用 schemastery Schema（object 派生的可调用实例）', () => {
  assert.ok(YoloSettingsSchema)
  assert.equal(typeof YoloSettingsSchema, 'function')
})
