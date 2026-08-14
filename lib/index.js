/**
 * dsh-yolo-mode 主机主插件条目（lib/index.js，默认导出）。
 *
 * 在宿主组合中作为 `approval/request` 的应答者挂载，用 `{ prepend: true }`
 * 抢在 dsh-host-apiproxy 的人工应答者之前介入，对沙箱升权申请（
 * `escalate sandbox to <mode>: <justification>`）按预设策略自动裁决。
 *
 * v0.3.0 重做（design.md §12.3）：
 *   - `inject: ['llm','settings']`，用 `ctx.llm` / `ctx.settings`；
 *   - 经 `installYoloSettings` 注册 settings 分区，`effectiveConfig()` 每次裁决
 *     时取 resolved（默认 + base(行配置) + 用户层）后 `normalizeConfig`；
 *   - `getJudge()` 按 judge 配置键缓存裁判实例（用 `ctx.llm`），键变化重建；
 *   - 审计统计写入 lib/state.js 模块级单例（bridge 条目已读）；
 *   - **不再注册任何 webServer 路由**（由独立 lib/bridge-entry.js 承担）。
 *
 * 决策流水线见 docs/design.md §3；策略纯函数与 LLM 裁判细节分别委托
 * `./policy.js`（pure）与 `./judge.js`（裁判封装）。
 *
 * 纯 JavaScript（ESM），宿主代码仅 import node: 内置与同包 peer。
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import {
  normalizeConfig,
  resolvePolicy,
  judgeFallback,
  ESCALATION_RE,
} from './policy.js';
import { createJudge, defaultJudgePromptFor } from './judge.js';
import { installYoloSettings, validateYoloSettings, pruneEmpty } from './settings.js';
import { recordDecision, sessionOrigin } from './state.js';

export const name = 'dsh-yolo-mode';

/** settings 命名空间（与插件行 id 一致；纯小写 kebab-case）。主条目经 installYoloSettings 使用。 */

/** 反向扫描会话事件，取与 req.callId 匹配的 tool/call 实参摘要（1200 字符截断）。 */
function extractArgumentsSummary(req, session) {
  if (!req || !req.callId || !session || !Array.isArray(session.events)) return undefined;
  try {
    const events = session.events;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!ev || ev.type !== 'tool/call' || !ev.data) continue;
      if (ev.data.callId === req.callId) {
        const raw = ev.data.arguments;
        if (typeof raw !== 'string') return undefined;
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed).slice(0, 1200);
      }
    }
  } catch (e) {
    // 任何失败静默降级为 undefined（仅凭 reason 裁判）
  }
  return undefined;
}

/** 归一化错误为日志可用的描述对象。 */
function errorDescriptor(err) {
  const code = (err && typeof err === 'object' && err.code) ? String(err.code) : '';
  const msg = err && err.message ? String(err.message) : String(err);
  return code ? { error: code, message: msg } : { error: 'UNKNOWN', message: msg };
}

/**
 * 所需服务（对齐参考主条目）：llm 裁判调用 + settings 分区。
 * 树外插件对 webServer 等宿主服务必须以 inject 声明；llm/settings 经 inject
 * 注入后用 ctx.llm / ctx.settings 访问。
 */
export const inject = ['llm', 'settings'];

/**
 * 插件条目：cordis 命名导出插件（apply + inject + name）。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [rawConfig]  插件行 config（全字段可选）
 */
