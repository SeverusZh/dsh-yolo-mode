/**
 * Static per-preset display data for the YOLO settings page: the level table
 * (workspace-write / danger-full-access policies), the judge error/unsure
 * fallbacks, and a one-sentence summary of the preset's default judge prompt.
 *
 * The level/fallback numbers mirror the Host policy table (docs/design.md §4
 * and lib/policy.js): only the non-custom presets carry fixed policies, while
 * `custom` reads everything from the user's levels table (marker 'custom'
 * tells the UI to render "per your levels table").
 *
 * This module is pure display data — nothing here participates in saving.
 */

/** Six presets in directory order, with their level table + prompt summary. */
export const PRESETS_INFO = [
  {
    id: 'off',
    levels: { workspaceWrite: 'delegate', dangerFullAccess: 'delegate' },
    fallbackError: 'delegate',
    fallbackUnsure: 'delegate',
    prompt: '关闭：不自动裁决，所有升权申请转人工。',
  },
  {
    id: 'strict',
    levels: { workspaceWrite: 'judge', dangerFullAccess: 'delegate' },
    fallbackError: 'rejected',
    fallbackUnsure: 'delegate',
    prompt: '最保守审计：workspace-write 从严裁决、danger-full-access 转人工，裁判出错一律拒绝。',
  },
  {
    id: 'balanced',
    levels: { workspaceWrite: 'judge', dangerFullAccess: 'judge' },
    fallbackError: 'delegate',
    fallbackUnsure: 'delegate',
    prompt: '平衡（默认）：两档模式均由裁判依据事实裁决，存疑或出错转人工。',
  },
  {
    id: 'permissive',
    levels: { workspaceWrite: 'judge', dangerFullAccess: 'judge' },
    fallbackError: 'delegate',
    fallbackUnsure: 'allowed-once',
    prompt: '宽松审计：理由合理且范围可接受即倾向放行，仅明显破坏性/供应链风险拒绝；不确定时放行。',
  },
  {
    id: 'yolo',
    levels: { workspaceWrite: 'allow', dangerFullAccess: 'allow' },
    fallbackError: 'delegate',
    fallbackUnsure: 'delegate',
    prompt: '全力放行：所有升权申请自动允许。',
  },
  {
    id: 'custom',
    levels: { workspaceWrite: 'custom', dangerFullAccess: 'custom' },
    fallbackError: 'custom',
    fallbackUnsure: 'custom',
    prompt: '自定义：按你的层级表裁决该工具+目标模式的策略，存疑按层级表回退。',
  },
];

/**
 * Look up one preset's display info.
 *
 * @param {string} id - preset id ('off' | 'strict' | 'balanced' | 'permissive' |
 *   'yolo' | 'custom').
 * @returns {object|null} the PRESETS_INFO entry, or null when unknown.
 */
export function presetInfo(id) {
  return PRESETS_INFO.find((preset) => preset.id === id) || null;
}
