/**
 * test/client.test.mjs —— 客户端半边（src/client/* 源码 + 构建产物）单测
 *
 * 覆盖：
 *  1. store-logic 纯函数（optional/isBlank、字段 ops 构造、revision 状态机、
 *     classifyMutateError = store-logic 算法直接移植自参考项目）。
 *  2. YoloStore（fake rpc：{ok,value}/conflict）load/mutate 状态机，
 *     subscribe 同步通知。
 *  3. 构建产物冒烟：mock window.__ModuleLoader__ 与 fake require，用
 *     new Function 执行 lib/client/index.js，断言 exports.apply/inject，
 *     再以 fake ctx/slots 断言三个 inject 键与 register 参数。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  optional,
  isBlank,
  setFieldOps,
  unsetFieldOps,
  presetOps,
  modesOps,
  levelsOps,
  judgeFieldOps,
  advanceRevision,
  markConflict,
  adoptRevision,
  classifyMutateError,
} from '../src/client/store-logic.js'
import { YoloStore } from '../src/client/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.join(__dirname, '..', 'lib', 'client', 'index.js')

const CODE = fs.readFileSync(CLIENT_PATH, 'utf8')

// ---------------------------------------------------------------------------
// store-logic 纯函数
// ---------------------------------------------------------------------------

test('store-logic: optional 归一化字符串，空/空白 → undefined', () => {
  assert.equal(optional(undefined), undefined)
  assert.equal(optional(''), undefined)
  assert.equal(optional('   '), undefined)
  assert.equal(optional(' deepseek '), 'deepseek')
})

test('store-logic: isBlank 判空', () => {
  assert.equal(isBlank(undefined), true)
  assert.equal(isBlank(null), true)
  assert.equal(isBlank(''), true)
  assert.equal(isBlank('   '), true)
  assert.equal(isBlank('x'), false)
  assert.equal(isBlank(' x '), false)
})

test('store-logic: setFieldOps / unsetFieldOps 构造路径 op', () => {
  assert.deepEqual(setFieldOps(['preset'], 'yolo'), [{ op: 'set', path: ['preset'], value: 'yolo' }])
  assert.deepEqual(setFieldOps(['judge', 'provider'], 'p'), [{ op: 'set', path: ['judge', 'provider'], value: 'p' }])
  assert.deepEqual(unsetFieldOps(['judge', 'model']), [{ op: 'unset', path: ['judge', 'model'] }])
  // 路径不被共享同一数组引用
  const p = ['judge', 'systemPrompt']
  const ops = setFieldOps(p, 'x')
  p.push('extra')
  assert.deepEqual(ops[0].path, ['judge', 'systemPrompt'])
})

test('store-logic: presetOps / modesOps / levelsOps', () => {
  assert.deepEqual(presetOps('strict'), [{ op: 'set', path: ['preset'], value: 'strict' }])
  assert.deepEqual(modesOps(['workspace-write']), [{ op: 'set', path: ['modes'], value: ['workspace-write'] }])
  assert.deepEqual(levelsOps({ tools: { pwsh: 'deny' } }), [
    { op: 'set', path: ['levels'], value: { tools: { pwsh: 'deny' } } },
  ])
})

test('store-logic: judgeFieldOps 逐字段 set / unset 清空', () => {
  // 与存储值一致 → 无 op
  assert.deepEqual(judgeFieldOps('p', ['judge', 'provider'], 'p'), [])
  // 变更 → set
  assert.deepEqual(judgeFieldOps('old', ['judge', 'provider'], 'new'), [
    { op: 'set', path: ['judge', 'provider'], value: 'new' },
  ])
  // 语义空 → 清空（unset）
  assert.deepEqual(judgeFieldOps('old', ['judge', 'model'], ''), [
    { op: 'unset', path: ['judge', 'model'] },
  ])
  assert.deepEqual(judgeFieldOps('old', ['judge', 'model'], '  '), [
    { op: 'unset', path: ['judge', 'model'] },
  ])
  // 存储未定义且新值空白 → 无 op
  assert.deepEqual(judgeFieldOps(undefined, ['judge', 'model'], ''), [])
})

test('store-logic: revision 状态机', () => {
  const s0 = { revision: 3, conflicted: true }
  const advanced = advanceRevision(s0, 7)
  assert.deepEqual(advanced, { revision: 7, conflicted: false })
  assert.equal(s0.revision, 3, '纯函数不应改动入参')

  const conflicted = markConflict({ revision: 4, conflicted: false })
  assert.deepEqual(conflicted, { revision: 4, conflicted: true })

  const adopted = adoptRevision({ revision: 3, conflicted: true }, 9)
  assert.deepEqual(adopted, { revision: 9, conflicted: false })
})

test('store-logic: classifyMutateError 分类', () => {
  assert.equal(classifyMutateError('settings-conflict'), 'conflict')
  assert.equal(classifyMutateError('settings-rejected'), 'rejected')
  assert.equal(classifyMutateError('schema-validation'), 'rejected')
  assert.equal(classifyMutateError('internal'), 'fatal')
  assert.equal(classifyMutateError(undefined), 'fatal')
  assert.equal(classifyMutateError(''), 'fatal')
})

// ---------------------------------------------------------------------------
// YoloStore 状态机（fake rpc）
// ---------------------------------------------------------------------------

/** 构造一个运行中的 fake rpc：按 endpoint(settingsView/statusView/settingsMutate) 返回预设结果。 */
function makeFakeRpc(handlers, log = []) {
  return {
    call: async (channel, endpoint, payload) => {
      log.push({ channel, endpoint, payload })
      const h = handlers[endpoint]
      if (!h) return { ok: false, error: { code: 'internal', message: 'no handler ' + endpoint } }
      return h(payload)
    },
  }
}

