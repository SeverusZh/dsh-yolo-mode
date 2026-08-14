/**
 * dsh-yolo-mode —— 裁判层测试（node --test，用假 llm，零真实网络）
 *
 * 覆盖 design.md §7 裁判矩阵（8 组用例）：
 *   1. 正常流三态（allow / deny / unsure）
 *   2. 非 JSON 文本流 → BAD_OUTPUT
 *   3. tool-call 块流 → BAD_OUTPUT
 *   4. 流抛错 → STREAM_ERROR
 *   5. 上游已中止 signal → ABORTED
 *   6. 超时（timeoutMs=30 + 永不产出的慢流）→ TIMEOUT
 *   7. concurrency=1 下并发两调用 → 其一 OVERLOAD（占用者不释放构造）
 *   8. llm 无 stream → NO_ADAPTER
 *
 * 运行：node --test test/judge.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { JUDGE_ERROR_CODES, JudgeError, createJudge, defaultJudgePromptFor, DEFAULT_SYSTEM_PROMPT } from '../lib/judge.js'

/**
 * 把一段文本按 BlockAssembler 分片协议组装成完整 chunk 序列。
 * @param {string} text
 * @returns {Array<object>} StreamChunk 序列
 */
function textChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 2, outputTokens: 3 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** tool-call 块流（合法分片协议，但含工具调用）。 */
function toolCallChunks() {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'x_tool', argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call-1', name: 'x_tool', arguments: '{}' } },
    { type: 'usage', usage: { inputTokens: 2, outputTokens: 3 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/**
 * 构造假 llm：`ctx.llm` 形状，stream(options) 返回指定 async generator。
 * @param {Function} produce (options) => AsyncIterable<StreamChunk>
 */
function fakeLlm(produce) {
  return {
    stream: async function* (options) {
      yield* produce(options)
    },
  }
}

/** 收到 chunk 序列后逐段产出。 */
function streamFrom(chunks) {
  return async function* () {
    for (const c of chunks) yield c
  }
}

/** 构造默认裁判输入。 */
function makeInput(overrides = {}) {
  return {
    toolName: 'pwsh',
    targetMode: 'danger-full-access',
    justification: '需要访问宿主环境以安装依赖',
    workspaceRoot: 'C:\\work',
    ...overrides,
  }
}

/** 断言 judge 抛出指定 JudgeError code。 */
async function assertJudgeErrorCode(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof JudgeError, `expected JudgeError, got ${err?.constructor?.name}`)
    assert.equal(err.code, code)
    return true
  })
}

// ---------------------------------------------------------------------------
// 0) 导出面契约
// ---------------------------------------------------------------------------
test('JUDGE_ERROR_CODES 为全部错误码的冻结数组', () => {
  assert.ok(Object.isFrozen(JUDGE_ERROR_CODES))
  assert.deepEqual([...JUDGE_ERROR_CODES], [
    'NO_ADAPTER', 'TIMEOUT', 'ABORTED', 'BAD_OUTPUT', 'STREAM_ERROR', 'OVERLOAD',
  ])
})

test('JudgeError 携带 code 且 instanceof Error', () => {
  const e = new JudgeError('BAD_OUTPUT', 'boom')
  assert.ok(e instanceof Error)
  assert.ok(e instanceof JudgeError)
  assert.equal(e.name, 'JudgeError')
  assert.equal(e.code, 'BAD_OUTPUT')
})

// ---------------------------------------------------------------------------
// 1) 正常流三态：allow / deny / unsure
// ---------------------------------------------------------------------------
for (const decision of ['allow', 'deny', 'unsure']) {
  test(`正常流 → ${decision}`, async () => {
    const body = `{"decision":"${decision}","reason":"因为理由充分"}`
    const llm = fakeLlm(streamFrom(textChunks(body)))
    const judge = createJudge({
      llm, provider: 'test-provider', model: 'test-model',
      systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 2,
    })
    const out = await judge(makeInput())
    assert.equal(out.decision, decision)
    assert.equal(out.reason, '因为理由充分')
  })
}

test('正常流：文本带前后噪声与代码围栏 → allow', async () => {
  const body = '以下是判定结果：\n```json\n{"decision":"ALLOW","reason":"ok"}\n```\n'
  const llm = fakeLlm(streamFrom(textChunks(body)))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 2,
  })
  const out = await judge(makeInput())
  assert.equal(out.decision, 'allow')
})

