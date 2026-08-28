/**
 * dsh-yolo-mode —— 审计日志模块单测（test/audit.test.mjs）
 *
 * 覆盖 lib/audit.js：resolveAuditFile 解析规则（显式 auditFile 优先 / 空白与缺失
 * 回落默认 tmp 路径）、auditFileExists、openerCommandFor 三平台命令挑选。
 * openFileWithDefaultApp 的真实 spawn 不做端到端断言（依赖 OS 默认应用），
 * 只验证平台命令纯函数与错误分支的 RpcResult 形状。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  defaultAuditFile,
  resolveAuditFile,
  auditFileExists,
  openerCommandFor,
} from '../lib/audit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('audit: defaultAuditFile 指向 %TEMP%/dsh-yolo/judge.log', () => {
  assert.equal(defaultAuditFile(), path.join(os.tmpdir(), 'dsh-yolo', 'judge.log'))
})

test('audit: resolveAuditFile 显式非空 auditFile 优先', () => {
  const custom = 'D:/logs/yolo/judge.jsonl'
  assert.equal(resolveAuditFile({ auditFile: custom }), custom)
  // 带空白 trim
  assert.equal(resolveAuditFile({ auditFile: '  ' + custom + '  ' }), custom)
})

test('audit: resolveAuditFile 空白/缺失/非字符串回落默认 tmp 路径', () => {
  const fallback = defaultAuditFile()
  assert.equal(resolveAuditFile({}), fallback)
  assert.equal(resolveAuditFile({ auditFile: '' }), fallback)
  assert.equal(resolveAuditFile({ auditFile: '   ' }), fallback)
  assert.equal(resolveAuditFile({ auditFile: 42 }), fallback)
  assert.equal(resolveAuditFile(undefined), fallback)
  assert.equal(resolveAuditFile(null), fallback)
})

test('audit: auditFileExists 对真实存在/不存在的路径返回真假', () => {
  const missing = path.join(os.tmpdir(), 'dsh-yolo-test-missing-' + Date.now() + '.log')
  assert.equal(auditFileExists(missing), false)
  assert.equal(auditFileExists(path.join(__dirname, 'audit.test.mjs')), true)
})

test('audit: openerCommandFor 按平台挑选命令', () => {
  const file = 'C:/Users/admin/AppData/Local/Temp/dsh-yolo/judge.log'
  const darwin = openerCommandFor(file, 'darwin')
  assert.deepEqual(darwin, { command: 'open', args: [file] })

  const win = openerCommandFor(file, 'win32')
  assert.equal(win.command, 'cmd')
  assert.deepEqual(win.args, ['/c', 'start', '""', '"' + file + '"'])
  // 含空格路径在 win32 也被整体包引号
  const spaced = openerCommandFor('C:/My Logs/judge.log', 'win32')
  assert.deepEqual(spaced.args, ['/c', 'start', '""', '"C:/My Logs/judge.log"'])

  const linux = openerCommandFor('/tmp/dsh-yolo/judge.log', 'linux')
  assert.deepEqual(linux, { command: 'xdg-open', args: ['/tmp/dsh-yolo/judge.log'] })
})
