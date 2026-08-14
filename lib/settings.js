/**
 * dsh-yolo-mode —— 宿主设置分区（lib/settings.js）
 *
 * 镜像参考项目 dsh-subagents-options/src/settings.ts：注册 settings 命名空间
 * `yolo-mode`，用 schemastery 宽松 schema 解析分区值，写时校验委托
 * ./policy.js 的 `normalizeConfig`（fail-loud 抛错即拒绝写入）。
 *
 * 分层层（design.md §12.3）：插件行 config 作为 settings 的 `base` 层，
 * 用户文档写在上层；`installYoloSettings` 走 `installSettingsSection` 的
 * 可选-settings 消费者接线，部署无 settings 服务时打 debug 日志跳过（零侵入）。
 *
 * 纯 JavaScript（ESM），宿主代码仅 import node: 内置与同包 peer
 * （@deepseek-ai/dsh-settings、@deepseek-ai/schemastery）。
 *
 * @module lib/settings.js
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { normalizeConfig } from './policy.js';

/** settings 命名空间：`yolo-mode`（与插件行 id 一致，纯小写 kebab-case）。 */
export const YOLO_SETTINGS_NAMESPACE = settingsNamespace('yolo-mode');

/** 预设枚举（与 ./policy.js PRSESTS 保持一致，供 union schema 使用）。 */
const PRESETS = ['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'];

/**
 * schemastery 宽松 schema：全字段可选（object 字段默认可选），
 * 使未写入的空白分区解析为空对象，绝不泄漏默认值覆盖插件行 config。
 * 真正的形状/语义校验由写时 `validateYoloSettings = normalizeConfig` 完成（fail-loud）。
 */
export const YoloSettingsSchema = z.object({
  preset: z.union([...PRESETS]),
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
 * 分区写时校验：= `normalizeConfig`（design.md §12.2）。
 * 任何非法值抛错 → 拒绝写入。值经 schema 解析后已是"部分字段可选"的宽松形状，
 * `normalizeConfig` 会补全默认并深冻结（fail-loud）。
 * @param {object} value 当前解析出的分区值（schema 合法）
 * @returns {Readonly<Config>} 规范化后的冻结配置
 */
export function validateYoloSettings(value) {
  return normalizeConfig(value);
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
  if (ctx.get('settings') === undefined) {
    ctx.logger.debug(
      '[yolo-mode] no settings service mounted; using composition config and skipping settings section registration',
    );
    return;
  }
  installSettingsSection(ctx, YOLO_SETTINGS_NAMESPACE, YoloSettingsSchema, entry, hooks);
}
