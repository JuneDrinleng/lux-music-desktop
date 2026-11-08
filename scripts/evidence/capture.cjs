const { createHash, randomUUID } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { preferences, palettes, customThemeId } = require('./profile.cjs')

const root = path.resolve(__dirname, '../..')
const mode = process.env.LUX_EVIDENCE_MODE ?? 'baseline'
if (!['baseline', 'themes', 'media', 'window', 'native-drag'].includes(mode)) throw new Error(`Unsupported LUX_EVIDENCE_MODE: ${mode}`)
if (process.env.LUX_EVIDENCE_XVFB && !['0', '1'].includes(process.env.LUX_EVIDENCE_XVFB)) throw new Error('LUX_EVIDENCE_XVFB must be 0 or 1')
if (['media', 'window', 'native-drag'].includes(mode) && (process.platform !== 'linux' || process.env.LUX_EVIDENCE_XVFB === '0')) throw new Error(`${mode} evidence requires its own Linux Xvfb/WM session`)
const output = path.resolve(root, process.env.LUX_EVIDENCE_DIR ?? (mode !== 'baseline' ? 'artifacts/screenshots' : 'docs/screenshots/m0'))
const sizes = (process.env.LUX_EVIDENCE_SIZES ?? '1280x800,1024x700').split(',').map(value => {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) throw new Error(`Invalid LUX_EVIDENCE_SIZES entry: ${value}`)
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 800 || height < 500 || width > 3840 || height > 2160) throw new Error(`Unsupported evidence size: ${value}`)
  return { width, height }
})
const sha256 = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const git = args => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}
const phasePlan = () => {
  if (mode === 'baseline') return [{ id: 'baseline', baseline: true }]
  if (mode === 'media') return [{ id: 'media', media: true }]
  if (mode === 'window') return [{ id: 'window', window: true }]
  if (mode === 'native-drag') return [{ id: 'native-drag', nativeDrag: true }]
  const ids = [...Object.keys(palettes), 'green', customThemeId]
  return [
    ...ids.map((themeId, index) => ({ id: `theme-${themeId}`, baseline: index === 0, selectThemeId: themeId, expectedRestoredThemeId: ids[index - 1] ?? null, activationKey: index % 2 ? 'Space' : 'Enter' })),
    { id: 'custom-theme-restart', expectedRestoredThemeId: customThemeId },
  ]
}

