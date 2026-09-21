/**
 * dsh-yolo-mode —— 状态载荷装配单测（test/state.test.mjs）
 *
 * 覆盖 lib/state.js getStatusPayload：preset/judgeConfigured 推导、stats/recent
 * 浅拷贝，以及 v0.5.0 新增的 auditFile（resolveAuditFile 同一解析规则）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { getStatusPayload, recordDecision, stats } from '../lib/state.js'
import { defaultAuditFile } from '../lib/audit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('state: getStatusPayload 装配 preset/judgeConfigured/stats/recent', () => {
  const payload = getStatusPayload({
    preset: 'strict',
    judge: { provider: 'p', model: 'm' },
  })
  assert.equal(payload.preset, 'strict')
  assert.equal(payload.judgeConfigured, true)
  assert.equal(typeof payload.stats.total, 'number')
  assert.ok(Array.isArray(payload.recent))
  // 载荷是浅拷贝：外部改动不污染模块单例
  payload.stats.total = 9999
  assert.notEqual(getStatusPayload({}).stats.total, 9999)
})

test('state: judge 未配置 → judgeConfigured false', () => {
  assert.equal(getStatusPayload({ preset: 'off' }).judgeConfigured, false)
  assert.equal(getStatusPayload({ preset: 'strict', judge: { provider: 'p' } }).judgeConfigured, false)
  assert.equal(getStatusPayload({ preset: 'strict', judge: { model: 'm' } }).judgeConfigured, false)
})

test('state: getStatusPayload 携带 auditFile（显式配置优先，否则默认 tmp 路径）', () => {
  const explicit = path.join(__dirname, 'fixtures', 'judge.log')
  assert.equal(getStatusPayload({ preset: 'balanced', auditFile: explicit }).auditFile, explicit)
  assert.equal(getStatusPayload({ preset: 'balanced' }).auditFile, defaultAuditFile())
  assert.equal(getStatusPayload(undefined).auditFile, defaultAuditFile())
})

test('state: 裁判失败 → judgeFailures 递增、recent 带 error、judgeErrors 暴露 lastError', () => {
  const before = stats.judgeFailures
  recordDecision({
    time: 1234, toolName: 'bash', targetMode: 'workspace-write',
    decision: 'judge', outcome: 'delegate', error: 'BAD_OUTPUT',
  })
  assert.equal(stats.judgeFailures, before + 1)

  const payload = getStatusPayload({})
  assert.equal(payload.judgeErrors.count, stats.judgeFailures)
  assert.equal(payload.judgeErrors.lastError, 'BAD_OUTPUT')
  assert.equal(payload.judgeErrors.lastErrorTime, 1234)
  // recent 顶部条目带 error，且无 reason（裁判未产出）。
  assert.equal(payload.recent[0].error, 'BAD_OUTPUT')
  assert.equal(payload.recent[0].reason, undefined)
})

test('state: 成功裁决（无 error）→ recent 条目不含 error 字段、judgeFailures 不变', () => {
  const before = stats.judgeFailures
  recordDecision({
    time: 2345, toolName: 'bash', targetMode: 'workspace-write',
    decision: 'judge', outcome: 'allowed-once', reason: 'ok',
  })
  assert.equal(stats.judgeFailures, before)

  const top = getStatusPayload({}).recent[0]
  assert.equal('error' in top, false, '成功路径不应携带 error 字段（保持向后兼容）')
  assert.equal(top.reason, 'ok')
})
