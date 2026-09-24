/**
 * dsh-yolo-mode —— 宿主设置分区（lib/settings.js）
 *
 * 镜像参考项目 dsh-subagents-options/src/settings.ts：注册 settings 命名空间
 * `yolo-mode`，用 schemastery 宽松 schema 解析分区值，写时校验委托
 * ./policy.js 的 `normalizeConfig`（fail-loud 抛错即拒绝写入）。
 *
 * 分层层（design.md §12.3 + 0.1.7 单层迁移）：0.1.7 起设置不再由
 * settings.yaml 覆盖层承载，而是**当前 Profile 的插件条目 config 单层**——
 * schemastery Config schema 的默认值即 base 层，用户在设置页的改动写回该
 * 条目 config。故本模块导出的 `YoloSettingsSchema` 同时是插件 Config schema
 * （见 lib/index.js 的 `export const Config`），每个可热更字段用 `.volatile()`
 * 声明；读取用 `config.<field>.get()`。
 *
 * DSH 0.1.7-rc.1 兼容：dsh-settings 默认导出由 `SettingsProvider`
 * （`installSection`）改为 `SettingsForms`（`describe/update/replace/mutate`）。
 * `installSection` 已删除；页面策略改走
 * `ctx.settings.configure({ auto }, ownerFiber)`（auto:false = 插件自建 UI）。
 * 旧的 `settings.yaml` 由 `SettingsForms.importLegacyDocument` 一次性导入。
 *
 * 纯 JavaScript（ESM），宿主代码仅 import node: 内置与同包 peer
 * （@deepseek-ai/dsh-settings、@deepseek-ai/schemastery）。
 *
 * @module lib/settings.js
 */
import z from '@deepseek-ai/schemastery';
import { normalizeConfig } from './policy.js';

/** settings 命名空间：`yolo-mode`（与插件行 id 一致，纯小写 kebab-case）。 */
export const YOLO_SETTINGS_NAMESPACE = 'yolo-mode';

/** 预设枚举（与 ./policy.js PRSESTS 保持一致，供 union schema 使用）。 */
const PRESETS = ['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'];

/**
 * schemastery Config schema（0.1.7 起同时是插件的权威设置 schema）：全字段可选
 * （object 字段默认可选），使未写入的空白分区解析为空对象，绝不泄漏默认值覆盖
 * 条目 config 的普通层。每个顶层字段用 `.volatile()` 声明为可热更——设置页的
 * 写回经 loader 的 `_commitVolatile` 就地更新引用，插件无需重启；这与旧模型
 * "只改某些字段不重启插件" 的行为一致。
 *
 * 注意：`.volatile()` 不可嵌套（schemastery 校验"volatile 字段需固定对象路径"），
 * 故只标注顶层字段；其子路径由 `isVolatilePath` 视作可热更。
 *
 * 真正的形状/语义校验由写时 `validateYoloSettings = normalizeConfig` 完成（fail-loud）
 * 以及 schemastery 在 configEditor 写回时的解析校验。
 */
export const YoloSettingsSchema = z.object({
  preset: z.union([...PRESETS]).default('balanced').volatile(),
  modes: z.array(z.string()).volatile(),
  levels: z.dict(z.any()).volatile(),
  judge: z
    .object({
      provider: z.string(),
      model: z.string(),
      systemPrompt: z.string(),
      timeoutMs: z.natural(),
      maxTokens: z.natural(),
      concurrency: z.natural(),
    })
    .volatile(),
  includeSubagents: z.boolean().volatile(),
  auditFile: z.string().volatile(),
});

/**
 * 从已解析的 Config 读取当前设置值（0.1.7：`config.<field>.get()`）。
 * volatile 引用由 loader 就地更新，故每次裁决读取即为最新值。
 * @param {object} config apply(ctx, config) 收到的已解析 Config
 * @returns {object} 仅含 schema 字段的普通对象（未设字段为 undefined/空集合）
 */
export function readYoloConfig(config) {
  return {
    preset: config.preset.get(),
    modes: config.modes.get(),
    levels: config.levels.get(),
    judge: config.judge.get(),
    includeSubagents: config.includeSubagents.get(),
    auditFile: config.auditFile.get(),
  };
}

/**
 * 剔除 schema 解析出的"空集合默认值"（schemastery 对 array/dict 缺省解析为
 * []/{}，标量缺省为 absent），避免把这些默认空值当成用户配置喂给
 * normalizeConfig（其会 fail-loud 拒绝空 modes 数组）。供 validate 钩子与
 * 主条目 effectiveConfig 复用。
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
 * 注册 yolo-mode 的设置页面策略（0.1.7 `SettingsForms.configure`）。
 *
 * 插件自带 Web 客户端设置页（slot `settings.section`），故 `auto:false`
 * 禁止宿主再自动生成重复页面；页面策略注册到本插件 fiber 的 effects，
 * 卸载时自动注销。settings 服务缺失时 `ctx.inject` 回调不运行（零侵入，
 * 插件继续按 Config schema 默认 + 条目 config 运行）。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 主插件 fiber 的上下文
 */
export function installYoloSettingsPage(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
