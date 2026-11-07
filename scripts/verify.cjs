// Run every gate against this checkout and retain its real exit code and output.
const { spawnSync, execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'artifacts', 'verification')
mkdirSync(output, { recursive: true })
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this verifier through npm run verify so npm_execpath identifies the npm CLI')
const commands = ['lint', 'typecheck', 'test', 'build:main', 'build:renderer', 'build:renderer-lyric', 'build:renderer-scripts']
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
  pullRequestHead: process.env.LUX_PR_HEAD_SHA || null,
  pullRequestBase: process.env.LUX_PR_BASE_SHA || null,
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  checks: [],
}
let failed = false
for (const command of commands) {
  const started = performance.now()
  console.log(`\nRunning npm run ${command}`)
  const result = spawnSync(process.execPath, [npmCli, 'run', command], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.stack}` : ''}`
  writeFileSync(path.join(output, `${command.replaceAll(':', '-')}.log`), log)
  const check = { command: `npm run ${command}`, exitCode: result.status, signal: result.signal, durationMs: performance.now() - started }
  report.checks.push(check)
  console.log(`${command}: exit ${result.status}, ${check.durationMs}ms`)
  if (result.status !== 0) {
    failed = true
    console.error(log.slice(-24000))
  }
}
writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (failed) process.exitCode = 1
