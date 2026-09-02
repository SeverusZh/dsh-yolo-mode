/**
 * dsh-yolo-mode —— 桥接请求处理器单测（test/remote-bridge.test.mjs）
 *
 * 覆盖 design.md §12.4/12.7：信封处理器（fake req/res + fake settings seam）
 * 的 404/415/403/400/200-bad-request×2、settingsView 装配、
 * settingsMutate 成功/conflict/rejected、statusView 装配、openLogFile
 * （存在 → 注入 openFile 被调 / 不存在 → log-not-found / 默认路径回落）。
 *
 * fake settings seam：{writable, describe:()=>[view], mutate: async (ns,ops,rev)=>{...}}，
 * conflict 场景抛 @deepseek-ai/dsh-settings 的 SettingsConflictError 实例。
 *
 * 运行：node --test test/remote-bridge.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { SettingsConflictError } from '@deepseek-ai/dsh-settings'

import {
  YOLO_RPC_CHANNEL,
  YOLO_RPC_VIEW,
  YOLO_RPC_MUTATE,
  YOLO_RPC_STATUS,
  YOLO_RPC_OPEN_LOG,
  handleYoloBridgeRequest,
} from '../lib/remote.js'
import { YOLO_SETTINGS_NAMESPACE } from '../lib/settings.js'

const NS = 'yolo-mode'
// alpha.4：settingsNamespace() 品牌函数已删除，命名空间为纯 kebab-case 字符串字面量。
const yoloNs = NS

/* ------------------------------------------------------------------ *
 * 辅助：fake req / fake res / fake settings seam
 * ------------------------------------------------------------------ */

const DEFAULT_HEADERS = {
  'content-type': 'application/json',
  host: 'localhost:3080',
}

/**
 * 构造 fake IncomingMessage（EventEmitter，可写字段）。
 * @param {object} opts { method, url, headers, body? }
 */
function fakeReq({ method = 'POST', url = YOLO_RPC_CHANNEL + '/' + YOLO_RPC_VIEW, headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = { ...DEFAULT_HEADERS, ...headers }
  if (body !== undefined) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body, 'utf8'))
      req.emit('end')
    })
  } else {
    queueMicrotask(() => req.emit('end'))
  }
  return req
}

/** 构造 fake ServerResponse（可写对象）。 */
function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '', headersSent: false, destroyed: false }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = (chunk) => { res.body = chunk === undefined ? '' : String(chunk) }
  res.destroy = () => { res.destroyed = true }
  return res
}

/** 解析 JSON 响应体。 */
function parseRes(res) {
  return JSON.parse(res.body)
}

/** 构造 yolo-mode 命名空间的 settings 描述符。 */
function makeView({ revision = 0, value = { preset: 'balanced' }, base, user } = {}) {
  return {
    ns: yoloNs,
    schema: { type: 'object' },
    value,
    applies: 'live',
    secrets: [],
    revision,
    ...(base !== undefined ? { base } : {}),
    ...(user !== undefined ? { user } : {}),
  }
}

/** 包一个合法的 client-request 信封为 JSON 字符串。 */
function envelope(method, payload) {
  return JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload })
}

/**
 * 构造 fake settings seam。
 * @param {object} opts { writable, view, onMutate }
 *   onMutate:(ns,ops,expectedRevision,state)=>void|Promise 可抛 SettingsConflictError / Error
 */
function makeFakeSettings({ writable = true, view, onMutate } = {}) {
  const state = { view: view ?? makeView() }
  const settings = {
    writable,
    describe: () => [state.view],
    mutate: async (ns, ops, expectedRevision) => {
      if (onMutate) return onMutate(ns, ops, expectedRevision, state)
    },
  }
  return { settings, state }
}

const getStatusPayload = () => ({
  preset: 'strict',
  judgeConfigured: true,
  stats: { total: 4, allowed: 1, rejected: 2, delegated: 1 },
  recent: [
    { time: 3, toolName: 'pwsh', targetMode: 'danger-full-access', decision: 'judge', outcome: 'rejected', reason: 'no' },
  ],
})

/* ------------------------------------------------------------------ *
 * 载波错误路径
 * ------------------------------------------------------------------ */
test('非 POST → 404', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(settings, getStatusPayload, fakeReq({ method: 'GET' }), res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body, 'not found')
})

