# dsh-yolo-mode

`dsh-yolo-mode` 是一个 DeepSeek Harness (DSH) 宿主侧插件：当会话处于可写沙箱模式、且当前审批策略为 `ask` 时，使用大模型（LLM）自动裁决沙箱**升权申请**（`escalate sandbox to <targetMode>: <justification>`），并根据用户选择的预设 / 自定义层级决定是「放行 / 拒绝 / 转人工」。它不改变 DSH 既有的沙箱模式与审批策略词汇表，仅在 `ask` 策略下作为审批应答者介入。**任何不确定或失败路径都不放行（fail-closed）。**

> 版本：v0.2.0 ｜ 详见 [CHANGELOG.md](CHANGELOG.md)。v0.2.0 起为双面包：附带客户端 UI（状态 chip、统计面板、设置页）。

---

## 〇、界面（v0.2.0）

- **输入栏状态 chip**：会话输入栏左侧显示 `YOLO <preset>`，点击弹出统计面板（总审批 / 放行 / 拒绝 / 转人工 + 最近 20 条决策）。
- **设置页**：设置面板新增「YOLO 审批」页，可在线修改预设、生效沙箱模式、judge 参数与 levels 层级（JSON），保存后**即时生效**（持久化到 settings.yaml）。
- 配置优先级：插件行 `config` 为基底，设置页保存值覆盖其上；行 config 中的 `judge.provider/model` 仍可用于首次启用裁判。
- 升级到 v0.2.0 后请**重启 DSH 并刷新浏览器**（已挂载插件行的模块代码更新需重启才能重新导入）。

## 一、功能简介

- 拦截 `approval/request` seam，仅对形如 `escalate sandbox to workspace-write|danger-full-access: ...` 的升权申请介入，其余请求透明委托给后续应答者（如人工 Web 审批 UI）。
- 前置门槛：`ctx.sandboxPolicy.resolve({session})` 得到会话**当前有效沙箱模式**，仅当该模式在本插件的 `modes` 列表内才参与裁决（默认 `['workspace-write']`）。
- 依据 `preset` / `levels` 决定每个请求的处置策略（`allow | judge | delegate | deny`）。
- `judge` 路径调用 LLM 裁判，输出 `{"decision":"allow|deny|unsure","reason":"..."}`；裁判失败 / 超时 / 非法输出时按预设回退（拒绝或转人工），**绝不自动放行**。
- 每次裁决均写入 JSONL 审计日志（`ctx.logger` + 文件，默认 `%TEMP%/dsh-yolo/judge.log`）。

## 二、安装

需要两步：先用 `dsh plugin` 安装本包，再把它作为一行插入到目标 profile 的 `cordis.patch.yml`。

### 步骤 1：安装插件包

在 DSH 宿主环境中，向目标 profile（例如 `web`）注册本包。安装指向**项目绝对路径**：

```bash
dsh plugin --profile web add <项目绝对路径>
```

> `dsh plugin --profile <name> add <pkg>` 转发 pnpm，支持本地路径 / link。

### 步骤 2：追加 insert 行到 profile patch

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（`$DSH_HOME` 通常为 `C:\Users\<user>\.dsh`），在顶层 YAML 数组中追加一个 `insert` 元素：

```yaml
- insert:
    - id: yolo-mode
      name: dsh-yolo-mode
      config:
        preset: balanced
```

`insert` 仅追加到组合末尾；由于人工应答者在 bundle 层先注册，本插件在内部以 `ctx.on('approval/request', handler, { prepend: true })` 抢占监听列表头，确保轮到自己先裁决。

profile 的 `cordis.patch.yml` 由 `watchUserPatches` **热重载**：保存后新行即挂入运行中的宿主组合（实测无需重启即可 ACTIVE；若加载失败，宿主保留上一棵好树并记录 `hmr/config-update-failed`）。重启 DSH 始终是最稳妥的兜底方式。

## 三、配置参考表

插件行的 `config` 全字段可选，未填字段按下列默认值手工合并（手工合并，不引入 schemastery；非法值将导致插件加载失败，fail-loud）。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `preset` | `'off'\|'strict'\|'balanced'\|'permissive'\|'yolo'\|'custom'` | `balanced` | 使用的内置预设；`custom` 时以 `levels` 为准，见预设表。 |
| `modes` | `string[]` | `['workspace-write']` | 会话有效沙箱模式 ∈ 此列表时才介入；只读会话默认不介入。合法项：`read-only`、`workspace-write`、`danger-full-access`。 |
| `levels` | `object` | `{}` | `preset=custom` 时的层级表；`levels.tools.<toolName>` 可对**任意预设**逐工具覆盖（见后文「权限层级」）。 |
| `judge.provider` | `string` | `''` | 启用 LLM 裁判所必需；空串视为未配置，`judge` 决策一律按错误回退。 |
| `judge.model` | `string` | `''` | LLM 裁判所用模型；与 `provider` 同非空才创建裁判实例。 |
| `judge.systemPrompt` | `string` | `''` | 裁判 system prompt；空 = 内置安全审计者 prompt。 |
| `judge.timeoutMs` | `number` | `20000` | 裁判单次调用超时（毫秒），必须是正整数。 |
| `judge.maxTokens` | `number` | `256` | 裁判输出最大 token 数，必须是正整数。 |
| `judge.concurrency` | `number` | `2` | 并发裁判信号量上限，超出则抛出 `OVERLOAD` → 按错误回退；必须是正整数。 |
| `includeSubagents` | `boolean` | `true` | 子代理会话是否同样裁决；为 `false` 时子代理请求转人工（审计仍记录 `origin`）。 |
| `auditFile` | `string` | `''` | 审计 JSONL 文件绝对路径；空 = 使用默认 `%TEMP%/dsh-yolo/judge.log`。 |

