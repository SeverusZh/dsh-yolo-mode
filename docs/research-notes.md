# research-notes —— dsh-yolo-mode 调研明细

> 重建自跨主机会话日志（`session-adb186db-...`），整理 Turn 1 联网调研 + Turn 4 `dsh-auto-approval` 源码级评估。

## 一、调研背景

为"DSH 自动审批权限申请插件"做两类调研：
1. **DSH 内部机制**：研读 `D:\DeepSeekHarness` 源码，确认 approval seam、沙箱策略、插件挂载与 LLM 辅助调用范式。
2. **外部成熟实践**：Claude Code / Gemini CLI / OpenCode / docker-agent 的权限分级；DSH 生态已存在的 `dsh-auto-approval` 包。

## 二、DSH 内部机制（源码核实）

- **审批 seam**：`approval/request` waterfall 事件是唯一应答点；监听器可裁决或 `next()` 委托。裁决词汇：`allowed-once / rejected / cancelled / unavailable`。
- **抢占顺序**：`ctx.on('approval/request', handler, { prepend: true })` 可抢占人工应答者；patch 层 `insert` 仅追加到组合末尾（`applyEntryPatches` 无 before/after），人工应答者 `dsh-host-apiproxy` 在 bundle 层先注册 → 必须 prepend。
- **升权 reason 格式**：`escalate sandbox to <mode>: <justification>`，匹配正则 `^escalate sandbox to (workspace-write|danger-full-access): (.+)$`。
- **会话事件**：`tool/call` 含 `callId` + `arguments`（JSON），可反向扫描做裁判上下文增强。
- **沙箱策略**：`ctx.sandboxPolicy.resolve({session})` → `{mode, workspaceRoot}`。
- **LLM 辅助调用**：`ctx.llm.stream({provider, model, messages:[createUserMessage], system, maxTokens, signal})` + `BlockAssembler` + `deadline(signal, timeoutMs, code)`（参考 `dsh-session-title-llm`）；`purpose` 是封闭联合 `'compaction'|'session-title'`，裁判调用需省略或 v2 上游扩展。
- **相关包**：`dsh-user-approval`（审批栈）、`dsh-sandbox*`（沙箱）、`dsh-permission-presets`（权限预设）、`dsh-llm`（模型路由）。

## 三、外部成熟实践

