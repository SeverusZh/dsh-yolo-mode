/**
 * dsh-yolo-mode —— 审计日志文件解析与打开（lib/audit.js）
 *
 * 审计 JSONL 路径的唯一解析来源：主条目（lib/index.js 的 audit()）与桥接条目
 * （openLogFile 端点）都必须落到同一个文件，否则「打开日志」会指向错误位置。
 * 规则（design.md §8/§11.1，README 配置表 auditFile）：
 *   - 配置显式给出非空 `auditFile` → 用配置值；
 *   - 否则回落默认 `%TEMP%/dsh-yolo/judge.log`（os.tmpdir()，宿主真实临时目录）。
 *
 * `openFileWithDefaultApp` 用 OS 默认应用打开文件（fire-and-forget）：
 *   - darwin → `open <file>`
 *   - win32  → `cmd /c start "" "<file>"`（引号包实参，兼容含空格路径）
 *   - 其余   → `xdg-open <file>`
 * 启动失败（如 xdg-open 缺失）经 child 'error' 事件返回 { ok:false }，
 * 绝不抛出（打开失败不致命，UI 只提示）。
 *
 * 纯函数层（resolveAuditFile / auditFileExists / openerCommandFor）无副作用，
 * 可在普通 node 环境单测。
 *
 * @module lib/audit.js
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

/** 默认审计日志路径：`%TEMP%/dsh-yolo/judge.log`（design.md §8；每次调用取当前 tmpdir）。 */
export function defaultAuditFile() {
  return path.join(os.tmpdir(), 'dsh-yolo', 'judge.log');
}

/**
 * 解析生效的审计日志路径：显式非空 `auditFile` 优先（返回值去除首尾空白），
 * 否则回落默认。
 * @param {object|undefined} cfg 配置字形（view.value / effectiveConfig）
 * @returns {string} 绝对或配置给定的审计日志路径
 */
export function resolveAuditFile(cfg) {
  const configured =
    cfg && typeof cfg === 'object' && typeof cfg.auditFile === 'string' ? cfg.auditFile.trim() : '';
  return configured !== '' ? configured : defaultAuditFile();
}

/**
 * 审计日志文件是否已存在（尚无裁决时不创建、不弹错误对话框）。
 * @param {string} file
 * @returns {boolean}
 */
export function auditFileExists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

/**
 * 按平台挑选「默认应用打开」命令（纯函数，可注入 platform 单测）。
 * @param {string} file 目标文件路径
 * @param {string} [platform] process.platform 值；缺省取当前进程
 * @returns {{command: string, args: string[]}}
 */
export function openerCommandFor(file, platform = process.platform) {
  const target = String(file);
  if (platform === 'darwin') return { command: 'open', args: [target] };
  if (platform === 'win32') {
    // cmd 的 start 把首个带引号实参当作窗口标题；用 "" 占位，文件实参整体包引号。
    return { command: 'cmd', args: ['/c', 'start', '""', '"' + target.replace(/"/g, '\\"') + '"'] };
  }
  return { command: 'xdg-open', args: [target] };
}

/**
 * 用 OS 默认应用打开文件（detached + unref 的 fire-and-forget）。
 * @param {string} file
 * @returns {Promise<{ok:true, value:{path:string}} | {ok:false, error:{code:string, message:string, details:object}}>}
 */
export function openFileWithDefaultApp(file) {
  return new Promise((resolve) => {
    const { command, args } = openerCommandFor(file);
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore' });
    } catch (err) {
      settle({
        ok: false,
        error: {
          code: 'open-failed',
          message: 'failed to launch ' + command + ': ' + String(err && err.message ? err.message : err),
          details: { path: file },
        },
      });
      return;
    }
    child.once('error', (err) => {
      settle({
        ok: false,
        error: {
          code: 'open-failed',
          message: 'failed to launch ' + command + ': ' + (err && err.message ? err.message : String(err)),
          details: { path: file },
        },
      });
    });
    child.once('spawn', () => {
      child.unref();
      settle({ ok: true, value: { path: file } });
    });
  });
}
