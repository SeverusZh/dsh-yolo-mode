# 贡献指南 · dsh-yolo-mode

感谢你愿意为本项目做出贡献！

> DeepSeek Harness 插件：用大模型自动裁决沙箱**升权申请**（LLM-powered auto-approval）。当会话处于可写沙箱模式、审批策略为 `ask` 时，拦截 `escalate sandbox to ...` 升权申请，按预设或自定义权限层级由大模型裁决「放行 / 拒绝 / 转人工」。

---

## 开始之前

- **环境**：Node.js **>= 20**
- **包管理器**：**npm**（仓库带 `package-lock.json`） —— 请勿混用其它包管理器（会产生不同的依赖解析与锁文件）。
- **克隆与安装**：

  ```bash
  git clone https://github.com/SeverusZh/dsh-yolo-mode.git
  cd dsh-yolo-mode
  npm ci
  ```

## 本地开发

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 构建客户端半产物（`node scripts/build-client.mjs`） |
| `npm test` | 测试（`node --test`） |

### 目录结构

- `src/client/` — 客户端半源码
- `lib/` — 构建产物（发布用）
- `test/` — 测试（judge / policy / audit / client / probe）
- `docs/` — 设计文档

## 测试要求

裁决策略与失败路径的改动必须附带测试（尤其「不确定时不放行」的行为）。

- 提交 PR 前请**本地跑通全部命令**，并在描述里贴真实输出。

## 注意事项

- **fail-closed 原则不可弱化**：任何不确定、超时、解析失败、模型异常的分支都必须**转人工或拒绝**，绝不能默认放行。改动裁决逻辑时请显式覆盖这些失败路径。
- **维护状态**：DSH 官方已提供实验性 Auto review（`@deepseek-ai/dsh-experimental-auto-review`），与本插件功能重叠，本项目**可能在未来停止维护**。当前仍跟进 DSH 兼容；提大改动前建议先开 Issue 讨论方向。

---

## DSH 版本兼容

本插件跑在 DeepSeek Harness（DSH）之上，**兼容性由 `package.json` 里的 peer 声明决定**，
不是靠文档承诺。

### 兼容门禁的机制

DSH 启动时会检查插件的 `peerDependencies`：对 `@deepseek-ai/dsh` 与
`@deepseek-ai/dsh-*` 前缀的条目做 **`includePrerelease: true` 的 semver 校验**。
任一不满足当前宿主版本，DSH 会**跳过整个插件**（并在日志里提示可用
`dsh plugin allow-version` 做精确版本豁免）。

> 注意：`@deepseek-ai/cordis` **不参与**该门禁（前缀不匹配），所以不要靠它表达 DSH 兼容性。

### 范围写法

采用**无上限的 `>=<最低实测版本>`**（当前为 `>=0.1.7-rc.1`），而不是 `^0.x`：

- `^0.1.7-rc.1` 在 semver 里只覆盖 `0.1.x`，宿主每次跨 minor（如 0.2.0）都会重新触发门禁；
- `>=0.1.7-rc.1` 在**实测兼容**的前提下覆盖后续版本，避免每个宿主小版本都要改一次。

改这个范围属于**对外承诺**，必须有实测支撑（见下）。

### `dsh.compatibility.dshReleases` 兼容矩阵

`package.json` 里的 `dsh.compatibility.dshReleases` 用于声明**逐版本**的兼容状态
（DSH 市场/收录方会读它）。填写纪律：

- **只填你真正实测过的版本**，标 `compatible`；
- 未实测的**不要填**，也不要标 `compatible`——宁可留空，不可虚标；
- 升级宿主后，先按上面的命令实测，再补矩阵条目。

## 提交与分支约定

- **commit 信息用中文**，说清「改了什么、为什么」；一个提交做一件事。
- **分支**：迁移/开发用 `dev-<DSH 版本>`（例如 `dev-0.2.1.alpha.2`）；**发版走 `main`**。
- 不要把 `main` 与 `dev-*` 互相强行同步——两者承担不同职责，落后/领先是正常状态。

## 维护者发布流程

1. **先在 `dev-<DSH 版本>` 分支验证**，通过后发 **npm beta**：
   ```bash
   npm publish --tag beta   # 绝不动 latest
   ```
2. **`latest` 只跟随 DSH 的 rc 版**：
   - 面向 DSH **alpha / next 线**的适配**只发 beta**，不进 `latest`；
   - 等对应 DSH 走到 **rc** 阶段，再正式发布。
   > 原因：alpha/next 线接口仍在变，把 `latest` 绑上去会让普通用户被兼容门禁拦在门外。
3. **正式版**（进 `latest`）需要：bump `package.json` 版本 + 写 `CHANGELOG.md` 对应段落
   + 打 git tag + 建 GitHub Release + `npm publish`（默认 latest）。
4. **beta 提交只 bump `package.json`，不写 CHANGELOG 段落**（正式版才写）。

## 提 PR

- 一个 PR 只做一件事，范围尽量小。
- 在描述里讲**为什么**（动机 / 现象 / 根因），实现细节让 diff 自己说话。
- **附可复核的证据**：跑了什么命令、实际输出是什么。不要只写「已测试通过」。
- 改到 `peerDependencies` / 兼容矩阵的 PR，请附上对应宿主的实测结果。
- CI 必须全绿（有 CI 的仓库）。

## 许可证

本项目基于 **MIT** 许可证。提交贡献即表示你同意以相同许可证发布你的改动。