export function apply(ctx, rawConfig) {
  // 行配置通过（fail-loud）：非法配置立即抛错 → 加载失败。
  const rowCfg = rawConfig ?? {};
  normalizeConfig(rowCfg);

  const logger = ctx.logger('yolo-mode');

  // ---- settings 分区（resolved = defaults + base(行配置) + 用户层）----
  // installSettingsSection 在 settings 服务存在时，把 resolved scope 设为 active 源；
  // 服务缺失/卸载时回退到 `entry`（插件行 config）。
  let sourceThunk = undefined;
  installYoloSettings(ctx, rowCfg, {
    setSource: (thunk) => {
      sourceThunk = thunk;
    },
    onChange: () => {
      // resolved 已由 setSource 的 thunk 覆盖；judge 缓存按键在 getJudge 中自愈。
    },
    validate: validateYoloSettings,
  });

  /** 每次裁决读取的有效配置（resolved settings；未就绪时插件行 config）后规范化。 */
  function effectiveConfig() {
    const raw = sourceThunk ? sourceThunk() : rowCfg;
    // resolved 含 schema 空集合默认（modes:[]/levels:{}），必须先剔除再 normalizeConfig，
    // 否则 fail-loud 拒绝空 modes（与 settings.js 的 validate 钩子同一根因）。
    return normalizeConfig(pruneEmpty(raw));
  }

  const auditFile = () => {
    const cfg = effectiveConfig();
    return cfg.auditFile ? cfg.auditFile : path.join(os.tmpdir(), 'dsh-yolo', 'judge.log');
  };

  let dirEnsured = false;

  // 审计目录在首次写入前确保（幂等，node:fs，try/catch）。
  function ensureAuditDir() {
    if (dirEnsured) return;
    dirEnsured = true;
    try {
      fs.mkdirSync(path.dirname(auditFile()), { recursive: true });
    } catch (e) {
      logger.warn('无法创建审计目录', errorDescriptor(e));
    }
  }

  /**
   * 按 judge 配置键缓存裁判实例；键变化时重建。
   * provider/model 为空 → 缓存 null（并告警一次）。
   */
  let judgeCache = null;
  let judgeUnconfiguredWarned = false;
  function getJudge() {
    const cfg = effectiveConfig();
    const j = cfg.judge;
    // 用户显式 systemPrompt 优先；否则按预设取默认裁判提示词（design.md §13.1）。
    // 解析后的 systemPrompt 也参与缓存键：预设切换（systemPrompt 仍为空串）时
    // 必须重建裁判实例，否则会复用旧预设的提示词。
    const sys =
      typeof j.systemPrompt === 'string' && j.systemPrompt.trim() !== ''
        ? j.systemPrompt
        : defaultJudgePromptFor(cfg.preset);
    const key = [j.provider, j.model, sys, j.timeoutMs, j.maxTokens, j.concurrency].join('|');
    if (judgeCache && judgeCache.key === key) return judgeCache.inst;
    const inst =
      j.provider && j.model
        ? createJudge({
            llm: ctx.llm,
            provider: j.provider,
            model: j.model,
            systemPrompt: sys,
            timeoutMs: j.timeoutMs,
            maxTokens: j.maxTokens,
            concurrency: j.concurrency,
          })
        : null;
    judgeCache = { key, inst };
    if (!inst && !judgeUnconfiguredWarned) {
      judgeUnconfiguredWarned = true;
      logger.warn(
        'LLM judge 未配置（judge.provider 或 judge.model 为空）；judge 决策将按预设 error 回退（strict 拒绝，其余委托人工）。',
      );
    }
    return inst;
  }

  // 按预设 + 回退类型解析 judgeFallback，归一化为 { outcome } 或 { delegate: true }。
  function fallback(kind, cfg) {
    const resolved = judgeFallback({ preset: cfg.preset, levels: cfg.levels, kind });
    if (resolved === 'allowed-once') return { outcome: 'allowed-once' };
    if (resolved === 'rejected') return { outcome: 'rejected' };
    return { delegate: true };
  }

  // 8. 审计：ctx.logger（info/warn）+ 追加 JSONL + 更新 lib/state.js stats/recent。
  function audit(entry) {
    ensureAuditDir();
    const file = auditFile();
    const loggable = {
      decision: entry.decision,
      outcome: entry.outcome,
      targetMode: entry.targetMode,
      currentMode: entry.currentMode,
      reason: entry.reason,
    };
    if (entry.outcome === 'allowed-once') {
      logger.info('[yolo-mode] 放行升权', loggable);
    } else {
      logger.warn('[yolo-mode] 裁决升权', loggable);
    }
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.promises.appendFile(file, line, 'utf8').catch((err) => {
        logger.warn('审计 JSONL 追加失败', errorDescriptor(err));
      });
    } catch (err) {
      logger.warn('审计 JSONL 追加失败', errorDescriptor(err));
    }

    // 统计更新（模块级单例；bridge 条目经 statusView 读取）。
    recordDecision(entry);
  }

  const handler = async (req, next) => {
    // 每次裁决读取有效配置（resolved settings / 插件行 config）。
    const cfg = effectiveConfig();

    // 1. 请求已中止 → cancelled。
    if (req.signal && req.signal.aborted) return 'cancelled';

    // includeSubagents 门：不放行配置为不裁决的子代理会话（透明委托）。
    const session = req.agent ? req.agent.session : undefined;
    const origin = sessionOrigin(session);
    if (cfg.includeSubagents === false && origin === 'subagent') return next();

    // 2. reason 必须匹配升权格式，否则透明委托。
    const m = typeof req.reason === 'string' ? ESCALATION_RE.exec(req.reason) : null;
    if (!m) return next();

    // 3. sandboxPolicy.resolve 门槛：仅在会话有效模式 ∈ config.modes 时介入。
    let currentMode;
    let workspaceRoot;
    try {
      const sandboxPolicy = ctx.get('sandboxPolicy');
      const pol =
        sandboxPolicy && typeof sandboxPolicy.resolve === 'function'
          ? sandboxPolicy.resolve({ session })
          : undefined;
      currentMode = pol ? pol.mode : undefined;
      workspaceRoot = pol ? pol.workspaceRoot : undefined;
    } catch (err) {
      logger.warn('sandboxPolicy.resolve 失败，透明委托', errorDescriptor(err));
      return next();
    }
    if (!currentMode || !cfg.modes.includes(currentMode)) return next();

    // 4. 提取 targetMode 与 justification（正则已保证两组存在）。
    const targetMode = m[1];
    const justification = m[2];

    // 5. 上下文增强：tool/call 反向扫描（1200 字符截断，失败静默降级）。
    const argumentsSummary = extractArgumentsSummary(req, session);

    // 6. resolvePolicy 四态映射。
    const decision = resolvePolicy({
      preset: cfg.preset,
      levels: cfg.levels,
      targetMode,
      toolName: req.toolName,
    });

    // 7. 裁决映射（judge 走裁判，含未配置/失败/不确定回退）。
    const judge = getJudge();
    let judgeReason; // 裁判 reason 仅在 judge 路径产出时记录（审计 reason?）。
    const result = await (async () => {
      if (decision === 'allow') return { outcome: 'allowed-once' };
      if (decision === 'deny') return { outcome: 'rejected' };
      if (decision === 'delegate') return { delegate: true };
      // decision === 'judge'
      if (!judge) return fallback('error', cfg);
      try {
        const r = await judge({
          toolName: req.toolName,
          targetMode,
          justification,
          workspaceRoot,
          argumentsSummary,
          signal: req.signal,
        });
        judgeReason = r.reason;
        if (r.decision === 'allow') return { outcome: 'allowed-once' };
        if (r.decision === 'deny') return { outcome: 'rejected' };
        return fallback('unsure', cfg); // 不确定
      } catch (err) {
        logger.warn('LLM 裁判失败，按预设 error 回退', errorDescriptor(err));
        return fallback('error', cfg);
      }
    })();

    const outcome = result.delegate ? 'delegate' : result.outcome;

    // 8. 审计。
    audit({
      time: Date.now(),
      sessionId: (session && session.id) || (req.agent && req.agent.id),
      origin,
      toolName: req.toolName,
      callId: req.callId,
      targetMode,
      currentMode,
      justification,
      decision,
      outcome,
      reason: judgeReason,
    });

    // 9. delegate → next() 透明委托；否则返回归一化 outcome。
    if (result.delegate) return next();
    return outcome;
  };

  // 全部副作用由 ctx.effect 管理，插件卸载时完全清理。
  ctx.effect(
    () => ctx.on('approval/request', handler, { prepend: true }),
    'yolo-mode: approval answerer',
  );
}
