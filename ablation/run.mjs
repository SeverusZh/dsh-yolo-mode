/**
 * dsh-yolo-mode 消融运行脚本（ablation/run.mjs）
 *
 * 对每个变体：
 *   - M1–M6（code 变体）：git apply ablation/variants/<ID>.patch → 跑探针 →
 *     git checkout 恢复 lib/；
 *   - M7/M8（组合/静态变体）：无 patch，直接跑探针。
 * 结果写入 ablation/results.json，并打印摘要。
 *
 * 运行：node ablation/run.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const CODE_VARIANTS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']
const STATIC_VARIANTS = ['M7', 'M8']
const ALL = [...CODE_VARIANTS, ...STATIC_VARIANTS]

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts })
}

/** 从探针 stdout 提取最后一行 JSON 结果（容忍 logger 输出混入）。 */
function parseProbeOutput(out) {
  const lines = out.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed.variant === 'string') return parsed
    } catch {
      /* not the result line */
    }
  }
  throw new Error('probe output contains no result JSON: ' + out.slice(0, 500))
}

const results = []
for (const variant of ALL) {
  let applied = false
  try {
    if (CODE_VARIANTS.includes(variant)) {
      run('git', ['apply', path.join('ablation', 'variants', variant + '.patch')])
      applied = true
    }
    const out = run('node', ['ablation/probe.mjs', variant])
    const parsed = parseProbeOutput(out)
    results.push(parsed)
    console.log(`${parsed.pass ? 'PASS' : 'FAIL'} ${variant}: ${parsed.note}`)
    for (const [k, v] of Object.entries(parsed.checks)) {
      if (v !== 'ok') console.log(`      ${k}: ${v}`)
    }
  } catch (err) {
    results.push({
      variant,
      loadOk: false,
      checks: { run: 'FAIL: ' + String(err?.message ?? err) },
      pass: false,
      note: 'run error',
    })
    console.log(`ERROR ${variant}: ${String(err?.message ?? err)}`)
  } finally {
    if (applied) {
      run('git', ['checkout', '--', 'lib/index.js'])
    }
  }
}

fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(results, null, 2))
const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} variants passed`)
