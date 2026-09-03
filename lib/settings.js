/**
 * dsh-yolo-mode —— 宿主设置分区（lib/settings.js）
 *
 * 注册 settings 命名空间 `yolo-mode`，用 schemastery 宽松 schema 解析分区值，
 * 写时校验委托 ./policy.js 的 `normalizeConfig`（fail-loud 抛错即拒绝写入）。
 *
 * 分层层（design.md §12.3）：插件行 config 作为 settings 的 `base` 层，用户文档
 * 写在上层；`installYoloSettings` 走 `SettingsProvider.installSection` 的可选-settings
 * 消费者接线，部署无 settings 服务时打 debug 日志跳过（零侵入）。
 *
 * DSH 0.1.2-alpha.4 兼容：dsh-settings 改为类服务——默认导出 `SettingsProvider`，
 * `installSettingsSection` / `settingsNamespace` 函数导出已删除；命名空间为纯
 * kebab-case 字符串字面量，消费接线为 `ctx.settings.installSection(owner, ns, schema, entry, hooks)`。
 */
import z from '@deepseek-ai/schemastery';
import { normalizeConfig } from './policy.js';

/** settings 命名空间：`yolo-mode`（与插件行 id 一致，纯小写 kebab-case）。 */
export const YOLO_SETTINGS_NAMESPACE = 'yolo-mode';

/** 预设枚举（与 ./policy.js PRESETS 保持一致，供 union schema 使用）。 */
const PRESETS = ['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'];

/**
 * schemastery 宽松 schema：全字段可选（object 字段默认可选），使未写入的空白分区
 * 解析为空对象，绝不泄漏默认值覆盖插件行 config。真正的形状/语义校验由写时
 * `validateYoloSettings = normalizeConfig` 完成（fail-loud）。
 */
export const YoloSettingsSchema = z.object({
  preset: z.union([...PRESETS]).default('balanced'),
  modes: z.array(z.string()),
  levels: z.dict(z.any()),
  judge: z.object({
    provider: z.string(),
    model: z.string(),
    systemPrompt: z.string(),
    timeoutMs: z.natural(),
    maxTokens: z.natural(),
    concurrency: z.natural(),
  }),
  includeSubagents: z.boolean(),
  auditFile: z.string(),
});

/**
 * 剔除 schema 解析出的"空集合默认值"（schemastery 对 array/dict 缺省解析为 []/{}，
 * 标量缺省为 absent），避免把这些默认空值当成用户配置喂给 normalizeConfig
 * （其会 fail-loud 拒绝空 modes 数组）。供 validate 钩子与主条目 effectiveConfig 复用。
 * @param {object} value 解析值
 * @returns {object} 仅含非空字段的浅拷贝
 */
export function pruneEmpty(value) {
  const out = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) out[key] = v;
      continue;
    }
    if (typeof v === 'object') {
      if (Object.keys(v).length > 0) out[key] = v;
      continue;
    }
    out[key] = v;
  }
  return out;
}

/**
 * 分区写时/注册时校验：剔除空默认值后 = `normalizeConfig`（design.md §12.2）。
 * 任何非法值抛错 → 拒绝写入/注册；空 modes/levels 等 schema 默认回落为
 * normalizeConfig 的默认值（空 modes 即"未设"，回落 ['workspace-write']）。
 * @param {object} value 当前解析出的分区值（schema 合法）
 * @returns {Readonly<Config>} 规范化后的冻结配置
 */
export function validateYoloSettings(value) {
  return normalizeConfig(pruneEmpty(value));
}

/**
 * 安装 yolo-mode settings 分区（可选-settings 消费者接线）。
 * settings 服务缺失时打 debug 日志并跳过（插件继续按插件行 config 运行）。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} entry 插件行 config（成为 settings `base` 层）
 * @param {import('@deepseek-ai/dsh-settings').SettingsSectionHooks<object>} hooks
 *   { setSource, onChange, validate? }
 */
export function installYoloSettings(ctx, entry, hooks) {
  const settings = ctx.get('settings');
  if (settings === undefined) {
    ctx.logger.debug(
      '[yolo-mode] no settings service mounted; using composition config and skipping settings section registration',
    );
    return;
  }
  settings.installSection(ctx, YOLO_SETTINGS_NAMESPACE, YoloSettingsSchema, entry, hooks);
}
