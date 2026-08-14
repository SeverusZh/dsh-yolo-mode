# dsh-yolo-mode 详细设计文档

> 版本：v0.1.0 设计基线（2026-08-14）
> 上游输入：`docs/requirements.md`（需求计划）、`docs/research-notes.md`（调研结论）
> 本文件是**实现契约**：执行者/测试者子代理必须严格按本文档的模块边界、函数签名与行为表实现，不得自行改契约；发现契约与现实源码冲突时，在交付报告中记录偏差并说明依据。

## 0. 已核实的关键 DSH 契约（本机 `E:\DeepSeekHarness\node_modules\@deepseek-ai\` 源码核实）

| 契约 | 事实 | 出处 |
|---|---|---|
| 审批 seam 事件 | `'approval/request'`，waterfall；监听器签名 `(req, next) => Promise<ApprovalOutcome>`；返回结果即裁决，`next()` 委托 | `dsh-user-approval/lib/types/index.d.ts` |
| 裁决词汇 | `'allowed-once' \| 'rejected' \| 'cancelled' \| 'unavailable'`；非法返回值被归一化为 `unavailable`（fail-closed） | 同上 `types.d.ts` |
| ApprovalRequest | `{ agent, toolName, callId?, reason?, signal? }`（只读）；`signal` 中止时应答 `cancelled` | 同上 |
| 升权 reason 格式 | `escalate sandbox to ${mode}: ${justification}`；mode ∈ `workspace-write \| danger-full-access`（严格拓宽） | `dsh-sandbox/lib/index.js:101` |
| 审批策略 | `ask \| never`；`never` 时 seam 在瀑布**之前**直接返回 `rejected`，插件天然不介入 | `dsh-user-approval/lib/index.js:188` |
| 人工应答者 | `dsh-host-apiproxy` 在 bundle 层注册 `ctx.on('approval/request', ...)`，**无 prepend**，且对匹配的 ask 直接返回挂起 Promise（抢答） | `dsh-host-apiproxy/lib/index.js:1955` |
| prepend 语义 | cordis `ctx.on(name, listener, {prepend: true})` → 监听器 `unshift` 到列表头；waterfall 按列表顺序调用 | `cordis/lib/index.js:336` |
| 沙箱策略 | `ctx.sandboxPolicy.resolve({session})` → `{ mode, workspaceRoot }`；mode ∈ `read-only \| workspace-write \| danger-full-access` | `dsh-sandbox-policy/lib/types/index.d.ts` |
| LLM 流式调用 | `ctx.llm.stream({provider, model, messages, system?, maxTokens?, stop?, signal?, purpose?})` → `AsyncIterable<StreamChunk>`；`purpose` 为封闭联合 `'compaction'\|'session-title'`，**裁判调用省略** | `dsh-llm/lib/types/types.d.ts:312` |
| 分片组装 | `BlockAssembler`（`@deepseek-ai/dsh-llm` 导出）；分片协议 `block-start/text-delta/reasoning-delta/tool-call-delta/block-end/usage/finish` | `dsh-llm/lib/types/assembler.d.ts` |
| 超时 | `deadline(upstream, timeoutMs, code)` → `{ signal, [Symbol.dispose]() }`（`@deepseek-ai/dsh-timeout`） | `dsh-timeout/lib/types/index.d.ts` |
| tool/call 会话事件 | `{ turn, step, callId, name, arguments }`；`arguments` 为原始 JSON 字符串 | `dsh-session/lib/types/types.d.ts:286` |
| patch 层 | profile `cordis.patch.yml` 为顶层 YAML 数组；`{ insert: [{ id, name, config }] }` 追加插件行；`insert` 仅追加到组合末尾（无 before/after） | `dsh-app-boot/lib/index.js:57` |
| 插件安装 | `dsh plugin --profile <name> add <pkg>`（转发 pnpm，支持本地路径/link） | `dsh/lib/plugin-*.js`、README |

**架构结论（沿用原规划）**：本插件作为 profile `cordis.patch.yml` 的 `insert` 行挂载；由于 patch 行应用晚于 bundle 层，人工应答者先注册，本插件**必须**用 `{ prepend: true }` 注册监听器抢在人工应答者之前裁决，否则永远轮不到。