test('正常流：reason 缺省被补为空字符串', async () => {
  const body = '{"decision":"deny"}'
  const llm = fakeLlm(streamFrom(textChunks(body)))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  const out = await judge(makeInput())
  assert.equal(out.decision, 'deny')
  assert.equal(out.reason, '')
})

// ---------------------------------------------------------------------------
// 2) 非 JSON 文本流 → BAD_OUTPUT
// ---------------------------------------------------------------------------
test('非 JSON 文本流 → BAD_OUTPUT', async () => {
  const llm = fakeLlm(streamFrom(textChunks('这次操作看起来没问题，我直接放行了。')))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'BAD_OUTPUT')
})

test('只有 operation 字段（无 decision）→ BAD_OUTPUT', async () => {
  const llm = fakeLlm(streamFrom(textChunks('{"operation":"ok"}')))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'BAD_OUTPUT')
})

// ---------------------------------------------------------------------------
// 3) tool-call 块流 → BAD_OUTPUT
// ---------------------------------------------------------------------------
test('tool-call 块流 → BAD_OUTPUT', async () => {
  const llm = fakeLlm(streamFrom(toolCallChunks()))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'BAD_OUTPUT')
})

// ---------------------------------------------------------------------------
// 4) 流抛出 → STREAM_ERROR
// ---------------------------------------------------------------------------
test('流抛错 → STREAM_ERROR', async () => {
  let emitted = false
  async function* produce() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'partial' }
    emitted = true
    throw new Error('transport boom')
  }
  const llm = fakeLlm(produce)
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'STREAM_ERROR')
  assert.equal(emitted, true)
})