### Claude Code
permission modes（default/acceptEdits/plan/bypassPermissions）+ allow/deny rules + PreToolUse hooks。
**范式借鉴**：分层模式与规则先行、LLM 只兜底争议项。
[docs](https://code.claude.com/docs/en/permission-modes)

### Gemini CLI
approvals 按类别（bash/fileEdits/webFetch…）allow/ask/deny、smart scope、时限授权、持久化策略批准。
**范式借鉴**：类别化层级 + 有界授权。
[DeepWiki 审批模式](https://deepwiki.com/waywardgeek/gemini-cli/7.5-approval-modes-and-confirmation) · [PR #23257](https://github.com/google-gemini/gemini-cli/pull/23257)

### OpenCode
`--yolo` 一键全自动，社区持续争议其安全风险 —— "yolo" 预设的语义来源。
[Issue #8463](https://github.com/anomalyco/opencode/issues/8463) · [PR #11833](https://github.com/anomalyco/opencode/pull/11833)

### docker-agent (llm_judge)
`llm_judge` 权限提供方——LLM 将请求分级为 allow/deny/ask。与"LLM 自动裁决升权"同构，是最接近的先例。
[llm_judge.yaml](https://github.com/docker/docker-agent/blob/main/examples/llm_judge.yaml) · [permissions 文档](https://docs.docker.com/ai/docker-agent/configuration/permissions/)

### 安全红线（DeepSeek Harness 官方仓库）
- **#250**：沙箱内模型可借 Web 审批**回环通道**自批准 `danger-full-access`。
- **#451 / #454 / #817**：沙箱/审批边界审计报告。

→ 本插件的裁判 prompt 必须**与 agent 上下文隔离**、裁决只产出**一次性 `allowed-once`**、**永不改写策略**，且**默认预设不得为 permissive/yolo**。

## 四、DSH 生态先例：dsh-auto-approval（npm 包）

### 基本信息
| 项 | 内容 |
|---|---|
| 包名 | `dsh-auto-approval`（host）+ `dsh-client-ui-auto-approval`（client） |
| 作者/维护者 | Andy8647 |
| 仓库 | [github.com/Andy8647/dsh-auto-approval](https://github.com/Andy8647/dsh-auto-approval)（公开 monorepo） |
| 版本 | 0.1.0（发布于 2026-08-13，评估时仅 1 天），33 commits 单作者 |
| 代码规模 | TypeScript strict + vitest + tsdown；host 半源码约 80KB / 9 模块 |
| 依赖 | 运行时仅 `schemastery` + `zod`；`@deepseek-ai/*` 全部 peerDependencies（DSH 提供） |
| 安装方式 | 声明 `dsh.bundle.patch`，`dsh plugin --profile web add dsh-auto-approval` 即自动挂载 |

### 设计（源码已读）
核心定位：给 DSH approval policy 加第三档 `auto`——挂 `tools/pre-execute` 瀑布**最前**（`prepend: true`），对每个工具调用做**两态 allow/deny**，全托管不转人工。

分层决策管线（`src/index.ts`）：
1. **L0 规则引擎**：`denyPatterns` 正则黑名单（`rm -rf /`、`mkfs.`、`curl|sh` 供应链类）；自毁护栏（`killall/pkill/taskkill/Stop-Process` 整类 deny，`kill <具体PID>` 留逃生通道）；只读/文件写入工具白名单直通；`bashCommandPrefixes` 前缀白名单。L0 deny 同时注册 `ctx.tools.guard()` 单调 guard 双保险。
2. **L1 LLM 分类器**（可选，配 `classifierFastProvider/Model` 后启用）：**两阶段**——fast 单 token 过滤（`0`=allow，maxTokens16），flagged 才进 deep CoT 深查（末行 `VERDICT: ALLOW|DENY`）。**防注入**：输入只看"用户消息 + 当前 tool call 参数"，不看 assistant 推理和 tool 输出；超时/解析失败/模型不可用一律 fail-closed 转 **deny**。
3. **沙箱 escalation 豁免**：带 `sandbox_permissions` 参数的调用跳过 L1 直接 `next()`——人工审批弹窗照常。

配置走 `~/.dsh/settings.yaml` 的 `auto-approval:` 节（热重载）；审计落 `~/.dsh/logs/auto-approval.log`（JSON 行）。client 伴侣包在输入栏权限选择器旁显示 "AA on" 状态 chip，经 Typert remote 读 host 内存态。

**已知限制**（README 自述）：Web UI 设置页无 section（api-proxy 暴露白名单硬编码）；写 session 事件会致会话重启打不开故默认关闭；全托管下不确定即拒绝，无"转人工"档。

### 开源许可：BSD-3-Clause ✅ 可 fork
- ✅ 允许：修改、商用、闭源再发布、fork 改名、合并到自有项目。
- ⚠️ 三项义务：①源码再分发保留版权声明与许可全文；②二进制分发文档附同样声明；③不得用作者名义背书衍生品。
- 无需开源衍生代码、无需贡献回上游。

## 五、对本需求的意义：互补而非替代 ⚠️ 关键结论

| 维度 | `dsh-auto-approval` | 本需求（dsh-yolo-mode） |
|---|---|---|
| 挂载点 | `tools/pre-execute`（调用执行前分类） | `approval/request` 瀑布（审批 seam 应答者） |
| 裁决对象 | 每个工具调用的危险性（bash/run_code 为主） | workspace-write 下的沙箱升权申请（`escalate sandbox to …`） |
| 人工兜底 | 无（不确定即 deny，全托管） | 有（不确定转人工 Web 审批） |
| 对升权申请 | **主动跳过**（避免双重审批） | **正是目标场景** |

它明确把沙箱升权申请留给人工审批——恰好是本需求要求"用大模型判断 workspace-write 模式下权限申请"的目标场景。**直接 fork 不能交付本需求**，但两者分层互不冲突，可共存：它管"调用危不危险"，本插件管"文件边界越不越权"。

**可复用的资产**（约 40% 脚手架）：`classifier.ts` 两阶段判定 + fail-closed、防注入输入范围、`config.ts` schemastery 默认值 + fail-loud、settings 热重载、审计日志、client chip/remote 状态模式。
**必须新写的**：`approval/request` 应答者（prepend）、escalation reason 解析、`sandboxPolicy` 门槛、不确定→转人工回退链、预设方案（off/strict/balanced/permissive/yolo）。

## 六、路线建议（推荐 A）

- **路线 A（推荐）**：自研 `dsh-yolo-mode`（按既定计划），代码层吸收其已验证模式并注明出处；BSD-3-Clause 允许引用，保留 LICENSE 声明即可；两者可并行、功能互补不冲突。
- **路线 B**：fork 后在 monorepo 内新增 approval-seam 应答模块；适合维护"调用级分类 + 升权审批"全家桶并愿跟进上游 0.x 迭代。
- **路线 C**：直接安装现成包试用；零开发成本，但只能做调用级分类，解决不了升权审批场景。
