# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

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