### 权限层级（`levels`）

`levels` 形如（`workspace-write` / `danger-full-access` / `error` / `unsure` 行仅在 `preset=custom` 时生效；`levels.tools` 对任意预设生效）：

```yaml
levels:
  workspace-write: judge        # 目标模式 → 策略
  danger-full-access: judge
  error: delegate               # 裁判错误回退（custom 时生效）
  unsure: delegate              # 裁判不确定回退（custom 时生效）
  tools:
    pwsh: delegate              # 逐工具覆盖，优先级最高
    write: allow
```

- `policy ∈ allow | judge | delegate | deny`。
- `resolvePolicy` 优先级（高 → 低）：`levels.tools[toolName]` → 基础行（`preset=custom` 时为 `levels[targetMode]`，缺省 `delegate`；其余预设为内置预设表）。

## 四、预设表

内置六种预设。`off` / `permissive` / `yolo` 不产生 LLM 调用（`yolo` 确定性全放行，`off` 全部转人工）。

| 预设 | `workspace-write` | `danger-full-access` | 裁判失败回退（error） | 裁判不确定回退（unsure） | 说明 |
|---|---|---|---|---|---|
| `off` | delegate | delegate | delegate | delegate | 不介入，全部转人工。 |
| `strict` 严格 | judge | delegate | rejected | delegate | 仅裁决 `workspace-write` 目标；`danger-full-access` 恒转人工；裁判错误 → 拒绝。 |
| `balanced` 均衡（默认） | judge | judge | delegate | delegate | 裁决全部升级目标；失败 / 不确定 → 转人工。 |
| `permissive` 宽松 | judge | judge | delegate | **allowed-once** | 裁决全部目标；**不确定视为允许**（文档警示，慎用）。 |
| `yolo` | allow | allow | —（放行） | —（放行） | 确定性全部放行，零 LLM 调用。 |
| `custom` | 依 `levels` | 依 `levels` | 依 `levels.error` | 依 `levels.unsure` | 全字段开放；缺省回退 `delegate`。 |

裁决词汇：`allow → allowed-once`（放行）、`deny → rejected`（拒绝）、`delegate → next()`（转人工 / 委托后续应答者）。`judgeFallback` 返回值域为 `allowed-once | rejected | delegate`：`strict+error → rejected`；`permissive+unsure → allowed-once`（文档警示）；其余组合 `→ delegate`；`custom` 读 `levels.error` / `levels.unsure`。

## 五、安全须知

- **fail-closed**：任何错误、超时、非 JSON、工具块、信号量溢出路径都不会放行；只有明确得到 `allow` 才返回一次性 `allowed-once`。
- **防回环**：裁判 prompt 与 agent 上下文隔离；prompt 强调「你不是发起方 agent，只依据事实裁决；存疑即 deny/unsure；绝不因发起方的目标 / 意图放行」，防止模型借 Web 审批回环自批准 `danger-full-access`（DSH 上游已关注的 #250 类问题）。
- **绝不改写策略**：本插件不改变 DSH 的 `sandbox` / `approval` 策略词汇，也不改写任何审批策略，仅在 `ask` 下作为应答者；`never` 策略下 seam 在瀑布前直接拒绝，插件天然无请求可接。
- **默认预设非宽松**：默认预设为 `balanced`（不确定 → 转人工），不默认使用 `permissive` / `yolo`。
- **`permissive` 与 `yolo` 警示**：`permissive` 会把裁判「不确定」视为允许，`yolo` 直接全部放行，二者都会显著放大风险，仅建议在可信环境下使用。
- **审计日志**：每次裁决追加一行 JSONL 到 `auditFile`（默认 `%TEMP%/dsh-yolo/judge.log`），含 `{time, sessionId, origin, toolName, callId?, targetMode, currentMode, justification, decision, outcome, reason?}`。请定期检查；生产环境建议配置到持久化路径。

## 六、文件结构

```
dsh-yolo-mode/
├── package.json            # name dsh-yolo-mode, v0.1.0, type: module, main: lib/index.js
├── README.md               # 本文档
├── CHANGELOG.md            # 版本变更
├── LICENSE                 # MIT
├── .gitignore
├── docs/                   # 需求与设计 / 调研文档
├── lib/
│   ├── policy.js           # 纯函数策略层（零依赖、可单测）
│   ├── judge.js            # LLM 裁判封装（依赖 peer：dsh-llm / dsh-timeout）
│   └── index.js            # 插件胶水（默认导出）
└── test/
    ├── policy.test.mjs     # node --test
    └── judge.test.mjs      # node --test（假 llm，不发真实网络）
```

## 七、开发

```bash
npm test    # node --test 全量测试（自动发现 test/*.test.mjs），全绿为验收
```

> 测试运行需要能解析 peer 依赖 `@deepseek-ai/dsh-llm` 与 `@deepseek-ai/dsh-timeout`（如将 DSH checkout 的 `node_modules/@deepseek-ai` 链接到本项目的 `node_modules/`，或由 profile 的 pnpm 安装解析）。

> 「yolo」语义致敬 OpenCode 的 `--yolo` 一键全自动模式；本实现更克制——仅作为可选的宽松预设存在，默认不启用。