// ---------------------------------------------------------------------------
// 5) 上游已中止 signal → ABORTED
// ---------------------------------------------------------------------------
test('上游已中止 signal → ABORTED', async () => {
  const ctl = new AbortController()
  ctl.abort(new Error('caller cancelled'))
  let streamCalled = false
  const judge = createJudge({
    llm: fakeLlm(() => { streamCalled = true; return [] }), // 不应被调用
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 5000, maxTokens: 16, concurrency: 1,
    signal: ctl.signal,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'ABORTED')
  assert.equal(streamCalled, false, '中止应先于任何流式消耗')
})

// 5b) 单次调用携带已中止 signal（input.signal）→ ABORTED，优先于构造时 signal
test('input.signal 已中止 → ABORTED（且不消耗流）', async () => {
  const ctl = new AbortController()
  ctl.abort(new Error('request cancelled'))
  let streamCalled = false
  const judge = createJudge({
    llm: fakeLlm(() => { streamCalled = true; return [] }), // 不应被调用
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 5000, maxTokens: 16, concurrency: 1,
    // 构造时不传 signal —— 完全依赖单次调用输入
  })
  await assertJudgeErrorCode(judge(makeInput({ signal: ctl.signal })), 'ABORTED')
  assert.equal(streamCalled, false, '中止应先于任何流式消耗')
})

// ---------------------------------------------------------------------------
// 6) 超时（timeoutMs=30 + 永不产出的慢流）→ TIMEOUT
// ---------------------------------------------------------------------------
test('超时（30ms 慢流）→ TIMEOUT', async () => {
  // 慢流：不产出任何分片，仅在 signal 中止后返回（模拟真实 adapter 观察 signal）。
  const waitAbort = (signal) => new Promise((resolve) => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  const judge = createJudge({
    llm: fakeLlm(async function* (options) {
      await waitAbort(options.signal)
      return // 中止后正常结束流
    }),
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 30, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'TIMEOUT')
})

// ---------------------------------------------------------------------------
// 7) concurrency=1 下并发两调用 → 其一 OVERLOAD（占用者不释放构造）
// ---------------------------------------------------------------------------
test('concurrency=1 下并发两调用 → 其一 OVERLOAD', async () => {
  const ctl = new AbortController()
  // 占用者：永不产出的挂起流，仅响应 signal 中止（用于测试后释放）。
  const waitAbort = (signal) => new Promise((resolve) => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  const judge = createJudge({
    llm: fakeLlm(async function* (options) {
      await waitAbort(options.signal)
      return // 不产出任何分片，始终保持占用
    }),
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 60000, maxTokens: 16, concurrency: 1,
    signal: ctl.signal,
  })

  // 首调用：async 函数同步占位到首个 await，即可视为已占用信号量。
  const first = judge(makeInput({ justification: 'occupant' }))

  // 次调用：必须同步/尽快抛 OVERLOAD（active 已达上限）。
  await assertJudgeErrorCode(judge(makeInput({ justification: 'burst' })), 'OVERLOAD')

  // 释放占用者，避免遗留的 deadline 定时器阻塞进程退出。
  ctl.abort(new Error('release occupant'))
  await assertJudgeErrorCode(first, 'ABORTED')
})

// ---------------------------------------------------------------------------
// 8) llm 无 stream → NO_ADAPTER
// ---------------------------------------------------------------------------
test('llm 无 stream → NO_ADAPTER', async () => {
  const judge = createJudge({
    llm: { stream: undefined },
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'NO_ADAPTER')
})

test('llm 缺失 stream 属性（如纯对象）→ NO_ADAPTER', async () => {
  const judge = createJudge({
    llm: {},
    provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await assertJudgeErrorCode(judge(makeInput()), 'NO_ADAPTER')
})

// ---------------------------------------------------------------------------
// 补充：内存/计时器释放示意 —— 正常完结后 deadline 定时器被清理
// ---------------------------------------------------------------------------
test('正常完结后信号量释放，后续调用仍可进入', async () => {
  const body = '{"decision":"allow","reason":"ok"}'
  const llm = fakeLlm(streamFrom(textChunks(body)))
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await judge(makeInput({ justification: 'a' }))
  // 第二次仍可进入（首个已释放，未触发 OVERLOAD）。
  const out = await judge(makeInput({ justification: 'b' }))
  assert.equal(out.decision, 'allow')
})

// ---------------------------------------------------------------------------
// 9) defaultJudgePromptFor：每预设默认裁判提示词（design.md §13.1）
// ---------------------------------------------------------------------------
test('defaultJudgePromptFor 六预设：off/yolo 空串，其余非空且含「存疑」或 deny/unsure 字样', () => {
  // 确定性预设不调裁判 → 空串占位。
  assert.equal(defaultJudgePromptFor('off'), '')
  assert.equal(defaultJudgePromptFor('yolo'), '')
  // 其余预设：非空且含存疑即 deny/unsure 的表述。
  for (const preset of ['strict', 'balanced', 'permissive', 'custom']) {
    const prompt = defaultJudgePromptFor(preset)
    assert.ok(typeof prompt === 'string' && prompt.length > 0, `${preset} 提示词应为非空字符串`)
    assert.ok(
      prompt.includes('存疑') || (prompt.includes('deny') && prompt.includes('unsure')),
      `${preset} 提示词应含「存疑」或 deny/unsure 字样`,
    )
  }
})

test('defaultJudgePromptFor balanced 返回 DEFAULT_SYSTEM_PROMPT（不变）', () => {
  assert.equal(defaultJudgePromptFor('balanced'), DEFAULT_SYSTEM_PROMPT)
  // DEFAULT_SYSTEM_PROMPT 仍保留三条防回环要求。
  assert.ok(DEFAULT_SYSTEM_PROMPT.includes('存疑'))
  assert.ok(DEFAULT_SYSTEM_PROMPT.includes('你不是发起方 agent'))
})

test('defaultJudgePromptFor 未知预设回退 DEFAULT_SYSTEM_PROMPT', () => {
  assert.equal(defaultJudgePromptFor('no-such-preset'), DEFAULT_SYSTEM_PROMPT)
  assert.equal(defaultJudgePromptFor(undefined), DEFAULT_SYSTEM_PROMPT)
  assert.equal(defaultJudgePromptFor(null), DEFAULT_SYSTEM_PROMPT)
})

// ---------------------------------------------------------------------------
// 10) createJudge：systemPrompt 优先级（显式优先，空则内置默认）
// ---------------------------------------------------------------------------
test('createJudge：显式 systemPrompt 原样传给 llm.stream（用户显式优先）', async () => {
  let captured
  const llm = fakeLlm(async function* (options) {
    captured = options
    yield* textChunks('{"decision":"allow","reason":"ok"}')
  })
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: 'EXPLICIT_PROMPT', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await judge(makeInput())
  assert.equal(captured.system, 'EXPLICIT_PROMPT')
})

test('createJudge：systemPrompt 为空 → 使用内置 DEFAULT_SYSTEM_PROMPT', async () => {
  let captured
  const llm = fakeLlm(async function* (options) {
    captured = options
    yield* textChunks('{"decision":"deny","reason":"no"}')
  })
  const judge = createJudge({
    llm, provider: 'p', model: 'm', systemPrompt: '', timeoutMs: 2000, maxTokens: 16, concurrency: 1,
  })
  await judge(makeInput())
  assert.equal(captured.system, DEFAULT_SYSTEM_PROMPT)
})