## 1. 包结构

```
dsh-yolo-mode/
├── package.json          # name dsh-yolo-mode, v0.1.0, type: module, main: lib/index.js
├── README.md             # 中文：安装、配置示例、预设表、安全须知
├── CHANGELOG.md          # 0.1.0 条目
├── LICENSE               # MIT
├── .gitignore
├── docs/                 # 需求与研究文档（已存在）
├── lib/
│   ├── policy.js         # 纯函数策略层（零依赖、可单测）
│   ├── judge.js          # LLM 裁判封装（依赖 peer：dsh-llm / dsh-timeout）
│   └── index.js          # 插件胶水（默认导出）
└── test/
    ├── policy.test.mjs   # node --test
    └── judge.test.mjs    # node --test（假 llm，不发真实网络）
```

依赖策略：**零运行时依赖**；peerDependencies 仅声明实际 import 的 `@deepseek-ai/*` 包（版本号 `^` 对齐 `E:\DeepSeekHarness\node_modules\@deepseek-ai\<pkg>\package.json` 的 version）。配置校验手写（不引入 schemastery），fail-loud。

## 2. 配置 Schema（`Config`）

插件行的 `config` 全字段可选，手工默认合并：

```yaml
config:
  preset: balanced            # 'off'|'strict'|'balanced'|'permissive'|'yolo'|'custom'，默认 balanced
  modes: ['workspace-write']  # 会话有效沙箱模式 ∈ 该列表才介入；默认仅 workspace-write
  levels: {}                  # 层级表：levels.tools 可对任意预设逐工具覆盖；levels[targetMode] 仅在 preset=custom 时生效（见 §4）
  judge:
    provider: ''              # 启用 LLM 裁判所必需（空串 = 未配置 → judge 决策按错误回退）
    model: ''
    systemPrompt: ''          # 空 = 内置裁判 prompt
    timeoutMs: 20000
    maxTokens: 256
    concurrency: 2            # 并发裁判信号量上限
  includeSubagents: true      # 子代理会话同样裁决（审计记录 session origin）
  auditFile: ''               # 空 = 使用默认 %TEMP%/dsh-yolo/judge.log（JSONL 审计）
```

`normalizeConfig(raw)`（policy.js 导出）：
- 返回完整默认合并后的冻结配置对象；
- 非法值**抛出**（fail-loud）：preset 不在枚举、modes 非数组/含非法模式、levels 的 policy 不在 `allow|judge|delegate|deny`、judge.timeoutMs/maxTokens/concurrency 非正整数、includeSubagents 非布尔。

## 3. 决策流水线（lib/index.js）

`approval/request` 监听器（`{ prepend: true }`）逐请求执行，顺序与返回：

1. `req.signal?.aborted` → 返回 `'cancelled'`。
2. reason 不匹配 `/^escalate sandbox to (workspace-write|danger-full-access): (.+)$/` → `next()`（透明委托）。
3. `ctx.sandboxPolicy.resolve({ session: req.agent.session })` 得 `{ mode, workspaceRoot }`；`mode ∉ config.modes` → `next()`。
4. 提取 `targetMode` 与 `justification`。
5. 上下文增强：若 `req.callId` 存在，反向扫描 `req.agent.session.events` 中 `type === 'tool/call'` 且 `data.callId === req.callId` 的事件，取 `data.arguments`（原始 JSON 字符串），`JSON.parse` 后 `JSON.stringify` 截断至 1200 字符得 `argumentsSummary`；任何失败 → `argumentsSummary = undefined`（静默降级）。
6. `resolvePolicy({ preset, levels, targetMode, toolName: req.toolName })` → `'allow'|'judge'|'delegate'|'deny'`（见 §4）。
7. 按 §4 裁决映射；`judge` 走 §5 的 LLM 裁判（信号量溢出/失败/不确定 → §4 回退列）。
8. 审计：`ctx.logger`（warn/info）+ 追加一行 JSONL 到 `auditFile`（`node:fs` appendFile，try/catch 包裹，失败不致命）。审计字段：`{ time, sessionId, origin: 'main'|'subagent', toolName, callId?, targetMode, currentMode, justification, decision, outcome, reason? }`。`origin` 由 `req.agent` 的 session 是否带 delegation 信息判定（无法判定时 `'main'`）。
9. 所有副作用（监听器注册、judge 实例、审计文件句柄）必须由 `ctx.effect(...)` 管理，插件卸载时完全清理。

