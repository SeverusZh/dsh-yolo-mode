/**
 * dsh-yolo-mode —— M3 HTTP API / 状态装配 / mergeConfig 测试（design.md §11.5）。
 * 运行：node --test test/api.test.mjs（node --test 会一并跑 test/*.test.mjs）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { normalizeConfig, mergeConfig } from '../lib/policy.js'
import { buildStatus, createApiHandlers } from '../lib/index.js'

/* ------------------------------------------------------------------ *
 * 组 1：mergeConfig —— 三种语义
 * ------------------------------------------------------------------ */
test('mergeConfig: judge 子对象按字段合并', () => {
  const base = { preset: 'strict', judge: { provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 1000, maxTokens: 256, concurrency: 2 } }
  const out = mergeConfig(base, { judge: { timeoutMs: 5000 } })
  assert.equal(out.judge.timeoutMs, 5000)
  assert.equal(out.judge.provider, 'p')
  assert.equal(out.judge.model, 'm')
  assert.equal(out.judge.concurrency, 2)
})

test('mergeConfig: judge 覆盖层缺字段不会清空 base', () => {
  const base = { judge: { provider: 'p', model: 'm', timeoutMs: 1000 } }
  const out = mergeConfig(base, { judge: {} })
  assert.deepEqual(out.judge, { provider: 'p', model: 'm', timeoutMs: 1000 })
})

test('mergeConfig: modes 若 overlay 提供则整体替换', () => {
  const base = { preset: 'strict', modes: ['workspace-write'] }
  const out = mergeConfig(base, { modes: ['danger-full-access'] })
  assert.deepEqual(out.modes, ['danger-full-access'])
})

test('mergeConfig: levels 若 overlay 提供则整体替换（base 的 levels 被丢弃）', () => {
  const base = { modes: ['workspace-write'], levels: { tools: { pwsh: 'deny' } } }
  const out = mergeConfig(base, { levels: { 'danger-full-access': 'allow' } })
  assert.deepEqual(out.levels, { 'danger-full-access': 'allow' })
  assert.equal(Object.prototype.hasOwnProperty.call(out.levels, 'tools'), false)
})

test('mergeConfig: 顶层字段浅合并，未触碰的字段保留', () => {
  const base = { preset: 'balanced', includeSubagents: true, auditFile: 'x.log' }
  const out = mergeConfig(base, { preset: 'custom' })
  assert.equal(out.preset, 'custom')
  assert.equal(out.includeSubagents, true)
  assert.equal(out.auditFile, 'x.log')
})

test('mergeConfig: overlay 的 undefined 字段被跳过，非对象 judge 整体替换', () => {
  const base = { preset: 'strict', judge: { provider: 'p' } }
  // undefined → 未提供，保留 base
  const out = mergeConfig(base, { preset: undefined, judge: undefined })
  assert.equal(out.preset, 'strict')
  assert.deepEqual(out.judge, { provider: 'p' })
  // judge 非对象（如 null）→ 整体替换
  const out2 = mergeConfig(base, { judge: null })
  assert.equal(out2.judge, null)
})

/* ------------------------------------------------------------------ *
 * 组 2：buildStatus —— 装配正确
 * ------------------------------------------------------------------ */
test('buildStatus: 装配预设/modes/levels/judge/stats/recent', () => {
  const cfg = normalizeConfig({
    preset: 'strict',
    modes: ['workspace-write', 'danger-full-access'],
    judge: { provider: 'p', model: 'm', timeoutMs: 1000 },
  })
  const stats = { total: 3, allowed: 1, rejected: 1, delegated: 1 }
  const recent = [
    { time: 2, toolName: 'pwsh', targetMode: 'danger-full-access', decision: 'judge', outcome: 'rejected', reason: 'no' },
    { time: 1, toolName: 'write', targetMode: 'workspace-write', decision: 'judge', outcome: 'allowed-once' },
  ]
  const status = buildStatus(cfg, stats, recent)
  assert.equal(status.preset, 'strict')
  assert.deepEqual(status.modes, ['workspace-write', 'danger-full-access'])
  assert.deepEqual(status.stats, stats)
  assert.deepEqual(status.recent, recent)
  assert.equal(status.judgeConfigured, true)
  assert.deepEqual(status.judge, { provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 1000, maxTokens: 256, concurrency: 2 })
  // 浅拷贝：不共享引用
  stats.allowed += 1
  assert.equal(status.stats.allowed, 1)
  status.modes.push('x')
  assert.deepEqual(cfg.modes, ['workspace-write', 'danger-full-access'])
})

