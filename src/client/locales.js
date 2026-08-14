/**
 * Bilingual dictionaries for the YOLO mode `settings.yoloMode` namespace.
 * Both locales must carry every key so a locale switch never leaves a blank
 * label.
 */

/** Dictionary namespace owned by YOLO mode (registered by src/client/index.js). */
export const NS = 'settings.yoloMode';

/** English dictionary. */
export const en = {
  nav: 'YOLO Approval',
  chip: 'YOLO status',
  sectionIntro: 'Configure how YOLO mode auto-judges sandbox escalation approval requests.',
  loadError: 'Could not load YOLO mode settings.',
  conflict: 'The settings changed on the server. Reloading your edits — please review and retry.',
  rejected: 'The change was rejected by the settings provider.',
  fatal: 'Could not save: {message}',

  preset: 'Preset',
  presetHint: 'off | strict | balanced | permissive | yolo | custom',
  modes: 'Modes',
  modesHint: 'Valid sandbox modes YOLO judges (workspace-write, danger-full-access…)',
  workspaceWrite: 'workspace-write',
  dangerFullAccess: 'danger-full-access',
  judge: 'Judge',
  provider: 'Provider',
  model: 'Model',
  systemPrompt: 'System prompt',
  timeoutMs: 'Timeout (ms)',
  maxTokens: 'Max tokens',
  concurrency: 'Concurrency',
  levels: 'Levels (JSON)',
  levelsHint: '{"tools": {…}, "<mode>": "allow|judge|delegate|deny"}',
  invalidLevelsJson: 'levels is not valid JSON',
  providerEmpty: 'Not configured',
  modelEmpty: 'Not configured',
  presetLevels: 'Levels table',
  presetPrompt: 'Default prompt',
  presetErrorFallback: 'Error fallback',
  presetUnsureFallback: 'Unsure fallback',
  presetCustom: 'per your levels table',
  save: 'Save',
  saved: 'Saved',
  saveFailed: 'Save failed',

  statsTotal: 'Total',
  statsAllowed: 'Allowed',
  statsRejected: 'Rejected',
  statsDelegated: 'Delegated',
  refresh: 'Refresh',
  close: 'Close',

  tableTime: 'Time',
  tableTool: 'Tool',
  tableTarget: 'Target',
  tableDecision: 'Decision',
  tableOutcome: 'Outcome',
  tableReason: 'Reason',
  recentEmpty: 'No decisions yet.',
};

/** Chinese dictionary. */
export const zh = {
  nav: 'YOLO 审批',
  chip: 'YOLO 状态',
  sectionIntro: '配置 YOLO 模式如何自动裁决沙箱升权审批申请。',
  loadError: '无法加载 YOLO 模式设置。',
  conflict: '服务端设置已变更。已重新加载你的编辑——请复核并重试。',
  rejected: '更改被设置提供方拒绝。',
  fatal: '无法保存：{message}',

  preset: '预设',
  presetHint: 'off | strict | balanced | permissive | yolo | custom',
  modes: '模式',
  modesHint: '由 YOLO 裁决的有效沙箱模式（workspace-write、danger-full-access…）',
  workspaceWrite: 'workspace-write',
  dangerFullAccess: 'danger-full-access',
  judge: '裁判',
  provider: '供应商',
  model: '模型',
  systemPrompt: '系统提示词',
  timeoutMs: '超时（毫秒）',
  maxTokens: '最大令牌',
  concurrency: '并发',
  levels: '层级表（JSON）',
  levelsHint: '{"tools": {…}, "<mode>": "allow|judge|delegate|deny"}',
  invalidLevelsJson: 'levels 不是合法 JSON',
  providerEmpty: '未配置',
  modelEmpty: '未配置',
  presetLevels: '层级表',
  presetPrompt: '默认提示词',
  presetErrorFallback: '错误回退',
  presetUnsureFallback: '不确定回退',
  presetCustom: '按你的层级表',
  save: '保存',
  saved: '已保存',
  saveFailed: '保存失败',

  statsTotal: '总数',
  statsAllowed: '放行',
  statsRejected: '拒绝',
  statsDelegated: '转人工',
  refresh: '刷新',
  close: '关闭',

  tableTime: '时间',
  tableTool: '工具',
  tableTarget: '目标模式',
  tableDecision: '决策',
  tableOutcome: '结果',
  tableReason: '理由',
  recentEmpty: '暂无裁决记录。',
};