**绝不**：改写审批策略、对非升权请求插手、在错误路径放行。

## 4. 策略层契约（lib/policy.js）

纯函数、零 import、可单测。导出（JSDoc 注明类型）：

```js
export const PRESETS = ['off','strict','balanced','permissive','yolo','custom']          // 冻结数组
export const POLICIES = ['allow','judge','delegate','deny']                                // 冻结数组
export const ESCALATION_RE = /^escalate sandbox to (workspace-write|danger-full-access): (.+)$/

export function normalizeConfig(raw) -> Config     // 见 §2；返回冻结对象
export function resolvePolicy({ preset, levels, targetMode, toolName }) -> Policy
export function parseJudgeOutput(text) -> { decision:'allow'|'deny'|'unsure', reason:string } | null
export function judgeFallback({ preset, levels, kind }) -> 'rejected' | 'delegate'   // kind ∈ 'error'|'unsure'
```

**resolvePolicy 规则**（优先级从高到低）：
1. `levels.tools?.[toolName]` 存在 → 用它（policy ∈ POLICIES）。
2. 否则按内置预设表（下表 policy 列）。
3. `preset === 'custom'` 时：`levels[targetMode]`，缺省 `'delegate'`。

| preset | workspace-write | danger-full-access |
|---|---|---|
| off | delegate | delegate |
| strict | judge | delegate |
| balanced（默认） | judge | judge |
| permissive | judge | judge |
| yolo | allow | allow |

**裁决映射**（index.js 使用）：
- `allow` → 返回 `'allowed-once'`
- `deny` → 返回 `'rejected'`
- `delegate` → `next()`
- `judge` → 调裁判；裁判结果 `allow→'allowed-once'`、`deny→'rejected'`、`unsure→judgeFallback(..., 'unsure')`；裁判抛错 → `judgeFallback(..., 'error')`。`judgeFallback` 返回 `'rejected'` 或 `'delegate'`（delegate 即 `next()`）。

**judgeFallback 规则**：`preset === 'strict' && kind === 'error'` → `'rejected'`；`preset === 'permissive' && kind === 'unsure'` → **注意：permissive 的 unsure 应视为允许**（见需求），但裁决词汇里只有 `allowed-once` 才是放行 → 返回哨兵 `'allowed-once'`？**修正**：judgeFallback 返回值域改为 `'allowed-once' | 'rejected' | 'delegate'`：strict+error → `'rejected'`；permissive+unsure → `'allowed-once'`（文档警示）；其余任何组合 → `'delegate'`。`custom` 时读 `levels.error` / `levels.unsure`（∈ `allow|delegate|deny`，映射 `allow→allowed-once`、`deny→rejected`、缺省 delegate）。

**parseJudgeOutput**：剥 ``` 代码围栏与首尾空白 → 提取**第一个** `{...}`（含嵌套，括号配平）→ `JSON.parse` → 校验 `decision ∈ {allow,deny,unsure}` 且 `reason` 为字符串（缺失补 `''`）→ 返回；任何失败返回 `null`。容错边界：`decision` 大小写不敏感归一。

## 5. 裁判封装契约（lib/judge.js）

```js
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { parseJudgeOutput } from './policy.js'

export const JUDGE_ERROR_CODES = ['NO_ADAPTER','TIMEOUT','ABORTED','BAD_OUTPUT','STREAM_ERROR','OVERLOAD']
export class JudgeError extends Error { constructor(code, message) }   // this.code ∈ 上述集合

export function createJudge({ llm, provider, model, systemPrompt, timeoutMs, maxTokens, concurrency })
  -> async function judge(input) -> { decision:'allow'|'deny'|'unsure', reason:string }
