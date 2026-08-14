/**
 * dsh-yolo-mode 插件胶水层（默认导出）。
 *
 * 在宿主组合中作为 `approval/request` 的应答者挂载，用 `{ prepend: true }`
 * 抢在 dsh-host-apiproxy 的人工应答者之前介入，对沙箱升权申请（
 * `escalate sandbox to <mode>: <justification>`）按预设策略自动裁决。
 *
 * M3 扩展（design.md §11.2）：
 *   - 可选注册 settings 命名空间 `yolo-mode`，`effectiveConfig()` 每次裁决
 *     时将插件行 config 与 settings 分区合并后规范化；
 *   - `getJudge()` 按 judge 配置键缓存裁判实例，键变化时重建；
 *   - 内存统计 `stats` + `recent` 环形缓冲在 audit() 中更新；
 *   - 可选注册两条 webServer 路由（GET/POST /plugins/yolo-mode/*），
 *     `buildStatus` / `createApiHandlers` 为可注入纯/工厂导出（供测试）。
 *
 * 决策流水线见 docs/design.md §3；策略纯函数与 LLM 裁判细节分别委托
 * `./policy.js`（pure）与 `./judge.js`（裁判封装）。
 *
 * 纯 JavaScript（ESM），宿主代码仅 import node: 内置模块与同包 peer
 * （@deepseek-ai/schemastery 用于 settings 分区 schema）。
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import z from '@deepseek-ai/schemastery';

import {
  normalizeConfig,
  mergeConfig,
  resolvePolicy,
  judgeFallback,
  ESCALATION_RE,
} from './policy.js';
import { createJudge, JudgeError } from './judge.js';

export const name = 'dsh-yolo-mode';

/** settings 命名空间（与插件行 id 一致；纯小写 kebab-case）。 */
const SETTINGS_NS = 'yolo-mode';

/** recent 环形缓冲上限（design.md §11.1，≤20）。 */
const RECENT_CAP = 20;

/** HTTP 读取 body 的字节上限（design.md §11.1，64KB）。 */
const BODY_LIMIT = 64 * 1024;

/**
 * settings 分区 schema：自由 JSON 对象（z.dict(z.any())）。
 * 选择 dict 而非结构化 object 的原因：schemastery 无 optional，结构化
 * object 会把未配置字段解析为默认值（如 preset 默认 'off'、布尔默认
 * false），pruneSettings 后仍会泄漏并错误覆盖插件行 config。dict 在分区
 * 未写入时解析为 {}，绝无默认值泄漏；真正的形状校验由 normalizeConfig
 * 单一权威完成（fail-loud）。
 */
const yoloSchema = z.dict(z.any());

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
 * 剔除 settings 分区 schema 对"未配置字段"的默认空哨兵，得到干净的覆盖层。
 * schemastery 对缺席的 `array`/`dict`/`object` 字段会分别规范化成 `[]`/`{}`，
 * 若直接把 `scope.get()` 合并进行配置，空 `modes: []` 会导致 normalizeConfig
 * fail-loud 抛错（空数组非法）。这里的做法：任何未定义的标量、空数组、空对象
 * 一律视为"未提供"，不覆盖行配置。
 * @param {object|undefined} value settings scope.get() 的解析值
 * @returns {object} 仅含用户有效字段的覆盖层
 */
function pruneSettings(value) {
  const out = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) out[key] = v;
      continue;
    }
    if (typeof v === 'object' && v !== null) {
      if (Object.keys(v).length > 0) out[key] = v;
      continue;
    }
    out[key] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 状态装配纯函数（供测试与 HTTP 路由复用）
 * ------------------------------------------------------------------ */

/**
 * 以浅拷贝装配状态对象（design.md §11.1/11.2）。
 * @param {Readonly<Config>} cfg     规范化后的完整配置
 * @param {{total:number,allowed:number,rejected:number,delegated:number}} stats 统计计数
 * @param {Array<{time:number,toolName:string,targetMode:string,decision:string,outcome:string,reason?:string}>} recent 最近决策（倒序，≤20）
 * @returns {object} 状态对象
 */
export function buildStatus(cfg, stats, recent) {
  return {
    preset: cfg.preset,
    modes: [...cfg.modes],
    levels: { ...cfg.levels },
    judge: { ...cfg.judge },
    judgeConfigured: Boolean(cfg.judge.provider && cfg.judge.model),
    stats: { ...stats },
    recent: [...recent],
  };
}

/* ------------------------------------------------------------------ *
 * 可注入依赖的 HTTP 处理器工厂（design.md §11.1/11.2）
 * ------------------------------------------------------------------ */

/** 读 IncomingMessage body 至多 limit 字节；超出抛 {code:'LIMIT'}。 */
function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      reject(err);
    };
    req.on('data', (chunk) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk), 'utf8');
      size += buf.length;
      if (size > limit) {
        fail(Object.assign(new Error('request body too large'), { code: 'LIMIT' }));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => fail(err));
  });
}

/** 以 JSON 结束响应（node:http 原语）。 */
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/**
 * 建造 status/config 两个 webServer 路由处理器（node:http 原语，可注入依赖）。
 *
 * @param {object} deps
 * @param {() => object} deps.getStatus   返回完整状态对象（GET 响应体）
 * @param {(newSection: object) => Promise<void>} deps.applyConfig 持久化新 settings 分区
 * @param {() => object} [deps.getSettings=()=>deps.getStatus()?.config ?? {}] 返回当前 settings 分区（合并基线）
 * @param {object} [deps.rowCfg={}]       插件行 config（校验基底）
 * @returns {{statusHandler:Function, configHandler:Function}}
 */
