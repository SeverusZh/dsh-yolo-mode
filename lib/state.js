/**
 * dsh-yolo-mode —— 模块级共享状态（lib/state.js）
 *
 * 主插件条目（lib/index.js）在裁决时调用 `recordDecision(entry)` 写入审计统计
 * 与最近决策环形缓冲；桥接条目（lib/bridge-entry.js）经 `getStatusPayload(cfg)`
 * 读取。二者为同一包内的模块单例，天然共享（design.md §12.3「stats/recent 写入
 * lib/state.js 模块级单例」）。
 *
 * 本模块不触碰 settings / webServer；只含纯数据与纯装配（design.md §12.4 statusView）。
 * statusView 附带 presetDefaults：六预设 id → { systemPrompt, levels }，供设置页
 * 选中预设时预填充（systemPrompt 来自 lib/judge.js 的 defaultJudgePromptFor，
 * levels 来自 lib/policy.js 的 defaultLevelsFor；二者均为无副作用纯函数）。
 *
 * @module lib/state.js
 */
import { PRESETS, defaultLevelsFor } from './policy.js'
import { defaultJudgePromptFor } from './judge.js'
import { resolveAuditFile } from './audit.js'

/** recent 环形缓冲上限（design.md §11.1/12.4，≤20）。 */
export const RECENT_CAP = 20;

/** 模块级统计计数（设计 §3.8/12.3；主条目内存写，桥接条目只读）。
 *  judgeFailures 统计裁判失败次数（审计条目带 error 字段的次数），使「裁判挂了」
 *  在状态面板可见、区别于「裁判主动转人工」。 */
export const stats = { total: 0, allowed: 0, rejected: 0, delegated: 0, judgeFailures: 0 };

/** 最近一次裁判失败的健康信息（code + 时间戳）；无失败时 lastError 为 undefined。 */
export const judgeHealth = { lastError: undefined, lastErrorTime: undefined };

/** recent 环形缓冲：新条目 unshift 到头部，超过上限截断尾部（倒序，≤RECENT_CAP）。 */
const recent = [];

/**
 * 六预设的默认 { systemPrompt, levels } 映射（design.md §2/§13.1；statusView 携带，
 * 设置页选中预设时预填充）。纯函数静态装配一次：值为不可变字符串与冻结对象，只读。
 */
const presetDefaults = (() => {
  const map = {};
  for (const id of PRESETS) {
    map[id] = { systemPrompt: defaultJudgePromptFor(id), levels: defaultLevelsFor(id) };
  }
  return map;
})();

/**
 * 判定某个会话的审计 origin：'subagent' 或 'main'（design.md §3.8）。
 * 由 session 的 delegation 信息判定，无法判定时回退 'main'。
 * @param {object|undefined} session 申请方的 agent session
 * @returns {'subagent'|'main'}
 */
export function sessionOrigin(session) {
  if (!session) return 'main';
  const header = session.header;
  if (header && header.origin === 'subagent') return 'subagent';
  return 'main';
}

/**
 * 记录一次裁决到模块级统计与 recent 环（主条目 audit() 调用）。
 * @param {object} entry 审计条目：
 *   { time, sessionId, origin, toolName?, callId?, targetMode, currentMode?,
 *     justification, decision, outcome, reason?, error? }
 *   error 仅在裁判失败时存在（JudgeError.code）；成功路径不携带该字段。
 */
export function recordDecision(entry) {
  recent.unshift({
    time: entry.time,
    toolName: entry.toolName,
    targetMode: entry.targetMode,
    decision: entry.decision,
    outcome: entry.outcome,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    ...(entry.error !== undefined ? { error: entry.error } : {}),
  });
  if (recent.length > RECENT_CAP) recent.length = RECENT_CAP;

  stats.total += 1;
  if (entry.outcome === 'delegate') stats.delegated += 1;
  else if (entry.outcome === 'allowed-once') stats.allowed += 1;
  else if (entry.outcome === 'rejected') stats.rejected += 1;
  if (entry.error !== undefined) {
    stats.judgeFailures += 1;
    judgeHealth.lastError = entry.error;
    judgeHealth.lastErrorTime = entry.time;
  }
}

/**
 * 以浅拷贝装配 statusView 载荷（design.md §12.4）。
 * @param {object} cfg 含 { preset, judge?: { provider?, model? }, auditFile? } 的配置字形
 *   （主条目传 effectiveConfig()；桥接条目传 settings.describe 推导的 view 字形）
 * @returns {{preset:string, judgeConfigured:boolean, presetDefaults:object, stats:object, judgeErrors:object, recent:Array<object>, auditFile:string}}
 */
export function getStatusPayload(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const j = c.judge && typeof c.judge === 'object' ? c.judge : {};
  return {
    preset: c.preset,
    judgeConfigured: Boolean(j.provider && j.model),
    presetDefaults,
    stats: { ...stats },
    // 裁判失败健康信息：累计失败次数 + 最近一次错误码/时间（无失败时 lastError 缺省）。
    judgeErrors: {
      count: stats.judgeFailures,
      ...(judgeHealth.lastError !== undefined
        ? { lastError: judgeHealth.lastError, lastErrorTime: judgeHealth.lastErrorTime }
        : {}),
    },
    recent: recent.map((r) => ({ ...r })),
    // 生效的审计日志路径（resolveAuditFile 与主条目 audit() 同一解析规则），
    // 供客户端「打开日志」按钮展示/复用。
    auditFile: resolveAuditFile(c),
  };
}