```

- `llm`：`ctx.llm` 服务对象（`llm.stream` 存在，否则首调抛 `JudgeError('NO_ADAPTER')`）；测试注入假对象。
- `input`：`{ toolName, targetMode, justification, workspaceRoot, argumentsSummary?, signal? }`；`signal` 为本次调用的上游取消信号（如审批请求的 `req.signal`），中止 → `JudgeError('ABORTED')`，优先于构造时传入的 signal。
- 内置 system prompt（`systemPrompt` 为空时）：安全审计者角色，必须包含：①"你不是发起方 agent，只依据事实裁决"；②"存疑即 deny/unsure"；③"绝不因发起方的目标/意图放行"。用户消息 = 单条 `createUserMessage(JSON.stringify(input, null, 2))`。
- 流式组装：`for await (const chunk of llm.stream({ provider, model, messages, system, maxTokens, signal }))` → `assembler.push(chunk)`；`finish` 分片后取 `assembler.blocks()` 中的 text 块（无 text → `BAD_OUTPUT`；出现 tool-call 块 → `BAD_OUTPUT`）。
- 超时：`deadline(reqSignal, timeoutMs, 'YOLO_JUDGE_TIMEOUT')` 的 signal 传入 stream；组装循环内检查 `signal.aborted` → `JudgeError('TIMEOUT')`（上游 signal 中止则 `'ABORTED'`，按 signal.reason/代码区分：上游传递的 signal 先于 deadline 判断）。
- 结果经 `parseJudgeOutput` 解析；`null` → `JudgeError('BAD_OUTPUT')`。
- 信号量：`concurrency` 上限；溢出 → 抛 `JudgeError('OVERLOAD')`（调用方按 error 回退处理）；进入者用 try/finally 释放。
- 任何异常路径**绝不放行**：只产生 `{decision}` 或 `JudgeError`。
- 该模块**不写会话历史、不审计**（归 index.js）。

**test/judge.test.mjs** 的假流构造：分片协议按 `BlockAssembler` 源码（`dsh-llm/lib/types/assembler.d.ts`）构造：`{type:'block-start', index, blockType:'text'}` → `{type:'text-delta', index, delta}` ×N → `{type:'block-end', index, block:{...}}` → `{type:'finish', ...}`。覆盖用例见 §7。

## 6. 插件胶水契约（lib/index.js）

```js
import { normalizeConfig, resolvePolicy, judgeFallback, ESCALATION_RE } from './policy.js'
import { createJudge, JudgeError, JUDGE_ERROR_CODES } from './judge.js'