test('content-type 非 application/json → 415', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({ headers: { 'content-type': 'text/plain' } }),
    res,
  )
  assert.equal(res.statusCode, 415)
  assert.match(res.body, /content type must be application\/json/)
})

test('Host 非 loopback → 403', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({ headers: { host: 'evil.example.com' } }),
    res,
  )
  assert.equal(res.statusCode, 403)
  assert.equal(res.body, 'forbidden')
})

test('body 非法 JSON → 400', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(settings, getStatusPayload, fakeReq({ body: 'not-a-json{' }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body, 'body is not JSON')
})

test('信封非法（缺 type/rpcId/method）→ 200 bad-request（固定 rpcId invalid-request）', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(settings, getStatusPayload, fakeReq({ body: '{}' }), res)
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.type, 'server-response')
  assert.equal(parsed.rpcId, 'invalid-request')
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'bad-request')
})

test('method 与端点不符 → 200 bad-request（回显调用方 rpcId）', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  // url 指向 settingsView，但信封 method 写 statusView → 不符。
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({ url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_STATUS, body: envelope(YOLO_RPC_VIEW, {}) }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.rpcId, 'r1')
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'bad-request')
  assert.match(parsed.result.error.message, /does not match endpoint/)
})

/* ------------------------------------------------------------------ *
 * settingsView
 * ------------------------------------------------------------------ */
test('settingsView → 200 { writable, view }', async () => {
  const value = { preset: 'strict', judge: { provider: 'p', model: 'm' } }
  const { settings } = makeFakeSettings({
    writable: true,
    view: makeView({ revision: 7, value, user: { preset: 'strict' }, base: { preset: 'balanced' } }),
  })
  const res = fakeRes()
  await handleYoloBridgeRequest(settings, getStatusPayload, fakeReq({ body: envelope(YOLO_RPC_VIEW, {}) }), res)
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.rpcId, 'r1')
  assert.equal(parsed.result.ok, true)
  assert.equal(parsed.result.value.writable, true)
  assert.equal(parsed.result.value.view.ns, NS)
  assert.equal(parsed.result.value.view.revision, 7)
  assert.deepEqual(parsed.result.value.view.value, value)
  assert.deepEqual(parsed.result.value.view.user, { preset: 'strict' })
})

/* ------------------------------------------------------------------ *
 * settingsMutate
 * ------------------------------------------------------------------ */
test('settingsMutate 成功 → 200 新 redacted view（revision 推进）', async () => {
  const { settings } = makeFakeSettings({
    view: makeView({ revision: 0, value: { preset: 'balanced' } }),
    onMutate: (ns, ops, expectedRevision, state) => {
      assert.equal(ns, yoloNs)
      assert.deepEqual(ops, [{ op: 'set', path: ['preset'], value: 'strict' }])
      assert.equal(expectedRevision, 0)
      // 模拟 seam 推进：describe 返回新 descriptor。
      state.view = makeView({
        revision: 1,
        value: { preset: 'strict' },
        user: { preset: 'strict' },
        base: { preset: 'balanced' },
      })
    },
  })
  const res = fakeRes()
  const mutateUrl = YOLO_RPC_CHANNEL + '/' + YOLO_RPC_MUTATE
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({
      url: mutateUrl,
      body: envelope(YOLO_RPC_MUTATE, { ns: NS, ops: [{ op: 'set', path: ['preset'], value: 'strict' }], expectedRevision: 0 }),
    }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, true)
  assert.equal(parsed.result.value.revision, 1)
  assert.deepEqual(parsed.result.value.value, { preset: 'strict' })
})

test('settingsMutate 冲突（SettingsConflictError）→ 200 settings-conflict（expected/actual）', async () => {
  const { settings } = makeFakeSettings({
    view: makeView({ revision: 1 }),
    onMutate: () => {
      throw new SettingsConflictError(yoloNs, 0, 1)
    },
  })
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({
      url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_MUTATE,
      body: envelope(YOLO_RPC_MUTATE, { ns: NS, ops: [], expectedRevision: 0 }),
    }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'settings-conflict')
  assert.equal(parsed.result.error.details.ns, NS)
  assert.equal(parsed.result.error.details.expected, 0)
  assert.equal(parsed.result.error.details.actual, 1)
})