async function run() {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const buildFiles = fs.readdirSync(path.join(root, 'dist'), { recursive: true })
    .filter(name => fs.statSync(path.join(root, 'dist', name)).isFile()).sort()
  for (const entry of ['main.js', 'index.html', 'renderer.js']) {
    if (!buildFiles.includes(entry)) throw new Error(`Missing dist/${entry}; build main and renderer first`)
  }
  const build = Object.fromEntries(buildFiles.map(name => [name, sha256(path.join(root, 'dist', name))]))
  const harnessFiles = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort()
  const source = {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    pullRequestHeadSha: process.env.LUX_PR_HEAD_SHA ?? null,
    pullRequestBaseSha: process.env.LUX_PR_BASE_SHA ?? null,
    dirty: git(['status', '--porcelain']) !== '',
    buildSha256: build,
    harnessSha256: Object.fromEntries(harnessFiles.map(name => [name, sha256(path.join(__dirname, name))])),
  }
  // Electron 42's JS entry downloads missing executables. Read its installed
  // marker directly so capture never starts an implicit installer.
  const electronPackage = path.dirname(require.resolve('electron/package.json'))
  const marker = path.join(electronPackage, 'path.txt')
  const executable = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null
  const electron = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executable ?? 'electron')
    : executable ? path.join(electronPackage, 'dist', executable) : null
  if (!electron || !fs.existsSync(electron)) throw new Error('Electron binary unavailable; run the reviewed runtime preparation first')
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-electron-evidence-'))
  const userData = path.join(scratch, 'user-data')
  const lxData = path.join(userData, 'LxDatas')
  fs.mkdirSync(lxData, { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(lxData, 'config_v2.json'), JSON.stringify({ version: '2.1.0', setting: { version: '2.1.0', ...preferences } }, null, 2))
  let customFixture = null
  if (mode === 'themes') {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'src/common/theme/index.json'), 'utf8'))
    const legacy = registry.find(theme => theme.id === 'green')
    if (!legacy) throw new Error('The retained green theme is required for the labelled custom fixture')
    customFixture = JSON.parse(JSON.stringify(legacy))
    Object.assign(customFixture, { id: customThemeId, name: '证据用自定义主题', isCustom: true })
    customFixture.config.extInfo['--color-main-background'] = '#fff8ed'
    customFixture.config.extInfo['--color-app-background'] = '#fff8ed'
    fs.writeFileSync(path.join(lxData, 'theme.json'), JSON.stringify({ themes: [customFixture] }, null, 2))
  }
  const configPath = path.join(scratch, 'capture-config.json')
  const args = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1', path.join(__dirname, 'electron-main.cjs'), '-dha', '-dt']
  const env = { ...process.env, LUX_EVIDENCE_CONFIG: configPath }
  delete env.ELECTRON_RUN_AS_NODE
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'BT_TOKEN']) delete env[name]
  let command = electron
  let commandArgs = args
  // A host DISPLAY can accept X11 requests yet never dispatch compositor
  // animation frames. A private Xvfb also isolates real keyboard focus from
  // other desktop windows. Explicit 0 opts in to a usable inherited display.
  const preferIsolatedDisplay = process.platform === 'linux' && process.env.LUX_EVIDENCE_XVFB !== '0'
  let displayAvailable = Boolean(process.env.DISPLAY)
  if (process.platform === 'linux' && !preferIsolatedDisplay && displayAvailable) {
    try { execFileSync('xdpyinfo', ['-display', process.env.DISPLAY], { stdio: 'ignore', timeout: 3000 }) } catch { displayAvailable = false }
  }
  const isolatedDisplay = process.platform === 'linux' && (preferIsolatedDisplay || !displayAvailable)
  if (isolatedDisplay) {
    command = 'xvfb-run'
    commandArgs = ['--auto-servernum', '--server-args=-screen 0 1920x1200x24', 'dbus-run-session', '--', 'env', 'LUX_EVIDENCE_PRIVATE_DBUS=1', process.execPath, path.join(__dirname, 'display.cjs'), electron, ...args]
  }
  const displayMode = isolatedDisplay ? 'isolated Xvfb/private D-Bus/owned xfwm4' : process.platform === 'linux' ? 'inherited X11 display; WM ownership unverified' : 'native platform display; WM ownership unverified'
  const log = fs.createWriteStream(path.join(output, 'electron.log'))
  const phases = []
  let failure = null
  try {
    for (const phase of phasePlan()) {
      const manifestName = `phase-${phase.id}.json`
      const phaseStartedAt = new Date().toISOString()
      const phaseStartedTick = performance.now()
      fs.writeFileSync(configPath, JSON.stringify({ root, output, sizes, source, scratch, userData, runId, mode, phase, manifestName, customFixture, command: 'npm run evidence', driverNode: process.version, displayMode }, null, 2))
      log.write(`\nEvidence phase ${phase.id}: starting a NEW Electron process with the SAME isolated userData\n`)
      console.log(`Evidence phase ${phase.id}: new Electron process`)
      const processResult = await new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
        const timeoutMs = 150000
        let timedOut = false
        let killTimer
        const exitTimer = setTimeout(() => {
          timedOut = true
          const message = `Evidence phase ${phase.id}: owned launcher PID ${child.pid} did not exit within ${timeoutMs}ms; requesting SIGTERM\n`
          process.stderr.write(message)
          log.write(message)
          child.kill('SIGTERM')
          killTimer = setTimeout(() => {
            if (child.exitCode !== null || child.signalCode !== null) return
            const message = `Evidence phase ${phase.id}: owned launcher PID ${child.pid} is still live after SIGTERM; requesting SIGKILL\n`
            process.stderr.write(message)
            log.write(message)
            child.kill('SIGKILL')
          }, 3000)
        }, timeoutMs)
        const clearTimers = () => { clearTimeout(exitTimer); clearTimeout(killTimer) }
        child.stdout.on('data', data => { process.stdout.write(data); log.write(data) })
        child.stderr.on('data', data => { process.stderr.write(data); log.write(data) })
        child.once('error', error => { clearTimers(); reject(error) })
        child.once('exit', (code, signal) => {
          clearTimers()
          resolve({ launcherPid: child.pid, code: code ?? 1, signal, timedOut, timeoutMs })
        })
      })
      const phasePath = path.join(output, manifestName)
      const manifest = fs.existsSync(phasePath) ? JSON.parse(fs.readFileSync(phasePath, 'utf8')) : { status: 'failed', captures: [], observations: [], checks: [], failure: 'Electron exited without a phase manifest' }
      const displayPath = path.join(output, `phase-${phase.id}-display.json`)
      const nativeDisplay = isolatedDisplay && fs.existsSync(displayPath) ? JSON.parse(fs.readFileSync(displayPath, 'utf8')) : null
      const previous = phases.at(-1)
      phases.push({ ...manifest, nativeDisplay, process: { ...processResult, startedAt: phaseStartedAt, exitedAt: new Date().toISOString(), elapsedMs: performance.now() - phaseStartedTick, previousPhaseExited: previous ? previous.process.code === 0 : null } })
      if (processResult.timedOut) throw new Error(`Electron phase ${phase.id} did not exit within ${processResult.timeoutMs}ms; owned launcher PID ${processResult.launcherPid} was terminated and its exit was observed`)
      if (processResult.code !== 0 || manifest.status !== 'passed' || manifest.runId !== runId) throw new Error(`Electron phase ${phase.id} failed; inspect ${manifestName} and electron.log`)
      if (isolatedDisplay && (!nativeDisplay || nativeDisplay.status !== 'passed' || !nativeDisplay.cleanupComplete || nativeDisplay.runId !== runId || nativeDisplay.phaseId !== phase.id || nativeDisplay.electronPid !== manifest.runtime.processId || !nativeDisplay.wmPid || nativeDisplay.ready?.ownerPid !== nativeDisplay.wmPid)) throw new Error(`Owned WM session identity/cleanup failed for ${phase.id}; inspect ${path.basename(displayPath)}`)
      if (previous && previous.runtime.processId === manifest.runtime.processId) throw new Error('A theme restart must use a distinct Electron process')
      if (phase.selectThemeId) {
        const setting = JSON.parse(fs.readFileSync(path.join(lxData, 'config_v2.json'), 'utf8')).setting
        if (setting['theme.id'] !== phase.selectThemeId) throw new Error(`Theme was not durable after process exit: ${phase.selectThemeId}`)
      }
      for (const item of [...manifest.captures, ...manifest.observations.filter(item => item.file)]) {
        if (sha256(path.join(output, item.file)) !== item.sha256) throw new Error(`Screenshot digest mismatch: ${item.file}`)
      }
    }
    for (const [name, hash] of Object.entries(build)) {
      if (sha256(path.join(root, 'dist', name)) !== hash) throw new Error(`Build changed during evidence capture: dist/${name}`)
    }
    const finalHarnessFiles = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort()
    if (JSON.stringify(finalHarnessFiles) !== JSON.stringify(harnessFiles)) throw new Error('Evidence harness file set changed during capture')
    for (const [name, hash] of Object.entries(source.harnessSha256)) {
      if (sha256(path.join(__dirname, name)) !== hash) throw new Error(`Evidence harness changed during capture: ${name}`)
    }
    const captures = phases.flatMap(phase => phase.captures)
    const count = kind => captures.filter(item => item.kind === kind).length
    if (!['media', 'window', 'native-drag'].includes(mode) && count('route') !== sizes.length * 6) throw new Error('Baseline route/size matrix is incomplete')
    if (mode === 'media') {
      if (phases.length !== 1 || count('media') !== 3) throw new Error('Real-media process/three-screenshot matrix is incomplete')
      const media = phases.flatMap(phase => phase.checks).filter(check => check.kind === 'real-player')
      if (media.length !== 1) throw new Error('Expected exactly one real local-media pipeline proof')
      for (const action of ['local-file-import', 'playing', 'pause', 'seek', 'next', 'prev', 'volume-and-mute', 'playback-mode']) {
        if (!media[0].results.some(result => result.action === action)) throw new Error(`Missing actual local-media behavior proof: ${action}`)
      }
    }
    if (mode === 'window') {
      if (phases.length !== 1 || count('window-controls') !== 2 || count('window-fullscreen') !== 1) throw new Error('Original-window controls process/three-screenshot matrix is incomplete')
      const windowChecks = phases.flatMap(phase => phase.checks)
      for (const side of ['left', 'right']) if (!windowChecks.some(check => check.kind === 'original-window-events' && check.side === side && check.minimizeEvent && check.closeRequested)) throw new Error(`Missing actual window IPC/events for ${side}`)
      if (!windowChecks.some(check => check.kind === 'original-fullscreen-state')) throw new Error('Missing original F11 native/renderer state proof')
    }
    if (mode === 'native-drag') {
      if (phases.length !== 1 || count('window-native-drag') !== 1) throw new Error('Native-drag process/screenshot matrix is incomplete')
      const fixture = phases.flatMap(phase => phase.checks).filter(check => check.kind === 'native-drag-window-fixture')
      if (fixture.length !== 1 || fixture[0].originalResizable !== false || fixture[0].restoredResizable !== false || fixture[0].originalFullscreen !== false || fixture[0].startInFullscreen !== false || fixture[0].renderer.startInFullscreen !== false) throw new Error('Missing original fixed/nonfullscreen native window fixture proof')
      const native = phases.flatMap(phase => phase.checks).filter(check => check.kind === 'original-native-window-drag')
      if (native.length !== 1 || native[0].results.length !== 2 || new Set(native[0].results.map(result => result.scope)).size !== 2) throw new Error('Expected both original native drag regions')
      for (const scope of ['#left', '#toolbar']) {
        const result = native[0].results.find(result => result.scope === scope)
        if (!result || [result.windowStateBefore, result.windowStateAfter].some(state => !state || state.resizable !== false || state.fullscreen !== false || state.minimized !== false || state.visible !== true || state.focused !== true)) throw new Error(`Native drag changed or omitted original fixed window state: ${scope}`)
        if (!result || result.afterTravel.x - result.beforeTravel.x !== 40 || result.afterTravel.y - result.beforeTravel.y !== 20 || result.restored.x !== result.originalBefore.x || result.restored.y !== result.originalBefore.y) throw new Error(`Actual measured native movement/restoration missing: ${scope}`)
      }
    }
    if (mode === 'themes') {
      if (count('theme') !== 6 || count('focus') !== 6 || count('compatibility') !== 2 || count('restart') !== 8 || count('auto-preview') !== 1) throw new Error('Theme/focus/compatibility/restart/automatic-preview matrix is incomplete')
      if (!phases.some(phase => phase.checks.some(check => check.kind === 'automatic-theme-preview-palettes'))) throw new Error('Missing automatic-theme real CSS palette proof')
      for (const id of [...Object.keys(palettes), 'green', customThemeId]) {
        if (!phases.some(phase => phase.checks.some(check => check.kind === 'theme-selected' && check.themeId === id))) throw new Error(`Missing real selection proof: ${id}`)
        if (!phases.some(phase => phase.checks.some(check => check.kind === 'theme-restored-after-process-restart' && check.themeId === id))) throw new Error(`Missing full process restart proof: ${id}`)
      }
    }
  } catch (error) {
    failure = String(error.stack ?? error)
  } finally {
    const captures = phases.flatMap(phase => phase.captures)
    const manifest = {
      schemaVersion: 2,
      runId,
      status: failure ? 'failed' : 'passed',
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      source,
      runtime: phases[0]?.runtime ?? null,
      application: phases[0]?.application ?? null,
      lifecycle: { processLaunches: phases.length, sharedUserData: 'one isolated temporary profile; seeded only once before the first process', restartMethod: 'await real Electron process exit, then spawn a fresh Electron process; no reload', customThemeFixture: customFixture },
      phases,
      captures,
      observations: phases.flatMap(phase => phase.observations),
      checks: phases.flatMap(phase => phase.checks),
      runtimeErrors: phases.flatMap(phase => phase.runtimeErrors ?? []),
      ...(failure ? { failure } : {}),
    }
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await new Promise(resolve => log.end(resolve))
    fs.rmSync(scratch, { recursive: true, force: true })
  }
  if (failure) throw new Error(failure)
  console.log(`Verified ${phases.flatMap(phase => phase.captures).length} real Electron screenshots in ${phases.length} process phase(s): ${path.relative(root, output)}/manifest.json`)
}

run().catch(error => { console.error(error.stack ?? error); process.exitCode = 1 })
