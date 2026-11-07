const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const children = []
const startedTick = performance.now()
let interrupted
let record
let recordPath

const elapsedMs = () => Math.round(performance.now() - startedTick)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const log = message => console.log(`Evidence display: ${message}`)
const writeRecord = () => {
  if (recordPath) fs.writeFileSync(recordPath, JSON.stringify({ ...record, elapsedMs: elapsedMs() }, null, 2) + '\n')
}

function start(label, command, args, env, forwardOutput = true) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const owned = { label, child, stdout: '', stderr: '', result: null, stopPromise: null }
  children.push(owned)
  owned.completion = new Promise(resolve => {
    let spawnError
    child.once('error', error => { spawnError = error.message })
    child.stdout.on('data', data => {
      owned.stdout += data.toString()
      if (forwardOutput) process.stdout.write(data)
    })
    child.stderr.on('data', data => {
      owned.stderr += data.toString()
      if (forwardOutput) process.stderr.write(data)
    })
    child.once('close', (code, signal) => {
      owned.result = { pid: child.pid ?? null, code, signal, ...(spawnError ? { error: spawnError } : {}) }
      resolve(owned.result)
    })
  })
  return owned
}

async function stop(owned, signal = 'SIGTERM') {
  if (owned.result) return owned.result
  if (owned.stopPromise) return owned.stopPromise
  owned.stopPromise = (async() => {
    log(`forward ${signal} to owned ${owned.label} PID ${owned.child.pid}`)
    owned.child.kill(signal)
    const killTimer = setTimeout(() => {
      if (owned.result) return
      log(`owned ${owned.label} PID ${owned.child.pid} still live after 3000ms; send SIGKILL`)
      owned.child.kill('SIGKILL')
    }, 3000)
    try { return await owned.completion } finally { clearTimeout(killTimer) }
  })()
  return owned.stopPromise
}

async function commandResult(label, command, args, env, timeout = 1500, forwardOutput = false) {
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
  const owned = start(label, command, args, env, forwardOutput)
  let expired = false
  const timer = setTimeout(() => { expired = true; stop(owned).catch(error => console.error(error)) }, timeout)
  try {
    const result = await owned.completion
    if (expired || result.error || result.signal) throw new Error(`${label} failed: ${JSON.stringify({ ...result, timedOut: expired })}`)
    return { ...result, stdout: owned.stdout, stderr: owned.stderr }
  } finally { clearTimeout(timer) }
}

function supportingWindow(output) {
  const id = output.match(/window id #\s*(0x[\da-f]+)/i)?.[1]
  return id && !/^0x0+$/.test(id) ? id : null
}

async function waitForWindowManager(wm, env) {
  const deadline = performance.now() + 8000
  while (performance.now() < deadline) {
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
    if (wm.result) throw new Error(`Owned window manager exited before readiness: ${JSON.stringify(wm.result)}`)
    const root = await commandResult('WM root property probe', 'xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], env, 1000)
    const windowId = supportingWindow(root.stdout)
    if (root.code === 0 && windowId) {
      const check = await commandResult('WM identity probe', 'xprop', ['-id', windowId, '_NET_SUPPORTING_WM_CHECK', '_NET_WM_PID', '_NET_WM_NAME'], env, 1000)
      const ownerPid = Number(check.stdout.match(/_NET_WM_PID[^=]*=\s*(\d+)/)?.[1]) || null
      const selfReference = supportingWindow(check.stdout) === windowId
      const isXfwm = /_NET_WM_NAME[^=]*=\s*"Xfwm4"/i.test(check.stdout)
      if (check.code === 0 && selfReference && isXfwm && ownerPid === wm.child.pid && !wm.result) {
        return { windowId, ownerPid, rootProperty: root.stdout.trim(), identityProperties: check.stdout.trim(), ownership: 'EWMH PID equals owned xfwm4 child PID' }
      }
    }
    await delay(100)
  }
  throw new Error('Owned xfwm4 did not publish a valid _NET_SUPPORTING_WM_CHECK within 8000ms')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted ||= signal
    // Forward only to subprocess handles created by this wrapper. Never signal
    // a process group, an inherited bus, the X server, or an external window.
    for (const owned of children) stop(owned, signal).catch(error => console.error(error))
  })
}