export function createApiHandlers({ getStatus, applyConfig, getSettings, rowCfg }) {
  const fetchSettings = getSettings || (() => (getStatus && getStatus().config) || {});
  const base = rowCfg || {};

  const statusHandler = async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end();
        return;
      }
      sendJson(res, 200, getStatus());
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
    }
  };

  const configHandler = async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.end();
        return;
      }
      let body;
      try {
        body = await readRequestBody(req, BODY_LIMIT);
      } catch (err) {
        if (err && err.code === 'LIMIT') {
          res.statusCode = 413;
          res.end();
        } else {
          res.statusCode = 500;
          res.end();
        }
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: '无效的 JSON 请求体' });
        return;
      }
      const current = fetchSettings() || {};
      const newSection = mergeConfig(current, parsed);
      // 校验失败 → 400 + 错误信息（fail-loud，不落盘）。
      let validated;
      try {
        validated = normalizeConfig(mergeConfig(base, newSection));
      } catch (err) {
        sendJson(res, 400, { ok: false, error: String(err && err.message ? err.message : err) });
        return;
      }
      try {
        await applyConfig(newSection);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
        return;
      }
      // 落盘后返回最新状态。
      const status = getStatus();
      const config = (status && status.config) || (validated ? buildStatus(validated, {}, []) : {});
      sendJson(res, 200, { ok: true, config });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
    }
  };

  return { statusHandler, configHandler };
}

/* ------------------------------------------------------------------ *
 * 插件主体
 * ------------------------------------------------------------------ */

/**
 * 插件默认导出：cordis 函数插件。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config]  插件行 config（全字段可选）
 */
export default function apply(ctx, rawConfig) {
  // 行配置通过（fail-loud）：非法配置立即抛错 → 加载失败。
  const rowCfg = rawConfig ?? {};
  normalizeConfig(rowCfg);

  const logger = ctx.logger('yolo-mode');

  // ---- 可选 settings 命名空间注册 ----
  let settingsScope = undefined;
  const settings = ctx.get('settings');
  if (settings && typeof settings.register === 'function') {
    try {
      settingsScope = settings.register(SETTINGS_NS, yoloSchema);
    } catch (err) {
      logger.warn('settings.register 失败，跳过 settings 覆盖层', errorDescriptor(err));
      settingsScope = undefined;
    }
  } else {
    logger.warn('settings 服务缺失；跳过 settings 覆盖层（仅按插件行 config 运行）');
  }

  /** 每次裁决 / 路由调用时读取的有效配置（行 config + settings 分区合并后规范化）。 */
  function effectiveConfig() {
    const overlay = settingsScope ? pruneSettings(settingsScope.get() ?? {}) : {};
    return normalizeConfig(mergeConfig(rowCfg, overlay));
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

  // ---- 统计与最近决策环形缓冲 ----
  const stats = { total: 0, allowed: 0, rejected: 0, delegated: 0 };
  const recent = [];
  function pushRecent(entry) {
    recent.unshift({
      time: entry.time,
      toolName: entry.toolName,
      targetMode: entry.targetMode,
      decision: entry.decision,
      outcome: entry.outcome,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    });
    if (recent.length > RECENT_CAP) recent.length = RECENT_CAP;
  }

  /**
   * 按 judge 配置键缓存裁判实例；键变化时重建。
   * provider/model 为空 → 缓存 null（并告警一次）。
   */
  let judgeCache = null;
  let judgeUnconfiguredWarned = false;
  function getJudge() {
    const j = effectiveConfig().judge;
    const key = [j.provider, j.model, j.systemPrompt, j.timeoutMs, j.maxTokens, j.concurrency].join('|');
    if (judgeCache && judgeCache.key === key) return judgeCache.inst;
    const inst =
      j.provider && j.model
        ? createJudge({
            llm: ctx.get('llm'),
            provider: j.provider,
            model: j.model,
            systemPrompt: j.systemPrompt,
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

  // 8. 审计：ctx.logger（info/warn）+ 追加 JSONL + 更新 stats/recent。
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

    // 统计更新：delegate 语义即转人工。
    stats.total += 1;
    if (entry.outcome === 'delegate') stats.delegated += 1;
    else if (entry.outcome === 'allowed-once') stats.allowed += 1;
    else if (entry.outcome === 'rejected') stats.rejected += 1;
    pushRecent(entry);
  }

  const handler = async (req, next) => {
    // 每次裁决读取有效配置（行 config + settings 覆盖）。
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

  // ---- M3：可选 webServer 路由 ----
  const webServer = ctx.get('webServer');
  if (webServer && typeof webServer.register === 'function') {
    const getStatus = () => buildStatus(effectiveConfig(), stats, recent);
    const applyConfig = (newSection) => {
      if (!settingsScope) throw new Error('settings 服务未注册，无法落盘配置');
      return settingsScope.replace(newSection);
    };
    const { statusHandler, configHandler } = createApiHandlers({
      getStatus,
      applyConfig,
      getSettings: settingsScope ? () => pruneSettings(settingsScope.get() ?? {}) : () => ({}),
      rowCfg,
    });
    ctx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: '/plugins/yolo-mode/status',
          handler: statusHandler,
        }),
      'yolo-mode: status route',
    );
    ctx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: '/plugins/yolo-mode/config',
          handler: configHandler,
        }),
      'yolo-mode: config route',
    );
  } else {
    logger.warn('webServer 服务缺失；跳过 /plugins/yolo-mode/* HTTP 路由');
  }
}
