# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [0.6.2] - 2026-09-27

### 修复：插件详情页的配置卡在引言、表单永不出现

现象：0.6.1 起配置区块已出现在插件详情页，但只画出引言一句，表单始终不渲染。

根因（浏览器控制台实锤）：

```
Uncaught (in promise) Error: cannot get property "remote.session" without inject
    at YoloStore._fetchRemoteDirectory (store.js)
    at async Promise.all (index 2)
    at async YoloStore.load (store.js)
```

- `_fetchRemoteDirectory()` 中的 `this.remote.session` 在 **try 块之外**，而客户端的 Remote
  代理是**按 inject 声明做门禁**的：读取未声明的命名空间会**抛错**，而不是返回 undefined。
  插件当时只声明了 `remote.llm`，**漏了 `remote.session`**。
- 而 `load()` 的 `Promise.all` **没有 try/catch**，这一抛就把 `status` 永久钉在 `loading`：
  界面既不显示表单、也不显示错误，只剩引言那一句（这个静默失败本身也是缺陷）。

修复：

- `dsh.client.inject` 与源码的 `inject` 导出都补上 **`remote.session`**（`remote.llm` 同理，
  两个命名空间都必须声明，缺一即抛）。
- `store.js`：两处 Remote 命名空间属性读取移入 `try/catch`，缺失时**降级为「无目录」**，
  不再 reject `load()`。
- `store.js`：`load()` 整体包 `try/catch`，桥/传输 reject 时置 `status:'error'` 并保留原因，
  不再静默停在 `loading`。
- 测试 +3（**141/141**）：inject 必须含两个 Remote 命名空间；`remote.session` /
  `remote.llm` 属性读取抛错时目录降级且 `status` 仍 `ready`；桥 reject 时 `status='error'`
  且带原始原因。

## [0.6.1] - 2026-09-27

### 修复：配置位置改到插件详情页（0.6.0 放错了地方）

0.6.0 把配置放进了输入框旁的 `YOLO <预设>` 胶囊浮层（`shell.overlay`）——那是**状态与日志**
的位置，不是「插件的配置面板」。本次改用 DSH 插件管理页声明的专用槽位：

- **新增 `plugins.bundle.config` 注册**（key = npm 包名 `dsh-yolo-mode`）：配置渲染在
  「插件列表 → dsh-yolo-mode」页面的**描述与组件行之间**。该槽位是 keyed slot，页面仅在
  有注册者（且 key 等于包名）时才渲染配置区块
  （`dsh-client-ui-plugin-manager`：`configured = ledger.bundles.has(pkg.name)`）——
  这正是此前该页面完全没有配置区的原因。
- bundle 页可容纳多个条目，因此页面**不传宿主 `form`**，由本插件自持草稿、校验与保存
  （仍走 `/yolo-mode` 设置桥 + 乐观修订锁）。`view === 'summary'` 时不渲染
  （bundle 页只请求 `page`）。
- **胶囊浮层回归纯状态/日志**：撤销 0.6.0 给 `shell.overlay` 加的「配置 / 状态与日志」双标签；
  点胶囊仍是原来的统计卡 + 裁决表分页 + 打开日志 + 刷新。
- 文案 `tabConfig` / `tabStatus` 退役（不再有标签页）；`settings.section` 保持退役。

## [0.6.0] - 2026-09-27

### 变更：全部配置移入插件自身 UI 面板（设置页退役）

- **移除 `settings.section` 注册**（原 id `yolo-mode`，order 25）：不再向 DSH 设置面板
  注册任何页面，全部配置项改由插件自身的 UI 面板承载 —— 点击输入框左侧的
  `YOLO <预设>` 胶囊打开（slot `shell.overlay`）。
- 面板新增 **配置 / 状态与日志** 两个标签，默认打开「配置」：
  - 「配置」渲染原设置页的完整表单（预设 / 模式 / 裁判供应商与模型 / 超时 / 最大令牌 /
    并发 / 系统提示词 / 层级表），保存仍走 `settingsMutate` 路径操作 + 乐观锁；
  - 「状态与日志」保留统计卡、裁决表分页、「打开日志」与「刷新」。
- `src/client/ui/SettingsSection.js` → `src/client/ui/ConfigForm.js`（导出名
  `ConfigForm`）；组件内部逻辑不变，仅宿主从设置页改为面板。
- 文案 `nav` 退役，新增 `tabConfig` / `tabStatus`（中英双语）。

### 修复：依赖解析与构建可复现

