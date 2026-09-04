# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [0.5.0] - 2026-09-04

### 兼容：DSH 0.1.2-alpha.4

- **peerDependencies 升级**：`dsh-llm` / `dsh-timeout` / `dsh-settings` /
  `dsh-client-connection` / `dsh-client-ui-slots` / `dsh-client-locale` →
  `^0.1.2-alpha.4`；`dsh-client-runtime` / `dsh-host-apiproxy` →
  `^0.1.1-rc.2`（alpha 期未重发，最高仅到 `0.1.1-rc.2`）；`@deepseek-ai/schemastery`
  保持 `^3.18.1`。旧 `^0.1.0-rc.6` 预发布区间按 semver 预发布元组规则不会匹配
  `0.1.2-alpha.4`，会把插件钉死在 rc.8。
- **settings 类服务迁移（lib/settings.js + lib/remote.js）**：alpha.4 删除
  `installSettingsSection` / `settingsNamespace` 函数导出，`ctx.settings` 变为
  `SettingsProvider` 类服务（默认导出）。命名空间改为纯 kebab-case 字符串字面量
  `yolo-mode`（原品牌函数 `settingsNamespace('yolo-mode')` 的产物即同字符串）；
  分区接线改为 `settings.installSection(ctx, ns, schema, entry, hooks)`，
  钩子（`setSource` / `onChange` / `validate`）语义不变。`SettingsConflictError`、
  `settings.mutate` / `describe` / `writable` 均保留，桥接层仅去除品牌调用。
- **真实-Cordis 探针**：新增 `test/probe.test.mjs`，在真实
  `@deepseek-ai/cordis` Context 上挂载插件本体（内存 `SettingsProvider` +
  假 llm + sandboxPolicy stub），覆盖：激活与命名空间注册、取消、透明委托
  （非升权 / 沙箱模式门 / includeSubagents）、`yolo` 预设确定性放行、裁判
  allow（真实 dsh-llm 组装）、settings 用户层更新即时生效。
- **devDependencies**：新增 `@deepseek-ai/cordis ^4.0.2`、`dsh-llm` /
  `dsh-timeout` / `dsh-settings`（alpha.4）、`@deepseek-ai/schemastery`，
  供 `npm test`（`node --test`）直接运行。

## [0.5.0] - 2026-08-28

### 新增

- **决策表翻页**：状态弹窗的最近决策表改为分页展示（每页 5 条，倒序），新增「上一页 / 下一页」+ 页码指示（多页时显示）；刷新导致列表长度跨页边界时自动回到第一页。
- **打开审计日志**：弹窗新增「打开日志」按钮，客户端经新 RPC 端点 `openLogFile` 请求宿主，用 OS 默认应用打开审计 JSONL（macOS `open` / Windows `cmd start` / Linux `xdg-open`）；文件尚不存在返回 `log-not-found`，UI 显示友好提示（含解析出的日志路径）。
- **statusView 携带 auditFile**：生效审计日志路径随 statusView 返回（与主条目 `audit()` 同一解析规则），弹窗展示路径（按钮 title + 说明行）。
- **lib/audit.js 新模块**：审计日志路径解析（`resolveAuditFile` / `defaultAuditFile` / `auditFileExists`）与 OS 打开（`openFileWithDefaultApp` / `openerCommandFor`）抽为独立宿主模块；主条目 `audit()` 与桥接 `openLogFile` 端点共用同一解析规则，杜绝路径不一致。

### 测试

- 新增 `test/audit.test.mjs`（路径解析 / 存在性 / 三平台打开命令）与 `test/state.test.mjs`（statusView 载荷装配含 auditFile）。
- `test/remote-bridge.test.mjs` 增 `openLogFile` 端点用例：文件存在 → 注入 openFile 收到解析路径；不存在 → `log-not-found` 且不调用 openFile；端点常量。
- `test/client.test.mjs` 增 `YoloStore.openLogFile` 转发用例与 Popup 分页渲染用例（20 条 → 5 条/页、翻页器、打开日志按钮与成功提示）。

## [0.4.0] - 2026-08-14

### 新增

- **模型下拉选择**：设置页的 judge `provider` / `model` 改为下拉框，选项来自 Harness 模型配置（`connection.api.llm`），切换 provider 联动清空 model。
- **每预设默认裁判提示词**：`defaultJudgePromptFor(preset)` 为六预设提供默认裁判提示词（strict 最保守、balanced 通用、permissive 宽松、custom 按层级表），`judge.systemPrompt` 留空时自动选用。
- **预设预填充**：切换预设时自动把该预设的默认提示词与层级表填入 `systemPrompt` / `levels`（选 `custom` 留空）；`statusView` 返回 `presetDefaults`。

## [0.3.0] - 2026-08-14

### 变更（UI 重做，对齐 dsh-plugin-subagent-director 参考架构）

