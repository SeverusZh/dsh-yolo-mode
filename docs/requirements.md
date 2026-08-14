# dsh-yolo-mode 需求计划文档

> 本文件由跨主机会话导出重建（原始会话 `session-adb186db-...`，源工作目录 `D:\ProjectCollection\插件管理\dsh-yolo-mode`）。
> 重建自会话日志中 `exit_plan_mode`（Turn 1）的完整规划文本与 Turn 4 的 `dsh-auto-approval` 调研报告。

## 一、背景与目标

在 DeepSeek Harness (DSH) 上新增一个宿主侧插件 `dsh-yolo-mode`：当会话处于 `workspace-write` 沙箱模式、审批策略为 `ask` 时，用大模型自动裁决沙箱升权申请（`sandbox_permissions`），并支持用户自定义权限层级与内置预设方案；同步建立并维护需求计划文档。

**原始用户诉求**：
> "我想为dsh增加一个自动审批权限申请的插件，要求使用大模型对普通的Workspace Write模式下权限申请进行判断，用户可自定义权限层级同时提供预设方案，联网调研现有成熟实践方案，维护需求计划文档。"

## 二、成功标准（验收）

1. `workspace-write` 模式下，`escalate sandbox to danger-full-access` 类申请由裁判模型直接裁决（允许/拒绝/转人工），人工不再收到弹窗（在裁判确定时）。
2. 裁判不确定 → 回落到人工应答者（Web 审批 UI），链路不中断。
3. 裁判失败/超时/非法输出 → 按预设回退策略处理，**任何情况下不自动放行**（fail closed）。
4. `yolo`/`off` 等确定性预设不产生任何 LLM 调用。
5. 裁判调用延迟与 token 开销有界（超时、maxTokens、输入裁剪）。
6. 插件不拦截非沙箱升级类审批请求（对其他 seam 消费方透明）。
7. `docs/requirements.md` 需求计划文档建立，含调研结论、风险登记与版本历史。

## 三、术语

| 术语 | 含义 |
|---|---|
| seam / approval seam | DSH 的 `approval/request` waterfall 事件应答链 |
| 应答者 (responder) | 监听 `approval/request` 并可能裁决/委托的插件 |
| 升权申请 | 形如 `escalate sandbox to <mode>: <justification>` 的审批请求 |
| 裁判 (judge) | 本插件用 LLM 对升权申请做 allow/deny/unsure 分级 |
| 预设 (preset) | 一份权限层级表的命名组合（off/strict/balanced/permissive/yolo/custom） |
| workspace-write 模式 | DSH 沙箱在只读之上的文件可写模式（受限） |

## 四、架构决策（已由源码核实）

- **归属平面：宿主组合**。审批栈是刻意边界（`editing-cordis-compositions` 技能明文），插件作为 `approval/request` 的**应答者**插入用户 web profile 的 `cordis.patch.yml`，不进入 agent preset。
- **抢占机制**：`ctx.on('approval/request', handler, { prepend: true })`。patch 层 `insert` 仅追加到组合末尾（`applyEntryPatches` 源码无 before/after），而人工应答者 `dsh-host-apiproxy` 在 bundle 层先注册；唯一可靠办法是 prepend 到监听列表头部。
- **裁决入口**：监听器收到 `{agent, toolName, callId?, reason?, signal?}`；仅当 `reason` 匹配 `^escalate sandbox to (workspace-write|danger-full-access): (.+)$` 时介入，否则 `next()` 委托。
- **前置门槛**：`ctx.sandboxPolicy.resolve({session})` 得当前有效模式；默认仅处理有效模式为 `workspace-write` 的会话（用户需求原文），read-only 会话默认转人工（可配置）。
- **裁判调用**：复用 `dsh-session-title-llm` 已验证模式——`ctx.llm.stream({provider, model, messages:[createUserMessage], system, maxTokens, signal})` + `BlockAssembler` + `deadline(signal, timeoutMs, code)`；`purpose` 字段省略（当前为封闭联合 `'compaction'|'session-title'`，上游扩展记入 v2）。
- **上下文增强**：按 `req.callId` 在 `session.events` 反向扫描 `tool/call` 事件（含 `name`+`arguments` JSON），提取受制裁工具的实参（如目标路径、命令）供裁判参考；裁剪体积、失败静默降级为仅凭 `reason`。