test('buildStatus: judgeConfigured 在 provider/model 为空时为 false', () => {
  const cfg = normalizeConfig({ preset: 'balanced' })
  const status = buildStatus(cfg, { total: 0, allowed: 0, rejected: 0, delegated: 0 }, [])
  assert.equal(status.judgeConfigured, false)
})

/* ------------------------------------------------------------------ *
 * 组 3：createApiHandlers —— fake req/res
 * ------------------------------------------------------------------ */
function fakeReq(method, body) {
  const req = new EventEmitter()
  req.method = method
  queueMicrotask(() => {
    if (body !== undefined) req.emit('data', Buffer.from(body, 'utf8'))
    req.emit('end')
  })
  return req
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '' }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = (chunk) => { res.body = chunk === undefined ? '' : String(chunk) }
  return res
}

function parseRes(res) {
  return JSON.parse(res.body)
}

test('statusHandler: GET 200 返回 buildStatus 结果', async () => {
  const status = { preset: 'strict', modes: ['workspace-write'], levels: {}, judge: { provider: '', model: '' }, judgeConfigured: false, stats: { total: 0, allowed: 0, rejected: 0, delegated: 0 }, recent: [] }
  const { statusHandler } = createApiHandlers({ getStatus: () => status, applyConfig: async () => {} })
  const res = fakeRes()
  await statusHandler(fakeReq('GET'), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(parseRes(res), status)
})

test('statusHandler: 非 GET → 405', async () => {
  const { statusHandler } = createApiHandlers({ getStatus: () => ({}), applyConfig: async () => {} })
  const res = fakeRes()
  await statusHandler(fakeReq('POST'), res)
  assert.equal(res.statusCode, 405)
})

test('configHandler: POST 合法 → 200 且 applyConfig 被调用', async () => {
  let applied = null
  const getStatus = () => ({ preset: 'strict', config: { preset: 'strict' } })
  const applyConfig = async (section) => { applied = section }
  const { configHandler } = createApiHandlers({
    getStatus,
    applyConfig,
    getSettings: () => ({}),
    rowCfg: {},
  })
  const body = JSON.stringify({ preset: 'strict' })
  const res = fakeRes()
  await configHandler(fakeReq('POST', body), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(applied, { preset: 'strict' })
  const parsed = parseRes(res)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.config, { preset: 'strict' })
})

test('configHandler: 非法 preset → 400 + 错误信息，不调用 applyConfig', async () => {
  let called = false
  const { configHandler } = createApiHandlers({
    getStatus: () => ({}),
    applyConfig: async () => { called = true },
    getSettings: () => ({}),
    rowCfg: {},
  })
  const res = fakeRes()
  await configHandler(fakeReq('POST', JSON.stringify({ preset: 'nonsense' })), res)
  assert.equal(res.statusCode, 400)
  assert.equal(called, false)
  const parsed = parseRes(res)
  assert.equal(parsed.ok, false)
  assert.match(parsed.error, /preset/)
})

test('configHandler: 非 JSON body → 400', async () => {
  const { configHandler } = createApiHandlers({
    getStatus: () => ({}),
    applyConfig: async () => {},
    getSettings: () => ({}),
    rowCfg: {},
  })
  const res = fakeRes()
  await configHandler(fakeReq('POST', 'not-a-json'), res)
  assert.equal(res.statusCode, 400)
  const parsed = parseRes(res)
  assert.equal(parsed.ok, false)
})

test('configHandler: 超长 body → 413', async () => {
  const { configHandler } = createApiHandlers({
    getStatus: () => ({}),
    applyConfig: async () => {},
    getSettings: () => ({}),
    rowCfg: {},
  })
  const res = fakeRes()
  const big = JSON.stringify({ preset: 'strict', pad: 'x'.repeat(70 * 1024) })
  await configHandler(fakeReq('POST', big), res)
  assert.equal(res.statusCode, 413)
})

test('configHandler: PUT → 405', async () => {
  const { configHandler } = createApiHandlers({ getStatus: () => ({}), applyConfig: async () => {} })
  const res = fakeRes()
  await configHandler(fakeReq('PUT', ''), res)
  assert.equal(res.statusCode, 405)
})

test('configHandler: applyConfig 抛错 → 500', async () => {
  const { configHandler } = createApiHandlers({
    getStatus: () => ({}),
    applyConfig: async () => { throw new Error('persist boom') },
    getSettings: () => ({}),
    rowCfg: {},
  })
  const res = fakeRes()
  await configHandler(fakeReq('POST', JSON.stringify({ preset: 'strict' })), res)
  assert.equal(res.statusCode, 500)
  const parsed = parseRes(res)
  assert.equal(parsed.ok, false)
  assert.match(parsed.error, /persist boom/)
})