async function main() {
  const [electronBinary, ...electronArgs] = process.argv.slice(2)
  if (!electronBinary) throw new Error('Usage: node display.cjs electronBinary [electronArgs...]')
  if (process.env.LUX_EVIDENCE_PRIVATE_DBUS !== '1' || !process.env.DBUS_SESSION_BUS_ADDRESS || !process.env.DISPLAY) {
    throw new Error('Run inside an owned private session: xvfb-run ... dbus-run-session -- env LUX_EVIDENCE_PRIVATE_DBUS=1 node display.cjs electronBinary ...')
  }
  const config = JSON.parse(fs.readFileSync(process.env.LUX_EVIDENCE_CONFIG, 'utf8'))
  if (!config.scratch || !config.output || !/^[\w-]+$/.test(config.phase?.id ?? '')) throw new Error('Invalid evidence display configuration')
  const displayDirectory = path.join(config.scratch, `display-${config.phase.id}`)
  const wmPaths = {
    XDG_CONFIG_HOME: path.join(displayDirectory, 'config'),
    XDG_CACHE_HOME: path.join(displayDirectory, 'cache'),
    XDG_DATA_HOME: path.join(displayDirectory, 'data'),
    XDG_STATE_HOME: path.join(displayDirectory, 'state'),
  }
  for (const directory of Object.values(wmPaths)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  fs.mkdirSync(config.output, { recursive: true })
  recordPath = path.join(config.output, `phase-${config.phase.id}-display.json`)
  record = { schemaVersion: 1, runId: config.runId, phaseId: config.phase.id, display: process.env.DISPLAY, privateDbusSession: true, wrapperPid: process.pid, status: 'starting', wmPaths }
  writeRecord()
  const wmEnv = { ...process.env, ...wmPaths }
  // xfconfd can be activated by the private D-Bus daemon rather than xfwm4.
  // Isolate those writes too, without changing HOME or Electron's environment.
  const activation = await commandResult('private D-Bus activation environment', 'dbus-update-activation-environment', Object.entries(wmPaths).map(([name, value]) => `${name}=${value}`), wmEnv)
  if (activation.code !== 0) throw new Error(`Unable to isolate private D-Bus activation environment: ${activation.stderr}`)
  const existing = await commandResult('initial WM root property probe', 'xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], wmEnv)
  if (existing.code !== 0) throw new Error(`Unable to query private X display: ${existing.stderr}`)
  if (supportingWindow(existing.stdout)) throw new Error('Private display already has a window manager; refusing to replace it')
  const version = await commandResult('xfwm4 version', 'xfwm4', ['--version'], wmEnv)
  if (version.code !== 0) throw new Error(`Unable to read xfwm4 version: ${version.stderr}`)
  record.wmVersion = version.stdout.trim()
  if (version.stderr.trim()) record.wmVersionDiagnostics = version.stderr.trim()
  log(record.wmVersion)
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
  const wm = start('xfwm4', 'xfwm4', ['--compositor=off', '--sm-client-disable'], wmEnv)
  record.wmPid = wm.child.pid ?? null
  log(`started owned xfwm4 PID ${record.wmPid}`)
  writeRecord()
  record.ready = await waitForWindowManager(wm, wmEnv)
  record.readyElapsedMs = elapsedMs()
  record.status = 'ready'
  log(`owned xfwm4 ready: PID ${record.wmPid}, window ${record.ready.windowId}`)
  writeRecord()
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
  const electron = start('Electron', electronBinary, electronArgs, process.env)
  record.electronPid = electron.child.pid ?? null
  record.status = 'running'
  writeRecord()
  const first = await Promise.race([
    electron.completion.then(result => ({ kind: 'electron', result })),
    wm.completion.then(result => ({ kind: 'wm', result })),
  ])
  if (first.kind === 'wm') throw new Error(`Owned xfwm4 exited while Electron was running: ${JSON.stringify(first.result)}`)
  record.electron = first.result
  record.status = first.result.code === 0 && !first.result.error && !first.result.signal ? 'passed' : 'failed'
  return first.result.code ?? (first.result.signal === 'SIGINT' ? 130 : first.result.signal === 'SIGTERM' ? 143 : 1)
}

;(async() => {
  let exitCode = 1
  try {
    exitCode = await main()
  } catch (error) {
    console.error(error.stack ?? error)
    if (record) Object.assign(record, { status: 'failed', failure: String(error.stack ?? error) })
  } finally {
    await Promise.all(children.map(owned => stop(owned)))
    if (record) {
      record.children = children.map(owned => ({ label: owned.label, ...owned.result }))
      record.cleanupComplete = children.every(owned => Boolean(owned.result))
      if (interrupted) Object.assign(record, { status: 'interrupted', interrupted })
      writeRecord()
    }
    process.exitCode = interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : exitCode
  }
})().catch(error => { console.error(error.stack ?? error); process.exitCode = 1 })