- **独立桥接条目**：新增 `./bridge` 入口（`lib/bridge-entry.js`，`inject: ['webServer','settings']`），自发布 `/yolo-mode` 前缀路由。修复 v0.2.0 根因——宿主 `webServer` 只能经 `inject` 取得，树外插件 `ctx.get('webServer')` 永远拿不到（参考项目已实测）。
- **RPC 信封桥**：`/yolo-mode` 上实现 `settingsView` / `settingsMutate` / `statusView` 三端点，语义镜像 connection RPC 通道（loopback 围栏、乐观 revision 冲突、redacted 视图、路径 op）。
- **settings 规范布线**：改用 `installSettingsSection`（`@deepseek-ai/dsh-settings`），行 config 作为 `base` 层；`effectiveConfig() = normalizeConfig(resolved)`；移除手写 mergeConfig。
- **客户端 rolldown 构建**：`src/client/*.js` → `scripts/build-client.mjs`（rolldown，external react/@deepseek-ai）→ `lib/client/index.js`；客户端 `inject: ['slots','locale','connection','remote']`，locale 双语字典、`bindSnapshotSelector` 快照 store、`connection.rpc.call` 走桥、revision 冲突机。
- **主条目 inject**：`export const inject = ['llm','settings']`（命名导出插件，非 default 函数）。

## [0.2.0] - 2026-08-14

### 新增

- **客户端 UI（双面包）**：`dsh-yolo-mode` 声明 `dsh.client` 并导出 `lib/client.js`（手写 ModuleLoader 工厂，零构建），提供三处界面：
  - 输入栏左侧状态 chip（`conversation.input.left`，显示 `YOLO <preset>`，点击开关弹窗）；
  - 全局面板（`shell.overlay`）：运行统计（总审批/放行/拒绝/转人工）+ 最近 20 条决策表 + 刷新；
  - 设置页（`settings.section`，'YOLO 审批'）：预设/生效模式/judge 参数/levels JSON 的在线编辑与保存。
- **HTTP API**：`GET /plugins/yolo-mode/status`（状态与统计）、`POST /plugins/yolo-mode/config`（配置校验后持久化），由宿主 webServer 路由提供。
- **settings 集成**：settings 命名空间 `yolo-mode`（自由 JSON 分区，落盘 settings.yaml）；`effectiveConfig()` 每次裁决将插件行 config 与 settings 分区合并规范化，配置改动即时生效（无需重启）。
- **内存统计**：每次裁决累计 total/allowed/rejected/delegated 与最近 20 条决策环形缓冲。
- **judge 实例缓存**：按 judge 配置键缓存裁判实例，配置变化自动重建。

### 变更

- package.json：version 0.2.0；exports 增加 `./client`；peerDependencies 增加 `react`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/schemastery`。

### 已知限制

- 已挂载插件行的**模块代码**更新需要重启 DSH 才能重新导入（patch 热重载只覆盖新行挂载与 config 变更）；v0.1.0 → v0.2.0 升级后请重启 DSH 并刷新浏览器。

## [0.1.0] - 2026-08-14

### 新增

- **宿主侧审批应答插件**：作为 `approval/request` seam 的应答者，在会话处于可写沙箱模式且审批策略为 `ask` 时，用 LLM 自动裁决沙箱升权申请。
- **抢占注册**：以 `ctx.on('approval/request', handler, { prepend: true })` 抢占监听列表头，抢在人工应答者之前裁决。
- **前置门槛**：按 `ctx.sandboxPolicy.resolve({session})` 校验当前有效模式，仅处理位于 `modes` 列表（默认 `['workspace-write']`）内的会话。
- **内置预设**：`off` / `strict` / `balanced`（默认）/ `permissive` / `yolo` / `custom`，各含 `workspace-write` 与 `danger-full-access` 的处置策略与失败 / 不确定回退。
- **自定义层级**：`levels` 支持目标模式、`error` / `unsure` 回退、以及逐工具 `tools.<toolName>` 覆盖，`custom` 预设全字段开放。
- **LLM 裁判封装**：基于 `@deepseek-ai/dsh-llm`（`BlockAssembler` / `createUserMessage` / `llm.stream`）与 `@deepseek-ai/dsh-timeout`（`deadline`）实现，含并发信号量上限与超时。
- **裁决策略映射**：`allow → allowed-once`、`deny → rejected`、`delegate → next()`、`judge → 裁判`；失败 / 不确定按预设 fail-closed 回退。
- **JSONL 审计**：`ctx.logger` + 文件（默认 `%TEMP%/dsh-yolo/judge.log`）记录每次裁决的明细。
- **纯函数策略层** `lib/policy.js`（零依赖，可单测）与单元测试 `test/policy.test.mjs`、`test/judge.test.mjs`。

### 安全

- fail-closed：任何错误、超时、非法输出、工具块、并发溢出路径均不放行。
- 裁判 prompt 与 agent 上下文隔离，防审批回环自批准。
- 默认预设为 `balanced`（不确定 → 转人工），不默认启用 `permissive` / `yolo`。