function viewOk(view) {
  return { ok: true, value: { writable: true, view } }
}

function statusOk(status) {
  return { ok: true, value: status }
}

test('YoloStore: load 成功 → status ready, 取 revision, subscribe 同步通知', async () => {
  const rpc = makeFakeRpc({
    settingsView: () => viewOk({ ns: 'yolo-mode', revision: 5, value: { preset: 'yolo' }, secrets: [] }),
    statusView: () => statusOk({ preset: 'yolo', judgeConfigured: true, stats: { total: 1 }, recent: [] }),
  })
  const store = new YoloStore({ rpc })
  assert.equal(store.getSnapshot().status, 'idle')

  let notified = 0
  let seenStatus = null
  store.subscribe(() => { notified++ })
  await store.load()

  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().revision, 5)
  assert.equal(store.getSnapshot().view.value.preset, 'yolo')
  assert.equal(store.getSnapshot().statusInfo.preset, 'yolo')
  assert.ok(notified >= 1, 'load 期间应多次同步通知')
})

test('YoloStore: load 任一端点失败 → status error 记录 code', async () => {
  const rpc = makeFakeRpc({
    settingsView: () => ({ ok: false, error: { code: 'internal', message: 'boom' } }),
    statusView: () => statusOk({ preset: 'off' }),
  })
  const store = new YoloStore({ rpc })
  await store.load()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().error, 'internal')
})

test('YoloStore: mutate 成功 → advance revision + 重载', async () => {
  let revision = 3
  let current = { preset: 'balanced' }
  const rpc = makeFakeRpc({
    settingsView: () => viewOk({ ns: 'yolo-mode', revision, value: current, secrets: [] }),
    statusView: () => statusOk({ preset: current.preset }),
    settingsMutate: (payload) => {
      assert.equal(payload.ns, 'yolo-mode')
      assert.equal(payload.expectedRevision, 3)
      // 服务端应用 op 并推进 revision
      for (const op of payload.ops) {
        if (op.op === 'set' && op.path[0] === 'preset') current.preset = op.value
      }
      revision = 4
      return viewOk({ ns: 'yolo-mode', revision: 4, value: current, secrets: [] })
    },
  })
  const store = new YoloStore({ rpc })
  await store.load()
  assert.equal(store.getSnapshot().revision, 3)

  const outcome = await store.mutate(presetOps('strict'))
  assert.equal(outcome.ok, true)
  assert.equal(store.getSnapshot().revision, 4)
  assert.equal(store.getSnapshot().conflicted, false)
  // mutate 成功后 advance + load 重载拾取服务端已应用的值
  assert.equal(store.getSnapshot().view.value.preset, 'strict')
})

test('YoloStore: mutate 冲突 → markConflict + 重载, revision 掉回服务端', async () => {
  let attempts = 0
  let serverRevision = 9
  const rpc = makeFakeRpc({
    settingsView: () => viewOk({ ns: 'yolo-mode', revision: serverRevision, value: { preset: 'permissive' }, secrets: [] }),
    statusView: () => statusOk({ preset: 'permissive' }),
    settingsMutate: () => {
      attempts++
      return { ok: false, error: { code: 'settings-conflict', message: 'stale', details: {} } }
    },
  })
  const store = new YoloStore({ rpc })
  await store.load()
  assert.equal(store.getSnapshot().revision, serverRevision)

  const outcome = await store.mutate(presetOps('strict'))
  assert.equal(outcome.ok, false)
  assert.equal(outcome.kind, 'conflict')
  // 冲突后 markConflict + load 重载已同步通知并拾取服务端最新 revision
  const snap = store.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.equal(snap.view.value.preset, 'permissive')
  assert.equal(attempts, 1)
})

