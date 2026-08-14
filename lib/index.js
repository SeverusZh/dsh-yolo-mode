/**
 * dsh-yolo-mode 插件胶水层（默认导出）。
 *
 * 在宿主组合中作为 `approval/request` 的应答者挂载，用 `{ prepend: true }`
 * 抢在 dsh-host-apiproxy 的人工应答者之前介入，对沙箱升权申请（
 * `escalate sandbox to <mode>: <justification>`）按预设策略自动裁决。
 *
 * 决策流水线见 docs/design.md §3；本文件不实现策略纯函数与 LLM 裁判细节，
 * 均委托 `./policy.js`（pure）与 `./judge.js`（裁判封装）。
 *
 * 纯 JavaScript（ESM），零运行时依赖，仅 import node: 内置模块与同包 peer。
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
import { createJudge, JudgeError } from './judge.js';

export const name = 'dsh-yolo-mode';

/** 判定某个会话的审计 origin：'subagent' 或 'main'。 */
function sessionOrigin(session) {
  if (!session) return 'main';
  const header = session.header;
  if (header && header.origin === 'subagent') return 'subagent';
  return 'main';
}

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

/** 归一化错误为审计/日志可用的描述对象。 */
function errorDescriptor(err) {
  if (err instanceof JudgeError && err.code) {
    return { error: err.code, message: err.message ? String(err.message) : '' };
  }
  const msg = err && err.message ? String(err.message) : String(err);
  return { error: 'UNKNOWN', message: msg };
}

/**
 * 插件默认导出：cordis 函数插件。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config]  插件行 config（全字段可选）
 */
export default function apply(ctx, rawConfig) {
  // 配置必须通过（fail-loud），非法配置直接抛错 → 加载失败。
  const cfg = normalizeConfig(rawConfig ?? {});

  const logger = ctx.logger('yolo-mode');

  // 仅在 provider 与 model 均配置时才创建 LLM 裁判；
  // 否则 judge 决策按 error 回退（委托 / 按预设拒绝），不创建实例。
  const judge =
    cfg.judge.provider && cfg.judge.model
      ? createJudge({
          llm: ctx.get('llm'),
          provider: cfg.judge.provider,
          model: cfg.judge.model,
          systemPrompt: cfg.judge.systemPrompt,
          timeoutMs: cfg.judge.timeoutMs,
          maxTokens: cfg.judge.maxTokens,
          concurrency: cfg.judge.concurrency,
        })
      : null;

  if (!judge) {
    logger.warn(
      'LLM judge 未配置（judge.provider 或 judge.model 为空）；judge 决策将按预设 error 回退（strict 拒绝，其余委托人工）。',
    );
  }

  const auditFile = cfg.auditFile
    ? cfg.auditFile
    : path.join(os.tmpdir(), 'dsh-yolo', 'judge.log');

  let dirEnsured = false;

  // 审计目录在首次写入前确保（幂等，node:fs，try/catch）。
  function ensureAuditDir() {
    if (dirEnsured) return;
    dirEnsured = true;
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true });
    } catch (e) {
      logger.warn('无法创建审计目录', errorDescriptor(e));
    }
  }

  // 按预设 + 回退类型解析 judgeFallback，归一化为 { outcome } 或 { delegate: true }。
  // kind ∈ 'error' | 'unsure'
  function fallback(kind) {
    const resolved = judgeFallback({ preset: cfg.preset, levels: cfg.levels, kind });
    if (resolved === 'allowed-once') return { outcome: 'allowed-once' };
    if (resolved === 'rejected') return { outcome: 'rejected' };
    return { delegate: true };
  }

  // 8. 审计：ctx.logger（info/warn）+ 追加 JSONL（node:fs appendFile，try/catch，失败不致命）。
  function audit(entry) {
    ensureAuditDir();
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
      fs.promises.appendFile(auditFile, line, 'utf8').catch((err) => {
        logger.warn('审计 JSONL 追加失败', errorDescriptor(err));
      });
    } catch (err) {
      logger.warn('审计 JSONL 追加失败', errorDescriptor(err));
    }
  }

  const handler = async (req, next) => {
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
    let judgeReason; // 裁判 reason 仅在 judge 路径产出时记录（审计 reason?）。
    const result = await (async () => {
      if (decision === 'allow') return { outcome: 'allowed-once' };
      if (decision === 'deny') return { outcome: 'rejected' };
      if (decision === 'delegate') return { delegate: true };
      // decision === 'judge'
      if (!judge) return fallback('error');
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
        return fallback('unsure'); // 不确定
      } catch (err) {
        logger.warn('LLM 裁判失败，按预设 error 回退', errorDescriptor(err));
        return fallback('error');
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