- `peerDependencies` 移除两个**已停更**的官方包：`@deepseek-ai/dsh-host-apiproxy`
  与 `@deepseek-ai/dsh-client-runtime`（npm 上分别止于 `0.1.1-rc.2`）。二者此前仅为
  `import type` 引用（`verbatimModuleSyntax` 下会被擦除），却会让全新克隆的 `npm ci`
  因无法解析已停更 peer 而直接失败。
- `devDependencies` 的 `@deepseek-ai/dsh-llm` / `dsh-timeout` / `dsh-settings` 由
  `^0.1.7-rc.1` 收紧为精确 `0.1.7-rc.2`：DSH 预发布包内部使用**精确 peer**，
  rc.1 与 rc.2 混装会触发 `ERESOLVE` 冲突。现在可 `npm ci && npm test`（无需
  `--legacy-peer-deps`）。
- `scripts/build-client.mjs` 移除硬编码开发机回退路径
  （`E:/MyProjectCollection/Plugins/dsh-subagents-options/package.json`），改为在
  缺少 `rolldown` 时抛出可操作的错误提示。
- `package-lock.json` 重新生成（`resolved` 全部指向 `registry.npmjs.org`）。

## [0.5.3] - 2026-09-25

### 兼容：适配 DSH 0.1.7-rc.2

- 在本机 **0.1.7-rc.2** 上真实装载运行通过：全部入口激活、零错误、无 pending
  （`did not activate` 告警不出现）；设置读写（`settingsView` / `settingsMutate`
  乐观锁）实测往返成功。`dsh.compatibility.dshReleases` 新增
  `"0.1.7-rc.2": "compatible"`；README 徽章与兼容性说明同步。
- 0.1.7-rc.1 → rc.2 的官方 `@deepseek-ai/dsh-*` 公开 API **无移除、无改名**
  （`dsh-settings` / `dsh-client-connection` / `dsh-client-ui-slots` 逐字节相同，
  其余为增量新增），本插件无源码适配需求。

### 修复：设置页「供应商」下拉为空

设置页 `judgeProvider` 下拉始终为空。根因：0.1.7 起客户端 `connection.api.llm`
已不存在，store 构造时 `this.llm` 恒为 `null`，`_fetchLlmDirectory()` 直接返回空数组。
本次改为经客户端 Remote 服务读取：

- **供应商**：`ctx.remote.llm.listProviders()`（已注册路由）与
  `listConfigurableProviders()`（已声明可配置）经 `joinProviderDirectory` 合并为与官方
  settings-models 页一致的 `{provider, displayName}` 行。
- **模型**：`ctx.remote.session.modelCatalog()` 的 `groups`（按 provider 分组），
  与官方同一数据源。
- **inject**：`package.json` 的 `dsh.client.inject` 与客户端 `inject` 数组新增
  `"remote.llm"`。
- **降级保留**：无 `remote.llm` 命名空间时回退旧 `connection.api.llm`；目录读取失败
  不致命，仍回退自由文本输入（既有设计不变）。

### 测试

- 新增 `store-logic.joinProviderDirectory` 与 4 项 `YoloStore` `remote.llm` /
  `remote.session` 单测（目录填充、失败非致命、legacy 回退、remote 优先）；
  `npm test` 137 项全绿。
- 本机无浏览器，客户端 UI 未在浏览器中实际渲染验证；已核对 `npm pack` 产物经
  0.1.7-rc.2 profile 装载后**被服务的**客户端 bundle 含 `remote.llm.listProviders`
  / `listConfigurableProviders` / `session.modelCatalog`，且宿主 `llm/listProviders`、
  `session/modelCatalog` 实测返回非空目录（供应商下拉将填充 5 项）。

### Beta 说明

- 测试版 `0.5.2-beta.0`（`--tag beta`）的内容——设置子系统迁移至 DSH 0.1.7 的
  `SettingsForms`——随本版一并正式发布，详见下方 `0.5.2` 条目。

## [0.5.2] - 2026-09-24

### 兼容：设置子系统迁移至 DSH 0.1.7-rc.1 的 `SettingsForms`

DSH 0.1.7 移除了 `@deepseek-ai/dsh-settings` 的 `SettingsProvider.installSection`
（默认导出改为 `SettingsForms`），本插件原设置子系统因此在新版抛
`TypeError: settings.installSection is not a function` 而无法激活。本次按官方新模型重写：

- **设置声明 → 插件 Config schema**（`lib/settings.js` 的 `YoloSettingsSchema`，
  经 `lib/index.js` 的 `export const Config` 暴露）：每个顶层字段标注
  `.volatile()`，声明为可热更——写回经 loader 的就地更新，插件无需重启即可生效
  （与旧模型「只改某些字段不重启」行为一致）。