## 五、权限层级与预设设计

**内置预设**（对齐 Claude Code 权限模式 / Gemini CLI 分类 / OpenCode YOLO 语义）：

| 预设 | 行为 | 失败/不确定回退 |
|---|---|---|
| `off` | 不介入，全部转人工 | — |
| `strict` 严格 | 仅裁决 `workspace-write` 目标；`danger-full-access` 恒转人工 | 拒绝 |
| `balanced` 均衡（默认） | 裁决全部升级目标 | 转人工 |
| `permissive` 宽松 | 裁决全部目标；不确定视为允许（文档警示） | 转人工 |
| `yolo` | 确定性全部放行，零 LLM 调用 | —（放行） |
| `custom` | 用户自定义规则+提示词 | 可配 |

**权限层级（用户可自定义）**：风险层级 L0（全部拒绝）→ L1（转人工）→ L2~L4（LLM 裁判，严格度递增）→ L5（全放行）；映射规则表：`levels: { workspace-write: <policy>, danger-full-access: <policy> }` + 可选 `tools: { pwsh: <policy>, write: <policy>, ... }` 逐工具覆盖。policy ∈ `allow | judge | delegate | deny`。预设即一份层级表的命名组合，`custom` 全字段开放。

**裁判协议**：小体积 system prompt（安全审计者角色，明确"你不是发起方 agent；只依据事实裁决；存疑即 deny/unsure"）+ 结构化 JSON 输入（toolName、目标模式、justification、工作区根、可选实参摘要），要求输出 `{"decision":"allow|deny|unsure","reason":"..."}`；容错解析（剥代码围栏），非法输出按预设回退。

## 六、调研结论（详见 research-notes.md）

- **Claude Code**：permission modes（default/acceptEdits/plan/bypassPermissions）+ allow/deny rules + PreToolUse hooks —— 分层模式与规则先行、LLM 只兜底争议项。
- **Gemini CLI**：approvals 按类别（bash/fileEdits/webFetch…）allow/ask/deny、smart scope、时限授权、持久化策略批准 —— 类别化层级+有界授权范式。
- **OpenCode**：`--yolo` 一键全自动，社区持续争议其风险 —— "yolo" 预设语义来源。
- **docker-agent**：`llm_judge` 权限提供方——LLM 将请求分级为 allow/deny/ask，与本需求同构的最接近先例。
- **DSH 生态先例**：npm 已有 `dsh-auto-approval` + `dsh-client-ui-auto-approval`，M0 评估其方案后得出"采用 vs 自研"结论（见研究笔记第五节）；缺省按自研 `dsh-yolo-mode`。
- **安全红线（官方仓库讨论）**：沙箱内模型可借 Web 审批回环通道自批准 `danger-full-access`（#250），沙箱/审批边界审计（#451/#454/#817）→ 裁判 prompt 必须与 agent 上下文隔离、裁决只产出一次性 `allowed-once`、永不改写策略，且默认预设不得为 permissive/yolo。

## 七、交付物与实施步骤

> 注：原始计划的实施目录为 `D:\ProjectCollection\插件管理\dsh-yolo-mode`。本仓库重建在当前工作区 `E:\MyProjectCollection\dsh-yolo-mode`，路径引用相应调整。

### M0 — 文档与可行性验证
1. 创建 `docs/requirements.md`（本文档）与 `docs/research-notes.md`（调研明细+链接+对比结论）。
2. 创建 `package.json`（name `dsh-yolo-mode`、v0.1.0、`type: module`、`main: lib/index.js`、零运行时依赖，参照 dsh-notify-windows）、`README.md`（中文，含安装、配置示例、预设表、安全须知）、`CHANGELOG.md`。
3. **本会话内 spike（动态插件，仅观察不改裁决）**：`cordis_define` 一个宿主插件，`prepend` 监听 `approval/request`，记录 req 字段后一律 `next()`，验证拦截顺序（先于人工应答者）与 req 形状；再用固定 prompt 做一次真实 `ctx.llm.stream` 调用验证组装/超时链路。spike 完成后 `cordis_undefine`。