test('YoloStore: mutate rejected / fatal 不重载, 记录 error', async () => {
  const rpc = makeFakeRpc({
    settingsView: () => viewOk({ ns: 'yolo-mode', revision: 1, value: {}, secrets: [] }),
    statusView: () => statusOk({ preset: 'off' }),
    settingsMutate: () => ({ ok: false, error: { code: 'settings-rejected', message: 'nope', details: {} } }),
  })
  const store = new YoloStore({ rpc })
  await store.load()

  const outcome = await store.mutate(presetOps('yolo'))
  assert.equal(outcome.ok, false)
  assert.equal(outcome.kind, 'rejected')
  assert.equal(store.getSnapshot().error, 'settings-rejected')

  // fatal
  const rpc2 = makeFakeRpc({
    settingsView: () => viewOk({ ns: 'yolo-mode', revision: 1, value: {}, secrets: [] }),
    statusView: () => statusOk({ preset: 'off' }),
    settingsMutate: () => ({ ok: false, error: { code: 'internal', message: 'x', details: {} } }),
  })
  const store2 = new YoloStore({ rpc: rpc2 })
  await store2.load()
  const o2 = await store2.mutate(presetOps('yolo'))
  assert.equal(o2.kind, 'fatal')
})

test('YoloStore: togglePopup 翻转 open 并同步通知', () => {
  const rpc = makeFakeRpc({})
  const store = new YoloStore({ rpc })
  let count = 0
  store.subscribe(() => count++)
  assert.equal(store.getSnapshot().open, false)
  store.togglePopup()
  assert.equal(store.getSnapshot().open, true)
  store.togglePopup()
  assert.equal(store.getSnapshot().open, false)
  assert.ok(count >= 2)
})

// ---------------------------------------------------------------------------
// 构建产物冒烟
// ---------------------------------------------------------------------------

/** 假 React：createElement 返回可断言的元素结构，hooks 为最小实现。 */
function createFakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: 'Fragment',
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    // useSyncExternalStore 让选择器 hook 也能工作（用于验证快照读取路径）。
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    useLayoutEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial }),
    useSyncExternalStoreWithSelector: (subscribe, getSnapshot, _ss, selector) => {
      const snap = getSnapshot()
      return selector ? selector(snap) : snap
    },
  }
}

/** 假 require：按 specifier 分派 react / dsh-client-web-react。 */
function createFakeRequire() {
  const react = createFakeReact()
  const swr = {
    // 直接读快照，选择器包装 selector。
    bindSnapshotSelector: (source) => (selector) => {
      const snap = source.getSnapshot()
      return selector ? selector(snap) : snap
    },
  }
  const webReact = swr
  return (spec) => {
    if (spec === 'react') return react
    if (spec === '@deepseek-ai/dsh-client-web-react') return webReact
    if (spec.startsWith('use-sync-external-store')) {
      return { useSyncExternalStoreWithSelector: react.useSyncExternalStoreWithSelector }
    }
    throw new Error('unexpected require: ' + spec)
  }
}

/** 加载构建产物，返回其 exports（factory 调用所得）。 */
function loadBundle() {
  let captured = null
  const fakeWindow = { __ModuleLoader__: { load: (rec) => { captured = rec } } }
  const fakeRequire = createFakeRequire()
  const loadFn = new Function('window', 'require', CODE)
  loadFn(fakeWindow, fakeRequire)
  assert.ok(captured, 'window.__ModuleLoader__.load 应被调用并捕获记录')
  assert.equal(captured.id, 'dsh-yolo-mode')
  assert.equal(typeof captured.factory, 'function')
  return captured.factory(fakeRequire)
}

/** 假 ctx：locale/remote/on/effect/slots 全套可断言的实现。 */
function createFakeCtx() {
  const state = {
    injectedKeys: [],
    registered: [],
    localeRegistrations: [],
    localeBound: [],
    remoteListeners: [],
    ctxListeners: [],
    effects: [],
  }
  const slots = {
    inject: (key, cb) => {
      state.injectedKeys.push(key)
      const disposer = cb()
      state.injectDisposers = state.injectDisposers || []
      state.injectDisposers.push(disposer)
    },
    register: (opts, renderer) => {
      state.registered.push({ opts, renderer })
      return () => {}
    },
  }
  const locale = {
    register: (ns, dicts) => {
      state.localeRegistrations.push({ ns, dicts })
      return () => {}
    },
    bind: (ns) => {
      state.localeBound.push(ns)
      return (key) => key
    },
  }
  const ctx = {
    get: (name) => (name === 'connection' ? { rpc: makeFakeRpc({}) } : name === 'slots' ? slots : name === 'locale' ? locale : name === 'remote' ? remote : undefined),
    remote: {
      $on: (evt, fn) => { state.remoteListeners.push({ evt, fn }); return () => {} },
    },
    on: (evt, fn) => { state.ctxListeners.push({ evt, fn }); return () => {} },
    effect: (fn, label) => { state.effects.push(label); fn(); return () => {} },
    slots,
    locale,
  }
  // remote 引用需要闭包内定义后赋值；先以占位替换。
  const remote = { $on: ctx.remote.$on }
  return { state, ctx }
}

