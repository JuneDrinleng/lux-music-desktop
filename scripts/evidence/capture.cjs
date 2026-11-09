const { createHash, randomUUID } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { preferences, palettes, customThemeId } = require('./profile.cjs')

const root = path.resolve(__dirname, '../..')
const mode = process.env.LUX_EVIDENCE_MODE ?? 'baseline'
if (!['baseline', 'themes', 'media', 'window', 'native-drag', 'layout'].includes(mode)) throw new Error(`Unsupported LUX_EVIDENCE_MODE: ${mode}`)
if (process.env.LUX_EVIDENCE_XVFB && !['0', '1'].includes(process.env.LUX_EVIDENCE_XVFB)) throw new Error('LUX_EVIDENCE_XVFB must be 0 or 1')
if (['media', 'window', 'native-drag', 'layout'].includes(mode) && (process.platform !== 'linux' || process.env.LUX_EVIDENCE_XVFB === '0')) throw new Error(`${mode} evidence requires its own Linux Xvfb/WM session`)
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
  if (mode === 'layout') {
    return [
      { id: 'layout-wide', layout: 'wide', transparentWindow: true },
      { id: 'layout-minimum', layout: 'minimum', transparentWindow: false },
    ]
  }
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
      const phaseScratch = phase.layout ? path.join(scratch, phase.id) : scratch
      const phaseUserData = phase.layout ? path.join(phaseScratch, 'user-data') : userData
      const seededPreferences = phase.layout ? { ...preferences, 'common.transparentWindow': phase.transparentWindow, 'common.fontSize': 16, 'theme.id': 'lime' } : preferences
      if (phase.layout) {
        const directory = path.join(phaseUserData, 'LxDatas')
        fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(directory, 'config_v2.json'), JSON.stringify({ version: '2.1.0', setting: { version: '2.1.0', ...seededPreferences } }, null, 2))
      }
      const phaseArgs = phase.layout && phase.transparentWindow ? commandArgs.filter(arg => arg !== '-dt') : commandArgs
      const phaseSizes = phase.layout ? [{ width: 1280, height: 800 }] : sizes
      fs.writeFileSync(configPath, JSON.stringify({ root, output, sizes: phaseSizes, source, scratch: phaseScratch, userData: phaseUserData, seededPreferences, runId, mode, phase, manifestName, customFixture, command: 'npm run evidence', driverNode: process.version, displayMode }, null, 2))
      log.write(`\nEvidence phase ${phase.id}: starting a NEW Electron process with ${phase.layout ? 'a FRESH phase-specific profile' : 'the SAME isolated userData'}\n`)
      console.log(`Evidence phase ${phase.id}: new Electron process`)
      const processResult = await new Promise((resolve, reject) => {
        const child = spawn(command, phaseArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
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
    if (['baseline', 'themes'].includes(mode) && count('route') !== sizes.length * 6) throw new Error('Baseline route/size matrix is incomplete')
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
    if (mode === 'layout') {
      const plan = [['layout-wide', true, 20], ['layout-minimum', false, 14]]
      if (source.dirty || !source.commit || phases.length !== 2 || captures.length !== 34 || count('shell-route') !== 30 || count('shell-focus') !== 2 || count('shell-download-setting') !== 2) throw new Error('Full M2a layout/native-window matrix is incomplete')
      const profileIds = new Set(); const routeKeys = new Set()
      const sides = ['left', 'top', 'right', 'bottom']
      const insetsMatch = (actual, expected) => sides.every(side => Number.isFinite(actual?.[side]) && Math.abs(actual[side] - expected) <= 0.01)
      for (const [index, [id, transparent, total]] of plan.entries()) {
        const phase = phases[index]
        if (phase.phase.id !== id || phase.phase.transparentWindow !== transparent || phase.captures.length !== total || JSON.stringify(phase.source) !== JSON.stringify(source)) throw new Error(`Wrong layout phase/source: ${id}`)
        const profile = phase.application.userData
        if (profileIds.has(profile) || profile !== path.join(scratch, id, 'user-data') || phase.application.seededPreferences['common.transparentWindow'] !== transparent) throw new Error('Layout phases must use distinct freshly seeded native-window profiles')
        profileIds.add(profile)
        const fixtures = phase.checks.filter(check => check.kind === 'layout-native-window-fixture')
        if (fixtures.length !== 1) throw new Error(`Missing native layout startup/restoration proof: ${id}`)
        for (const state of [fixtures[0].initial, fixtures[0].restored]) {
          if (!state || state.mainDt !== !transparent || state.constructorTransparentDerived !== transparent || state.mainPreference !== transparent || state.diskPreference !== transparent ||
            state.userData !== profile || state.appData !== path.join(scratch, id) || state.startupFlags.includes('-dt') !== !transparent) throw new Error(`Native constructor input/profile disagrees: ${id}`)
          if (state.construction.file !== 'src/main/modules/winMain/main.ts' || state.construction.expression !== 'transparent: !global.envParams.cmdParams.dt' || state.construction.sourceSha256 !== sha256(path.join(root, 'src/main/modules/winMain/main.ts'))) throw new Error('Production native-window construction source changed')
          const renderer = state.renderer
          if (new URL(state.url).searchParams.get('dt') !== String(!transparent) || renderer.urlDt !== String(!transparent) || renderer.dt !== !transparent ||
            !renderer.classes.includes(transparent ? 'transparent' : 'disableTransparent') || renderer.classes.includes(transparent ? 'disableTransparent' : 'transparent')) throw new Error(`Native dt/URL/renderer classes disagree: ${id}`)
          if (!insetsMatch(renderer.htmlPadding, transparent ? 8 : 0) || !insetsMatch(renderer.bodyBorder, transparent ? 0 : 1)) throw new Error(`Actual native-mode CSS insets disagree: ${id}`)
        }
        if (!fixtures[0].initial.nativeWindowId || fixtures[0].initial.nativeWindowId !== fixtures[0].restored.nativeWindowId) throw new Error('Layout fixture unexpectedly recreated or omitted its native window')
        if (phase.captures.some(item => item.phaseId !== id || item.themeId !== 'lime' || item.resolvedId !== 'lime')) throw new Error('Fresh layout phase inherited an unexpected theme/phase')
        const phaseRoutes = phase.captures.filter(item => item.kind === 'shell-route')
        if (phaseRoutes.length !== (transparent ? 18 : 12) || phase.checks.filter(check => check.kind === 'readable-navigation-labels').length !== (transparent ? 18 : 14)) throw new Error(`Missing per-route readable labels: ${id}`)
        for (const check of phase.checks.filter(check => check.kind === 'readable-navigation-labels')) {
          if (check.labels.length !== 6 || check.labels.some(label => !label.text || !label.visible || label.clipped || label.occluded || !label.textRects.length)) throw new Error(`Incomplete actual label text/clip proof: ${id}`)
        }
        for (const item of phaseRoutes) {
          const frame = item.frame; const geometry = item.geometry
          const key = `${frame.width}x${frame.height}/${frame.fontSize}/${item.route}`
          if (routeKeys.has(key) || item.width !== frame.width || item.height !== frame.height || geometry.width !== frame.width || geometry.height !== frame.height ||
            geometry.fontSize !== `${frame.fontSize}px` || item.labels.path !== item.route || item.labels.hasSemanticNavigation !== true || item.labels.entries.length !== 6 ||
            item.labels.entries.some(entry => !entry.text || entry.text !== entry.label) || item.labels.entries.filter(entry => entry.current === 'page').length !== 1 ||
            !item.labels.entries.some(entry => entry.current === 'page' && entry.href === '#' + item.route) || item.identity.title !== 'Lux Music') throw new Error(`Route/frame proof disagrees: ${key}`)
          if (!insetsMatch(geometry.frames.html.padding, transparent ? 8 : 0) || !insetsMatch(geometry.frames.body.border, transparent ? 0 : 1)) throw new Error(`Per-frame root insets changed: ${key}`)
          routeKeys.add(key)
        }
      }
      for (const [width, height, font] of [[1024, 700, 16], [1280, 800, 16], [1440, 900, 16], [828, 540, 16], [828, 540, 19]]) {
        for (const route of ['/search', '/songList/list', '/leaderboard', '/list', '/download', '/setting']) if (!routeKeys.has(`${width}x${height}/${font}/${route}`)) throw new Error('M2a five-frame/six-route matrix has a missing fixture')
      }
      const focus = phases[1].checks.filter(check => check.kind === 'layout-keyboard-focus')
      for (const name of ['navigation-minimum-font19', 'search-minimum-font19']) {
        const result = focus.find(check => check.name === name)
        const capture = phases[1].captures.find(item => item.kind === 'shell-focus' && item.focus?.name === name)
        if (!result || result.actual.width !== 828 || result.actual.height !== 540 || result.actual.fontSize !== '19px' ||
          !result.actual.active || !result.actual.focusVisible || !result.actual.visibility.visible || !(result.actual.outlineAlpha > 0) ||
          result.actual.clipping.outsideViewport || result.actual.clipping.ancestors.some(parent => parent.clipped) ||
          JSON.stringify(result.keyboard.inputSequence) !== JSON.stringify(['programmatic starting focus', 'Shift+Tab', 'Tab'])) throw new Error(`Missing actual 19px keyboard focus: ${name}`)
        if (!capture || JSON.stringify(capture.focus.actual) !== JSON.stringify(result.actual) || JSON.stringify(capture.focus.keyboard) !== JSON.stringify(result.keyboard)) throw new Error(`Focus PNG is missing its actual input/style proof: ${name}`)
      }
      const allChecks = phases.flatMap(phase => phase.checks)
      for (const value of [false, true]) {
        const gate = allChecks.find(check => check.kind === 'original-download-gating' && check.value === value)
        if (!phases[0].captures.some(item => item.kind === 'shell-download-setting' && item.value === value && item.width === 1280 && item.height === 800)) throw new Error('Download state PNG is missing')
        if (!gate || ['renderer', 'main', 'disk', 'checkbox'].some(key => gate.setting[key] !== value) || gate.state.entries.length !== (value ? 6 : 5) ||
          gate.state.entries.some(entry => entry.href === '#/download') !== value || ['/search', '/songList/list', '/leaderboard', '/list', '/setting'].some(route => !gate.state.entries.some(entry => entry.href === '#' + route))) throw new Error('Original download setting/entry proof is incomplete')
      }
      const detail = allChecks.find(check => check.kind === 'original-detail-fixture')
      if (!detail || detail.fixture.path !== '/songList/detail' || detail.fixture.origin !== 'SongList' || detail.restored.path !== '/songList/list' ||
        JSON.stringify(detail.query) !== JSON.stringify({ source: 'kw', id: 'digest-8__9001', page: '3', fromName: 'SongList' }) ||
        Object.keys(detail.fixture.query).length !== 4 || Object.entries(detail.query).some(([key, value]) => detail.fixture.query[key] !== value) ||
        !allChecks.some(check => check.kind === 'original-detail-back' && check.origin === 'SongList')) throw new Error('Original mounted-router detail fixture/native back proof is incomplete')
      for (const phase of phases) {
        const fontFamily = phase.checks.filter(check => check.kind === 'shell-original-font-family')
        if (fontFamily.length !== (phase.phase.id === 'layout-wide' ? 1 : 0)) throw new Error('Missing or unexpected original font-family proof')
        for (const proof of fontFamily) {
          const { original, selected, restored, fontQuery, chosen, inputs } = proof
          const three = (state, value) => ['renderer', 'main', 'disk'].every(key => state[key] === value)
          const inherited = state => state.families.html === state.families.container && state.families.html === state.families.navigation
          const chosenValue = /[\s()+]/.test(chosen) ? `"${chosen}"` : chosen
          if (!three(original, '') || !three(selected, chosenValue) || !three(restored, '') ||
            ![original, selected, restored].every(inherited) || selected.families.html === original.families.html ||
            JSON.stringify(restored.families) !== JSON.stringify(original.families) ||
            JSON.stringify(original.selectionLabels) !== JSON.stringify([original.defaultLabel]) ||
            JSON.stringify(restored.selectionLabels) !== JSON.stringify(original.selectionLabels) ||
            JSON.stringify(selected.selectionLabels) !== JSON.stringify([chosen, original.defaultLabel]) ||
            fontQuery.status !== 0 || fontQuery.signal || fontQuery.error || fontQuery.timeoutMs !== 2000 ||
            !Number.isInteger(fontQuery.familyCount) || fontQuery.familyCount < 1 || !Number.isInteger(fontQuery.pid) || fontQuery.pid <= 0 || fontQuery.executable !== 'fc-list' || fontQuery.selectedFamily !== chosen || !fontQuery.stdoutSha256 || !fontQuery.menuLabelsSha256 ||
            !inputs.some(input => input.name === 'installed-primary-select') || !inputs.some(input => input.name === 'restore-primary-default') ||
            inputs.some(input => !Number.isFinite(input.point.x) || !Number.isFinite(input.point.y))) throw new Error('Incomplete real font selection/inheritance/restoration proof')
        }
        const fonts = phase.checks.filter(check => check.kind === 'shell-original-font')
        if (fonts.length !== (phase.phase.layout === 'wide' ? 6 : 3) || fonts.some(check => check.after.checked !== true || ['renderer', 'main', 'disk'].some(key => check.after[key] !== check.value) || check.after.computed !== `${check.value}px` || check.after.rootComputed !== `${check.value}px`)) throw new Error('Original font control proof disagrees')
        const cleanups = phase.checks.filter(check => check.kind === 'shell-layout-consumer')
        if (cleanups.length !== (phase.phase.layout === 'wide' ? 2 : 1) || cleanups.some(check => {
          const restored = check.restored; const expected = check.original.renderer
          return typeof check.originalResizable !== 'boolean' || ['renderer', 'main', 'disk'].some(key => restored[key] !== expected) || restored.computed !== `${expected}px` || restored.rootComputed !== `${expected}px` ||
            restored.width !== check.originalSize[0] || restored.height !== check.originalSize[1] || restored.nativeSize[0] !== check.originalSize[0] || restored.nativeSize[1] !== check.originalSize[1] || restored.resizable !== check.originalResizable
        })) throw new Error('Layout original font/viewport/resizable cleanup proof is incomplete')
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
      lifecycle: { processLaunches: phases.length, sharedUserData: mode === 'layout' ? 'a fresh isolated profile for each native-window layout phase; no settings/theme/history carry-over' : 'one isolated temporary profile; seeded only once before the first process', restartMethod: 'await real Electron process exit, then spawn a fresh Electron process; no reload', customThemeFixture: customFixture },
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