- **设置读取 → `config.<field>.get()`**（`readYoloConfig`）：`effectiveConfig()`
  每次裁决读取实时解析值（schema 默认 + 条目 config），再 `normalizeConfig`。
- **页面策略 → `settings.configure({ auto: false }, fiber)`**
  （`installYoloSettingsPage`）：插件自带 Web 设置页，`auto:false` 禁止宿主再自动
  生成重复页面；settings 服务缺失时零侵入跳过。
- **自发布设置桥与客户端不变**：`lib/remote.js` 的 `settingsView` / `settingsMutate`
  端点本就建立在 `describe` / `mutate` / `writable` / `SettingsConflictError` 之上，
  这些方法面在 `SettingsForms` 中保持不变，端点形状与乐观锁语义无需改动，客户端
  无需改动。
- **双层 → 单层映射**：旧「插件行 config 为 base 层 + settings.yaml 用户层」映射为
  0.1.7「Profile 插件条目 config 单层」；旧 `settings.yaml` 由
  `SettingsForms.importLegacyDocument` 一次性导入到 Profile。

### 兼容性

- `peerDependencies` 的 `@deepseek-ai/dsh*` 下限提升至 `^0.1.7-rc.1`（`dsh-host-apiproxy`
  / `dsh-client-runtime` 两个历史例外保持 `^0.1.1-rc.2`）。
- `dsh.compatibility.dshReleases` 增列 `0.1.7-rc.1: compatible`。
- README 徽章与兼容性行同步至 0.1.7-rc.1。

### 测试

- `test/probe.test.mjs` 重写至 0.1.7 API：真实 cordis 经 Config schema 解析条目
  config、断言 `configure({auto:false})` 被调用、并用 cosmokit `updateVolatile`
  （loader `_commitVolatile` 的同一原语）验证 volatile 就地更新后裁决即时生效。
- 其余测试文件保持通过；`npm test` 132 项全绿。

## [0.5.1] - 2026-09-22

### 修复：裁判对推理型模型恒失败（Issue #1）

- **默认 `judge.maxTokens` 256 → 4096**（`lib/policy.js` 默认配置与 `normalizeConfig`
  合并值、`lib/judge.js` 兜底值同步）。根因：推理型裁判模型把 token 预算全部消耗在
  reasoning 块上，`maxTokens` 过小时 `content` 为空（`finish_reason=length`），裁判抛
  `BAD_OUTPUT` 并按 `error` 回退——`balanced` 预设下表现为「每次都转人工」，而
  `judgeConfigured:true` 掩盖了失败。用户实测 4096 为可用值（256/1024 输出为 0）。
- **审计条目新增 `error` 字段**（`lib/index.js`）：裁判失败时写入 `JudgeError.code`
  （`BAD_OUTPUT` / `TIMEOUT` / `STREAM_ERROR` / `NO_ADAPTER` 等），使
  `outcome:"delegate"` 的条目可区分「裁判失败转人工」与「裁判主动授意转人工」；
  成功路径字段形状不变（不新增 `error`）。
- **失败可见**（`lib/state.js`）：新增 `stats.judgeFailures` 计数与
  `judgeHealth.lastError/lastErrorTime`，经 `getStatusPayload` 以
  `judgeErrors: { count, lastError?, lastErrorTime? }` 暴露；裁判异常不再仅停留于
  `logger.warn`。
- **文档**：README 标注推理型模型必须调大 `judge.maxTokens`（默认已改 4096），并补充
  审计 `error` 字段与 `judgeErrors` 载荷说明。

### 测试

- `test/policy.test.mjs`：默认 `maxTokens` 断言更新为 4096。
- `test/judge.test.mjs`：新增「未显式传 `maxTokens` → 默认 4096 传入 `llm.stream`」用例。
- `test/state.test.mjs`：新增裁判失败时 `judgeFailures` 递增、`judgeErrors` 载荷装配用例。
- `test/probe.test.mjs`：新增真实-Cordis 用例——裁判产出非 JSON（`BAD_OUTPUT`）→
  审计条目带 `error:"BAD_OUTPUT"` 且回退 delegate；成功路径断言 recent 条目**不含** `error`。

### 兼容性

- **新增 `dsh.compatibility` 声明**（DSH STORE 上架契约）：逐版本声明
  `dshReleases` 兼容矩阵——`0.1.5-rc.1` / `0.1.5-rc.2` / `0.1.6-alpha.2` 均为
  `compatible`（三版本已在本机真实装载运行，插件正常加载、零错误）；`node` 范围
  `>=20`，与 `engines.node` 一致。未实测的版本不声明（扫描时按 `unknown` 处理）。

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