test('构建产物: exports.apply 与 exports.inject 存在', () => {
  const mod = loadBundle()
  assert.equal(typeof mod.apply, 'function')
  assert.deepEqual(mod.inject, ['slots', 'locale', 'connection', 'remote'])
})

test('构建产物: apply 在缺少 connection 时静默返回（不注册）', () => {
  const mod = loadBundle()
  // locale 服务是 inject 必选，作为 ctx 属性可用；connection 缺失则应 return，
  // 不触碰 slots（slots.inject 被标记为必然失败的占位）。
  const slots = { inject: () => { throw new Error('should not inject') } }
  const locale = { register: () => () => {}, bind: () => (key) => key }
  const ctx = {
    locale,
    slots,
    get: (name) => (name === 'connection' ? undefined : name === 'locale' ? locale : name === 'slots' ? slots : undefined),
    effect: (fn) => fn(),
    on: () => () => {},
    remote: { $on: () => () => {} },
  }
  assert.doesNotThrow(() => mod.apply(ctx))
})

test('构建产物: apply 注册 locale + 三个 inject 键 + register 参数', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeCtx()
  mod.apply(ctx)

  // locale.register 收到 NS 与双语字典
  assert.equal(state.localeRegistrations.length, 1)
  assert.equal(state.localeRegistrations[0].ns, 'settings.yoloMode')
  assert.ok(state.localeRegistrations[0].dicts.zh && state.localeRegistrations[0].dicts.en)

  // 三个 slot 注入键（settings.section 优先，随后 input.left 与 shell.overlay）
  assert.deepEqual(state.injectedKeys, ['settings.section', 'conversation.input.left', 'shell.overlay'])
  assert.equal(state.registered.length, 3)

  const section = state.registered[0]
  assert.equal(section.opts.name, 'settings.section')
  assert.equal(section.opts.id, 'yolo-mode')
  assert.equal(section.opts.order, 25)
  assert.equal(section.opts.locale, 'settings.yoloMode')
  assert.equal(section.opts.label(), 'nav')
  assert.equal(typeof section.opts.inject, 'function')
  assert.equal(typeof section.renderer, 'function')

  const chip = state.registered[1]
  assert.equal(chip.opts.name, 'conversation.input.left')
  assert.equal(chip.opts.id, 'yolo-mode-chip')

  const popup = state.registered[2]
  assert.equal(popup.opts.name, 'shell.overlay')
  assert.equal(popup.opts.id, 'yolo-mode-popup')
})

test('构建产物: 失效订阅连接 remote.$on 与 connection/reset', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeCtx()
  mod.apply(ctx)

  assert.ok(
    state.remoteListeners.some((l) => l.evt === 'settings/document-updated'),
    '应订阅 settings/document-updated',
  )
  assert.ok(
    state.ctxListeners.some((l) => l.evt === 'connection/reset'),
    '应订阅 connection/reset',
  )
  assert.ok(state.effects.length >= 2, 'locale 与失效订阅均为 effect 包裹')
})

test('构建产物: 渲染函数可调用且返回元素或 null', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeCtx()
  mod.apply(ctx)

  const injected = state.registered[0].opts.inject()
  const store = injected.store
  const useSnapshot = injected.useSnapshot
  const t = injected.t

  // store 初始 idle → SettingsSection 渲染 intro。
  assert.doesNotThrow(() => {
    const el = state.registered[0].renderer({ store, useSnapshot, t })
    assert.ok(el, 'settings 渲染器应返回非 null')
  })

  // Popup 默认 store.open=false → 渲染 null。
  const popupEl = state.registered[2].renderer({ store, useSnapshot, t })
  assert.equal(popupEl, null)

  // chip 渲染为 button，文案含 "YOLO "。
  const chipEl = state.registered[1].renderer({ store, useSnapshot, t })
  assert.equal(chipEl.type, 'button')
  const chipText = flattenText(chipEl)
  assert.ok(chipText.startsWith('YOLO '))
})

function flattenText(el) {
  if (el === null || el === undefined) return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  const childText = (Array.isArray(el.children) ? el.children : [el.children])
    .map((c) => flattenText(c))
    .join('')
  return childText
}
