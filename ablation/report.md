# dsh-yolo-mode 消融实验报告

基线：`c8dfabe`（0.5.0-beta.0，dev-slim）· 原测试套件 125/125 通过 · 消融探针 8/8 通过

## 结果总览

| 变体 | 类型 | 消融目标 | loadOk | 结果 | 关键观察 |
|---|---|---|---|---|---|
| M1 | code | LLM 裁判（getJudge 的 createJudge 调用） | ✅ | ✅ | judge 路径按预设 error 回退 delegate（balanced → unavailable）；llm.stream 零调用；yolo 确定性放行保留 |
| M2 | code | 审计 JSONL（audit() 的 appendFile） | ✅ | ✅ | 裁决后审计文件不追加；裁决本身与统计单例保留 |
| M3 | code | 统计单例（audit() 的 recordDecision） | ✅ | ✅ | 裁决后 stats.total 不更新；审计 JSONL 仍追加 1 行 |
| M4 | code | settings 分区（installYoloSettings） | ✅ | ✅ | yolo-mode 命名空间未注册（get=undefined、describe 无视图）；行配置仍驱动裁决 |
| M5 | code | 上下文增强（extractArgumentsSummary） | ✅ | ✅ | 裁判输入不含 tool/call 实参摘要（标记文本消失）；裁判裁决保留 |
| M6 | code | includeSubagents 门 | ✅ | ✅ | includeSubagents=false 时子代理会话也裁决（yolo → 放行）；主会话保留 |
| M7 | 组合 | bridge-entry（webServer 路由） | ✅ | ✅ | bridge-entry 为独立插件条目（inject webServer）；只挂主条目时零路由注册；裁决保留 |
| M8 | 静态 | 客户端 UI（lib/client/） | ✅ | ✅ | 主条目不引用 client；独立构建产物/构建脚本/`./client`+`./bridge` 导出齐全；主条目可挂载 |

## 原测试套件在 code 消融下的反应

- **M1（裁判消融）**：失败 1/125，通过 124。
  - 失败：`probe: balanced 预设 + 裁判 allow → allowed-once（真实 dsh-llm 组装）`——依赖 LLM 裁判路径，消融后 outcome 变为 delegate（unavailable）→ **消融生效**。
  - 通过：其余 124 个用例（含 yolo 确定性放行、委托、取消、settings 更新、judge/policy/audit/state 纯函数单测）→ **核心保留**。
- **M4（settings 分区消融）**：失败 2/125，通过 123。
  - 失败：`probe: 插件在真实 Context 上激活且 yolo-mode settings 命名空间注册`（命名空间未注册）与 `probe: settings 用户层更新后 effective config 立即生效`（settings.update 对未注册命名空间抛错）→ **消融生效**。
  - 通过：其余 123 个用例 → **核心保留**。

## 结论

1. **模块独立性高**：8 个消融点全部可独立移除，互不级联破坏；每个变体 loadOk=true，保留模块核心功能（裁决/委托/审计/统计/行配置）全部可用。
2. **消融可观测**：每个负向断言都命中被消融模块的独有副作用——M1 的 llm 调用、M2 的 JSONL 落盘、M3 的 stats 计数、M4 的命名空间注册、M5 的裁判输入内容、M6 的子代理过滤、M7 的路由注册、M8 的 client 依赖。
3. **依赖关系**：
   - M1（裁判）是 M5（上下文增强）的宿主——M5 只作用于 judge 路径的输入；M1 消融后 M5 无独立可观测面（探针在裁判保留前提下验证）。
   - M2/M3 是 audit() 的并列子模块，互不依赖：M2 消融后统计仍更新，M3 消融后 JSONL 仍追加。
   - M4（settings 分区）消融后插件回落插件行 config，裁决链路完全不受影响（fail-soft 设计生效）。
   - M7/M8 与主条目解耦：主条目不注册路由、不依赖 client 产物，bridge/client 均为独立交付面。
4. **测试套件与模块边界一致**：code 消融导致的测试失败全部落在被消融模块的用例上，无关用例零误伤。
