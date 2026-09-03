# dsh-yolo-mode 消融实验

基线：`c8dfabe`（0.5.0-beta.0，dev-slim），原测试套件 125/125 通过（`npm test` = `node --test`，test/ 8 文件）。

消融实验 = 逐个移除/禁用功能模块，验证 (a) 插件仍能正常加载（loadOk）、(b) 保留模块核心功能仍可用（corePass）、(c) 被消融模块功能确实消失（ablationEffective）。

## 模块清单（消融点）

| ID | 模块 | 消融方式 | 变体文件 |
|---|---|---|---|
| M1 | LLM 裁判（lib/judge.js 调用路径） | code：移除 getJudge 的 createJudge 调用（裁判恒 null → 按预设 error 回退） | `variants/M1.patch` |
| M2 | 审计 JSONL（lib/audit.js 文件追加） | code：移除 audit() 的 fs.promises.appendFile 部分（保留 logger + state） | `variants/M2.patch` |
| M3 | 统计单例（lib/state.js recordDecision） | code：移除 audit() 的 recordDecision 调用 | `variants/M3.patch` |
| M4 | settings 分区（lib/settings.js installYoloSettings） | code：移除 installYoloSettings（回退到插件行 config） | `variants/M4.patch` |
| M5 | 上下文增强（extractArgumentsSummary） | code：移除 argumentsSummary 提取（judge 仅凭 reason 裁决） | `variants/M5.patch` |
| M6 | includeSubagents 门 | code：移除子代理过滤（子代理会话也裁决） | `variants/M6.patch` |
| M7 | bridge-entry（lib/bridge-entry.js webServer 路由） | 组合：验证其为独立插件条目，消融 = 不挂载该条目（主条目不注册任何路由） | 无 patch（探针内消融） |
| M8 | 客户端 UI（lib/client/） | 静态验证：client 独立构建（scripts/build-client.mjs → lib/client/index.js），主条目不依赖 client 产物 | 无 patch（静态探针） |

## 消融设计

- **code 变体（M1–M6）**：`variants/<ID>.patch` 为 `git diff lib/index.js` 生成的补丁（含 `[ABLATION Mx]` 标记注释）。run.mjs 对每个变体 `git apply` → 跑探针 → `git checkout -- lib/index.js` 恢复。lib/ 生产代码只在生成 patch 时临时修改并立即恢复。
- **组合变体（M7）**：bridge-entry.js 是独立插件条目（`name`/`inject:['webServer','settings']`/`apply`），经 cordis.patch.yml 的 `- insert: yolo-mode-bridge` 挂载；消融 = 探针只挂载主条目并注入 webServer 间谍，断言主条目不注册任何路由。
- **静态变体（M8）**：client 为独立构建产物（`npm run build:client` → lib/client/index.js），package.json 独立导出 `./client`/`./bridge`；探针静态断言主条目不引用 client、产物与导出存在，并挂载主条目确认 loadOk。

## 探针（ablation/probe.mjs）

对每个变体在**真实 Cordis Context** 上挂载插件本体（镜像 test/probe.test.mjs 的挂载方式：MemorySettings + FakeLlm + sandboxPolicy stub），经 `ctx.waterfall('approval/request', req, tail)` 派发真实审批请求，断言：

- **loadOk**：apply 不抛错；
- **ablationEffective（负向）**：被消融模块功能消失——M1 后 judge 路径按 error 回退 delegate 且 llm 不被调用；M2 后审计文件不追加；M3 后 stats 不更新；M4 后命名空间不注册；M5 后裁判输入无实参摘要；M6 后子代理会话也裁决；M7 后无路由注册；M8 后主条目不依赖 client；
- **corePass（正向）**：保留模块仍工作——裁决（yolo 放行 / 委托）、审计 JSONL、统计、行配置驱动等。

输出单行 JSON `{ variant, loadOk, checks, pass, note }`。

## 运行与结果

```bash
node ablation/run.mjs     # 对每个变体 apply patch → 探针 → 恢复 → 汇总 results.json
```

结果摘要：**8/8 变体通过**（全部 loadOk=true、负向/正向断言全 ok），详见 `results.json` 与 `report.md`。

## 原测试套件在 code 消融下的反应

- **M1（裁判消融）**：`npm test` → 1 失败 / 124 通过。失败用例 `probe: balanced 预设 + 裁判 allow → allowed-once`（依赖 LLM 裁判路径）；其余全部通过。
- **M4（settings 分区消融）**：`npm test` → 2 失败 / 123 通过。失败用例 `probe: 插件在真实 Context 上激活且 yolo-mode settings 命名空间注册` 与 `probe: settings 用户层更新后 effective config 立即生效`（均依赖 settings 分区）；其余全部通过。

失败用例全部落在被消融模块的测试上，无关测试不受影响 → 消融生效且模块边界清晰。
