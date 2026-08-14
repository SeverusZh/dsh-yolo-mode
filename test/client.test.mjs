/**
 * test/client.test.mjs —— 客户端半边（lib/client.js）单测
 *
 * 不依赖真实 DOM / 真实网络。mock window.__ModuleLoader__ 与 require('react')，
 * 用 new Function 把 bundle 作为脚本执行，捕获其 factory；再以假 React 调用
 * factory 得到 exports，验证 apply 的 slot 注册契约与渲染函数可调用性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.join(__dirname, '..', 'lib', 'client.js')

const CODE = fs.readFileSync(CLIENT_PATH, 'utf8')

/** 假 React：createElement 返回可断言的元素结构，hooks 为无状态占位。 */
function createFakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: Symbol('Fragment'),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial })
  }
}

/** 加载 bundle 并返回其 exports。 */
function loadBundle() {
  let captured = null
  const fakeWindow = {
    __ModuleLoader__: {
      load: (rec) => { captured = rec }
    }
  }
  const fakeRequire = () => createFakeReact()
  // bundle 顶层引用 window；用 Function 构造避免真实 import 语义。
  const loadFn = new Function('window', 'require', CODE)
  loadFn(fakeWindow, fakeRequire)
  assert.ok(captured, 'window.__ModuleLoader__.load 应被调用并捕获记录')
  assert.equal(captured.id, 'dsh-yolo-mode')
  assert.equal(typeof captured.factory, 'function')
  return captured.factory(fakeRequire)
}

/** 假 ctx / slots：inject 记录 key 并同步触发 register，register 记录 {opts, renderer}。 */
function createFakeSlots() {
  const state = { injectedKeys: [], registered: [] }
  const slots = {
    inject: (key, cb) => { state.injectedKeys.push(key); const result = cb(); state.injectDisposers = state.injectDisposers || []; state.injectDisposers.push(result); },
    register: (opts, renderer) => { state.registered.push({ opts, renderer }); return () => {} }
  }
  function ctx() {
    return { get: (name) => (name === 'slots' ? slots : undefined) }
  }
  return { state, slots, ctx }
}

test('exports.apply 是函数', () => {
  const mod = loadBundle()
  assert.equal(typeof mod.apply, 'function')
})

test('apply 在缺少 slots 时静默返回', () => {
  const mod = loadBundle()
  // ctx.get('slots') 返回 undefined，不应抛错。
  assert.doesNotThrow(() => mod.apply({ get: () => undefined }))
})

test('apply 恰好注入三个 slot 键且顺序正确', () => {
  const mod = loadBundle()
  const { state, slots, ctx } = createFakeSlots()
  mod.apply(ctx())
  assert.deepEqual(state.injectedKeys, ['conversation.input.left', 'shell.overlay', 'settings.section'])
  assert.equal(state.registered.length, 3)
})

test('register 选项 name/id/order/label 正确', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeSlots()
  mod.apply(ctx())

  const chip = state.registered[0]
  assert.equal(chip.opts.name, 'conversation.input.left')
  assert.equal(chip.opts.id, 'yolo-mode-chip')
  assert.equal(chip.opts.label, 'dsh-yolo-mode 状态')

  const popup = state.registered[1]
  assert.equal(popup.opts.name, 'shell.overlay')
  assert.equal(popup.opts.id, 'yolo-mode-popup')
  assert.equal(popup.opts.label, 'dsh-yolo-mode 弹窗')

  const section = state.registered[2]
  assert.equal(section.opts.name, 'settings.section')
  assert.equal(section.opts.id, 'yolo-mode')
  assert.equal(section.opts.order, 25)
  assert.equal(section.opts.label, 'YOLO 审批')
})

test('渲染函数可调用且返回 React 元素或 null（不抛错、不触碰网络）', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeSlots()
  mod.apply(ctx())

  // Popup 默认 store.open=false → 渲染 null。
  assert.doesNotThrow(() => {
    const el = state.registered[1].renderer({})
    assert.ok(el === null, 'store 关闭时 popup 应渲染 null')
  })

  // Chip 渲染为按钮元素，children 含 "YOLO " 前缀。
  assert.doesNotThrow(() => {
    const el = state.registered[0].renderer({})
    assert.ok(el && typeof el.type === 'string', 'chip 应渲染一个 DOM 元素')
    assert.equal(el.type, 'button')
  })

  // SettingsSection 渲染为 div；props.close 为函数时输出关闭按钮。
  assert.doesNotThrow(() => {
    const el = state.registered[2].renderer({ close: () => {} })
    assert.ok(el && typeof el.type === 'string', '设置页应渲染一个 DOM 元素')
    assert.equal(el.type, 'div')
  })
})

test('Chip 展示 preset 占位，点击后经共享 store 开关弹窗', () => {
  const mod = loadBundle()
  const { state, ctx } = createFakeSlots()
  mod.apply(ctx())

  const chipRenderer = state.registered[0].renderer
  const popupRenderer = state.registered[1].renderer

  // 初始：popup 关闭 → 渲染 null；chip 文案为占位 '…'。
  assert.equal(popupRenderer({}), null)
  const chipEl = chipRenderer({})
  assert.equal(chipEl.type, 'button')
  assert.ok(flattenText(chipEl).startsWith('YOLO '))
  assert.ok(flattenText(chipEl).includes('…'), '未加载状态应显示占位 …')

  // 点击 chip → store.open 翻转为 true → popup 渲染非 null 面板。
  const onClick = chipEl.props.onClick
  assert.equal(typeof onClick, 'function')
  onClick()
  const opened = popupRenderer({})
  assert.ok(opened !== null && opened != null, 'store.open=true 时 popup 应渲染面板')
  // 关闭按钮/再次点击可回到 null。
  onClick()
  assert.equal(popupRenderer({}), null)
})

function flattenText(el) {
  if (el === null || el === undefined) return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  const childText = (Array.isArray(el.children) ? el.children : [el.children])
    .map((c) => flattenText(c))
    .join('')
  return childText
}