test('settingsMutate 其他拒绝（普通 Error） → 200 settings-rejected', async () => {
  const { settings } = makeFakeSettings({
    view: makeView(),
    onMutate: () => {
      throw new Error('read-only provider refused')
    },
  })
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({
      url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_MUTATE,
      body: envelope(YOLO_RPC_MUTATE, { ns: NS, ops: [], expectedRevision: 0 }),
    }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'settings-rejected')
  assert.equal(parsed.result.error.details.ns, NS)
  assert.match(parsed.result.error.message, /read-only provider refused/)
})

test('settingsMutate ns 不符 → 200 bad-request', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({
      url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_MUTATE,
      body: envelope(YOLO_RPC_MUTATE, { ns: 'other-ns', ops: [], expectedRevision: 0 }),
    }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'bad-request')
  assert.match(parsed.result.error.message, /expected ns/)
})

/* ------------------------------------------------------------------ *
 * statusView
 * ------------------------------------------------------------------ */
test('statusView → 200 getStatusPayload() 装配结果', async () => {
  const { settings } = makeFakeSettings()
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({ url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_STATUS, body: envelope(YOLO_RPC_STATUS, {}) }),
    res,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, true)
  assert.deepEqual(parsed.result.value, getStatusPayload())
})

/* ------------------------------------------------------------------ *
 * openLogFile
 * ------------------------------------------------------------------ */

/** 临时目录里建一个真实存在的审计日志文件（测试后清理）。 */
function makeTempLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-yolo-test-'))
  const file = path.join(dir, 'judge.log')
  fs.writeFileSync(file, '{"time":1}\n', 'utf8')
  return { dir, file }
}

test('openLogFile 文件存在 → 200 ok，注入的 openFile 收到解析路径', async () => {
  const { dir, file } = makeTempLog()
  try {
    const { settings } = makeFakeSettings({
      view: makeView({ revision: 0, value: { preset: 'balanced', auditFile: file } }),
    })
    let opened = null
    const openFile = async (target) => {
      opened = target
      return { ok: true, value: { path: target } }
    }
    const res = fakeRes()
    await handleYoloBridgeRequest(
      settings,
      getStatusPayload,
      fakeReq({ url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_OPEN_LOG, body: envelope(YOLO_RPC_OPEN_LOG, {}) }),
      res,
      openFile,
    )
    assert.equal(res.statusCode, 200)
    const parsed = parseRes(res)
    assert.equal(parsed.result.ok, true)
    assert.equal(opened, file, 'openFile 应收到 settings view 解析出的 auditFile')
    assert.equal(parsed.result.value.path, file)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('openLogFile 文件不存在 → 200 log-not-found（不调用 openFile）', async () => {
  const missing = path.join(os.tmpdir(), 'dsh-yolo-test-missing-' + Date.now() + '.log')
  const { settings } = makeFakeSettings({
    view: makeView({ revision: 0, value: { preset: 'balanced', auditFile: missing } }),
  })
  let opened = null
  const openFile = async (target) => {
    opened = target
    return { ok: true, value: { path: target } }
  }
  const res = fakeRes()
  await handleYoloBridgeRequest(
    settings,
    getStatusPayload,
    fakeReq({ url: YOLO_RPC_CHANNEL + '/' + YOLO_RPC_OPEN_LOG, body: envelope(YOLO_RPC_OPEN_LOG, {}) }),
    res,
    openFile,
  )
  assert.equal(res.statusCode, 200)
  const parsed = parseRes(res)
  assert.equal(parsed.result.ok, false)
  assert.equal(parsed.result.error.code, 'log-not-found')
  assert.equal(parsed.result.error.details.path, missing)
  assert.equal(opened, null, '文件不存在时不应调用 openFile')
})

/* ------------------------------------------------------------------ *
 * 常量面
 * ------------------------------------------------------------------ */
test('导出常量与命名空间一致', () => {
  assert.equal(YOLO_RPC_CHANNEL, '/yolo-mode')
  assert.equal(YOLO_RPC_VIEW, 'settingsView')
  assert.equal(YOLO_RPC_MUTATE, 'settingsMutate')
  assert.equal(YOLO_RPC_STATUS, 'statusView')
  assert.equal(YOLO_RPC_OPEN_LOG, 'openLogFile')
  assert.equal(String(YOLO_SETTINGS_NAMESPACE), NS)
})