export const name = 'dsh-yolo-mode'
export default function apply(ctx, config) { ... }   // 或 { name, apply } 均可；default 导出函数即插件
```

- `config`：`normalizeConfig(config ?? {})`（抛错即加载失败，fail-loud）。
- `ctx.effect(() => ctx.on('approval/request', handler, { prepend: true }), 'yolo-mode: approval answerer')`。
- judge 实例：`provider && model` 均非空才 `createJudge`；未配置时 `judge` 决策按 error 回退（委托），并 `ctx.logger.warn` 一次。
- 审计：见 §3.8；审计文件目录 `mkdir` 由首次写入前确保（`node:fs`，try/catch）。
- `danger-full-access + never` 语义：策略 never 时 seam 在瀑布前拒绝，插件自然无请求可接——文档注明，代码无需特判。

## 7. 测试矩阵（node --test，`node --test test/` 全绿为验收）

**test/policy.test.mjs**（覆盖 §4）：
1. normalizeConfig：全默认；非法 preset 抛错；非法 policy 抛错；judge 字段非法抛错；冻结输出。
2. resolvePolicy：6 预设 × 2 目标模式全表；`levels.tools` 覆盖优先于模式行；custom 缺省 delegate。
3. parseJudgeOutput：合法三态；代码围栏包裹；前后噪声文本；非法 JSON → null；decision 非法 → null；大写 ALLOW 归一。
4. judgeFallback：strict+error=rejected；permissive+unsure=allowed-once；balanced+error=delegate；balanced+unsure=delegate；custom levels.error/unsure 映射。

**test/judge.test.mjs**（假 llm，零网络）：
1. 正常流 → allow / deny / unsure 三态各一。
2. 非 JSON 文本流 → BAD_OUTPUT。
3. tool-call 块流 → BAD_OUTPUT。
4. 流抛出 → STREAM_ERROR。
5. 上游已中止 signal → ABORTED。
5b. 单次调用 `input.signal` 已中止 → ABORTED（且不消耗流）。
6. 超时（timeoutMs=30 + 永不产出的慢流）→ TIMEOUT。
7. concurrency=1 下并发两调用 → 其一 OVERLOAD（时序敏感可用"占用者不释放"构造：首调用挂起时发起次调用，断言 OVERLOAD 后释放）。
8. llm 无 stream → NO_ADAPTER。

**test/judge.test.mjs 用 `deadline` 前**：超时用例允许用真实 timer（30ms 足够短，不影响稳定）。

## 8. 分工与验收（本轮执行）

| 任务 | 产出文件 | 验收 |
|---|---|---|
| W1 脚手架 | package.json、README.md、CHANGELOG.md、LICENSE、.gitignore | 字段完整、`node --check` 无关；README 覆盖安装/配置/预设表/安全须知 |
| W2 策略层 | lib/policy.js、test/policy.test.mjs | `node --test test/policy.test.mjs` 全绿 |
| W3 裁判层 | lib/judge.js、test/judge.test.mjs | `node --test test/judge.test.mjs` 全绿 |
| W4 胶水层 | lib/index.js | `node --check lib/index.js` 通过；语法与 import 路径正确 |

并行任务文件互不重叠。执行者子代理只写自己名下文件，**禁止** git 操作与修改他人文件。发现契约与 `E:\DeepSeekHarness\node_modules\@deepseek-ai\` 源码冲突时，以源码为准并在交付报告中注明。

## 9. 实施顺序（M2 安装与验证，本轮不执行）

1. `dsh plugin --profile web add <workspace 绝对路径>`（写 profile 目录，pnpm 安装 link）。
2. 向 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加 `insert` 行（见 §0 表；id `yolo-mode`、name `dsh-yolo-mode`、config 示例 preset `balanced`）。
3. `dsh web --dump-config` 离线校验组合。
4. `cordis.patch.yml` 由 `watchUserPatches` 热重载，新行保存后即挂入运行中的宿主（2026-08-14 实测：`include:yolo-mode` fiber state=ACTIVE、error=null，无需重启）；若加载失败宿主保留上一棵好树。重启 DSH 始终是兜底。E2E：在 `workspace-write + ask` 的新会话触发真实升权，验证裁判放行 / 转人工 / 失败回退三条路径。

## 10. 已完成的验证记录（2026-08-14）

| 验证项 | 方法 | 结果 |
|---|---|---|
| 单元测试 | `npm test`（node --test，假 llm） | 47/47 全绿（policy 29 + judge 18） |
| 流水线冒烟 | 真实 policy/judge/index 模块 + 假流 | 10/10 通过（含四态裁决、回退、审计、实参扫描） |
| 组合解析 | `dsh --profile web --dump-config` | 退出码 0，yolo-mode 行配置正确 |
| 活动树挂载 | 动态探针枚举 `ctx.loader.entries()` | `include:yolo-mode` fiber **ACTIVE**(2)、error=null |
| 真实 LLM 裁判路由 | 动态探针以 `opencode-go/deepseek-v4-flash` + 内置防回环 prompt 流式裁决 | 合法 JSON 输出，越界写入被正确 **deny**（fail-closed 实证） |
| **真实 E2E（用户会话实测）** | 用户于 `workspace-write + ask` 新会话触发 pwsh 越界写入 → 升权申请被本插件裁决 | 完整链路实证：`tool/call(pwsh)` → `approval/asked(reason=escalate sandbox to danger-full-access…)` → 裁判 deny → `approval/decided(outcome=rejected)`（3.1s 裁判往返）→ 审计日志记录裁判理由 |

**遗留**：三路径中的「裁判放行 allowed-once」与「不确定/失败 → 转人工」两条路径在真实会话中尚未被触发（其余两路径由 47 项单测 + 10 项冒烟覆盖）。审计日志：`%TEMP%\dsh-yolo\judge.log`。
