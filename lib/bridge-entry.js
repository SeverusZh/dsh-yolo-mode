/**
 * dsh-yolo-mode —— 独立桥接条目（lib/bridge-entry.js）
 *
 * 与主插件条目（lib/index.js）分离：因为宿主 webServer 服务只能经 cordis `inject`
 * 拿到，树外插件经 ctx.get('webServer') 永远拿不到（dsh-client-connection 自身也以
 * inject=["webServer"] 挂载）。本条目在 Web profile 中经 patch 行挂载，注入
 * webServer + settings，安装 `/yolo-mode` 设置桥；headless profile 无 webServer，
 * 本条目永不激活，主条目不受影响。
 *
 * statusView 的 preset/judgeConfigured 无法读取主条目的 effectiveConfig，故从
 * settings.describe 的 yolo-mode resolved view.value 推导；stats/recent 来自
 * lib/state.js 模块级单例（design.md §12.4）。
 */
import { installYoloRemoteBridge, pickYoloNamespaceView } from './remote.js';
import { getStatusPayload } from './state.js';

/** Cordis 插件名（桥接条目）。 */
export const name = 'yolo-mode-bridge';

/** 所需服务：webServer（路由宿主）与 settings（数据 seam）。 */
export const inject = ['webServer', 'settings'];

/**
 * 组合桥接条目专用的 statusView 载荷装配：
 * preset/judgeConfigured 从 settings.describe 的 resolved view 推导，
 * stats/recent 读 lib/state.js 模块级单例。
 * @param {object} settings settings 服务对象
 * @returns {{preset:string, judgeConfigured:boolean, stats:object, recent:Array<object>}}
 */
function composeStatusPayload(settings) {
  const view = pickYoloNamespaceView(settings.describe({ redactSecrets: true }));
  const value = view && view.value && typeof view.value === 'object' ? view.value : {};
  // state.getStatusPayload 以 value 的字形（preset + judge.provider/model）装配
  // { preset, judgeConfigured, stats, recent } 并做 stats/recent 浅拷贝。
  return getStatusPayload(value);
}

/**
 * 注册 `/yolo-mode` 设置桥路由；卸载时清理。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const settings = ctx.get('settings');
  installYoloRemoteBridge(ctx, settings, () => composeStatusPayload(settings));
}