### M1 — 核心实现
4. `lib/policy.js`：纯函数层——预设表、层级规则匹配（目标模式+逐工具）、裁判输出校验/容错解析、回退决策。零依赖、可单测。
5. `lib/judge.js`：裁判调用封装（输入构造、防回环 prompt、流式调用、deadline 超时、BlockAssembler、finish 错误映射、并发信号量上限，溢出→委托）。
6. `lib/index.js`：插件胶水（`export default function(ctx, config)`，config 手工默认合并；prepend 监听、门槛判定、审计日志——`ctx.logger` + `%TEMP%\dsh-yolo\judge.log` 文件审计，参照 notify 插件）；`ctx.effect` 包住全部副作用。
7. `test/policy.test.mjs`：`node --test` 覆盖规则匹配、预设解析、非法输出、回退路径。

### M2 — 安装到本机 web profile 并验证
8. `dsh plugin --profile web add link:<workspace>\dsh-yolo-mode`（写 profile 目录，触发一次沙箱升级授权）。
9. 向 `C:\Users\admin\.dsh\profiles\web\cordis.patch.yml` 追加 `insert` 行（id `yolo-mode`、name `dsh-yolo-mode`、config 示例：preset `balanced` + judge.provider/model 待用户填或实现时用动态插件探针读 `ctx.llm.listProviders()` 建议本机可用路由）。
10. `dsh web --dump-config` 离线校验组合；**本进程即被修改的宿主进程，需用户手动重启 DSH 生效**（不能由 agent 重启，否则杀死当前会话）；重启后做真实升级请求 E2E：裁判放行/转人工/失败回退三条路径。

### M3 — 后续（列入需求文档，不在本次实施）
11. 可选客户端设置 UI（独立包 `dsh-client-ui-yolo-mode`，settings Slot 注册层级规则编辑），评估复用 `dsh-client-ui-auto-approval` 先例；上游提议扩展 `purpose: 'permission-judge'`；决策统计命令 `/yolo-stats`。

## 八、边界情况与失败模式（实现必须覆盖）

- `signal.aborted` → 立即 `cancelled`，不消耗 token；策略 `never` → seam 在瀑布前拒绝，插件天然不介入。
- 无 `callId`/实参缺失 → 降级为仅凭 reason 裁判；reason 非升级格式 → `next()` 透明委托。
- 未配置 provider/model、NO_ADAPTER、限流、超时、非 JSON、tool-call finish → 一律走预设回退（strict→拒绝，其余→转人工），**绝不自动放行**。
- 并发风暴：信号量上限（默认 2），溢出委托人工；裁判调用为辅助调用不写会话消息历史，只记插件日志。
- 子代理会话：默认同样裁决（审计记录 session origin），`includeSubagents` 可配。
- 与既有 `permissionPresets` 的关系：本插件不改变 sandbox/mode 与 approval/policy 词汇，仅在其 `ask` 策略下充当应答者；`danger-full-access+never` 预设下插件无请求可接（语义等价自动全放行但无逐次审计）。

## 九、明确假设与限制

- seam 只支持一次性 `allowed-once`：裁判逐请求运行，无法"记住"授权；这是 seam 的既定限制，写入文档而非绕过。
- `approval/decided` 审计事件只含 outcome；裁判理由存插件日志文件，不进入模型可见上下文。
- 本机 npm registry 直连 SSL 失败，M0 对 `dsh-auto-approval` 的评估依赖 web_search 或安装后本地源码。
- 重启验证需要用户操作；安装步骤的沙箱升级授权会正常走审批 UI（用户点击允许）。

## 十、风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| 模型借 Web 审批回环通道自批准 danger-full-access | 高 | 裁判 prompt 与 agent 上下文隔离；裁决只产一次性 allowed-once；永不改写策略 |
| LLM 裁判误放行危险操作 | 中 | fail-closed 回退；确定性 L0 规则先裁决；默认预设非 permissive/yolo |
| prepend 抢占失败导致被人工应答者先抢答 | 高 | 依赖源码核实的 prepend 机制；spike 验证拦截顺序 |
| 并发升权风暴拖垮 | 中 | 信号量上限（默认 2），溢出委托人工 |
| npm registry SSL 不可达 | 低 | web_search / 安装后本地源码评估 |

## 十一、变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1.0 | 2026-08-14 | 初始计划文档（原始会话重建）；含调研结论、预设设计、架构决策 |
