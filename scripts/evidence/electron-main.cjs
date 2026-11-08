const { app, ipcMain, shell } = require('electron')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const installOfflineGuard = require('./offline.cjs')
const { preferences, palettes, legacyIds, customThemeId } = require('./profile.cjs')

const config = JSON.parse(fs.readFileSync(process.env.LUX_EVIDENCE_CONFIG, 'utf8'))
const routes = [
  { name: 'search', path: '/search' }, { name: 'songlists', path: '/songList/list' },
  { name: 'leaderboard', path: '/leaderboard' }, { name: 'library', path: '/list' },
  { name: 'downloads', path: '/download' }, { name: 'settings', path: '/setting' },
]
const startedAt = new Date().toISOString()
const startedTick = performance.now()
const manifestPath = path.join(config.output, config.manifestName)
const errors = []
const captures = []
const observations = []
const checks = []
const stages = []
let blockedNetworkRequests = 0
let completed = false
let mainWindow
let navigationIndex = 0
let currentStage = 'waiting for the application window'
const configFile = path.join(config.userData, 'LxDatas/config_v2.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const readSetting = () => JSON.parse(fs.readFileSync(configFile, 'utf8')).setting
const themeSelector = id => `[data-theme-id=${JSON.stringify(id)}]`

// Every process reuses this exact profile; only the Node driver seeds it, once.
app.setPath('userData', config.userData)
app.setPath('appData', config.scratch)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setAsDefaultProtocolClient = () => false
shell.openExternal = async() => { throw new Error('External navigation disabled in evidence run') }
installOfflineGuard(() => { blockedNetworkRequests++ })
ipcMain.on('lux-evidence:network-blocked', () => { blockedNetworkRequests++ })
ipcMain.on('lux-evidence:runtime-error', (_event, error) => { errors.push(error) })

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const bounded = async(promise, description, timeout = 10000) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Timed out during ${description}; stage: ${currentStage}`)), timeout) }),
    ])
  } finally { clearTimeout(timer) }
}
const execute = (code, description = 'renderer JavaScript') => bounded(mainWindow.webContents.executeJavaScript(code, true), description)
const stage = (description, detail = {}) => {
  currentStage = description
  const record = { description, at: new Date().toISOString(), elapsedMs: Math.round(performance.now() - startedTick), ...detail }
  stages.push(record)
  console.log(`Evidence ${config.phase.id}: ${description} (+${record.elapsedMs}ms)`)
}
const waitFor = async(predicate, description, timeout = 30000) => {
  stage(`wait for ${description}`)
  const deadline = performance.now() + timeout
  while (performance.now() < deadline) {
    if (await predicate()) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const flushPaint = async() => {
  const paint = await execute('new Promise(resolve => requestAnimationFrame(firstFrameTime => requestAnimationFrame(secondFrameTime => resolve({ firstFrameTime, secondFrameTime, visibilityState: document.visibilityState }))))', 'two renderer animation frames')
  if (!(paint.secondFrameTime > paint.firstFrameTime)) throw new Error(`Renderer did not advance across two animation frames: ${JSON.stringify(paint)}`)
  return paint
}
const movePointerAway = () => mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: Math.floor(mainWindow.getContentSize()[0] / 2) + navigationIndex++, y: 15 })
const key = (keyCode, modifiers = []) => {
  mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
}

function writeManifest(status, failure) {
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 2,
    runId: config.runId,
    phase: config.phase,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    source: config.source,
    runtime: { os: `${os.platform()} ${os.release()} ${os.arch()}`, driverNode: config.driverNode, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, modulesAbi: process.versions.modules, scaleFactor: 1, processId: process.pid },
    application: {
      mainEntry: 'dist/main.js',
      rendererEntry: 'dist/index.html',
      nativeDatabase: 'better-sqlite3; real application worker, isolated temporary database',
      routeNavigation: 'click actual sidebar anchors and inspect active route',
      data: config.mode === 'search' ? 'labelled deterministic raw HTTP search fixtures; real SDK, store, router, SQLite/IPC and production Vue UI; no accounts or public API responses' : config.mode === 'downloads' ? 'labelled synthetic download tasks seeded through real SQLite; generated silent WAV; transport worker and external shell fixtures; no personal files/accounts/public downloads' : ['media', 'queue'].includes(config.mode) ? 'one isolated userData; generated local WAV fixtures imported through the original UI/worker/DB; no personal files, accounts, secrets, or public API responses' : 'one shared isolated userData; no user accounts, secrets, music, or public API responses',
      network: 'Node TCP and Chromium HTTP(S) denied; search mode serves labelled in-memory HTTP responses without sockets',
      captureScheduling: 'webContents background throttling disabled only by the evidence harness; every screenshot still awaits two real animation frames',
      displayMode: config.displayMode,
      blockedNetworkRequests,
      seededPreferences: config.seededPreferences ?? preferences,
      themeFixture: config.customFixture ? { id: customThemeId, source: 'explicit raw legacy-green clone in temporary LxDatas/theme.json; selected via real app UI/IPC' } : null,
      userData: app.getPath('userData'),
      unverifiedNativeBoundaries: ['Windows/macOS window controls and taskbar', 'system URL scheme registration (suppressed)', 'system tray', 'audio output', 'desktop lyric window', 'downloaded media', 'real online music services'],
    },
    command: config.command,
    stages,
    lastStage: currentStage,
    windowState: mainWindow && !mainWindow.isDestroyed() ? { visible: mainWindow.isVisible(), minimized: mainWindow.isMinimized(), focused: mainWindow.isFocused(), backgroundThrottling: mainWindow.webContents.getBackgroundThrottling() } : null,
    captures,
    observations,
    checks,
    runtimeErrors: errors,
    ...(failure ? { failure } : {}),
  }, null, 2) + '\n')
}
function fail(error) {
  if (completed) return
  completed = true
  const failure = String(error.stack ?? error)
  console.error(failure)
  writeManifest('failed', failure)
  app.exit(1)
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)
setTimeout(() => fail(new Error('Evidence phase exceeded 120 seconds')), 120000).unref()

app.on('browser-window-created', (_event, window) => {
  const ses = window.webContents.session
  if (config.mode === 'search') ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'search-preload.cjs') })
  const preload = path.join(__dirname, 'offline-preload.cjs')
  if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', filePath: preload })
  else ses.setPreloads([...ses.getPreloads(), preload])
  if (['media', 'queue', 'downloads'].includes(config.mode)) {
    const mediaPreload = path.join(__dirname, 'player-preload.cjs')
    if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', filePath: mediaPreload })
    else ses.setPreloads([...ses.getPreloads(), mediaPreload])
  }
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { blockedNetworkRequests++; callback({ cancel: true }) })
  if (mainWindow) return
  mainWindow = window
  // Xvfb/CI may classify an otherwise visible BrowserWindow as background and
  // suppress rAF indefinitely. Keep the actual renderer and compositor active;
  // never replace or bypass the two real frame callbacks used below.
  window.webContents.setBackgroundThrottling(false)
  for (const name of ['show', 'hide', 'minimize', 'restore', 'focus', 'blur']) window.on(name, () => console.log(`Evidence ${config.phase.id}: window ${name}`))
  window.webContents.on('render-process-gone', (_event, details) => fail(new Error(`Renderer stopped: ${details.reason}`)))
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) fail(new Error(`Renderer failed to load (${code}): ${description}; ${url}`))
  })
  capture().catch(fail)
})

async function screenshot(file, kind, detail = {}) {
  stage(`screenshot ${file}: fonts ready`)
  await execute('document.fonts.ready.then(() => true)', 'renderer fonts ready')
  const rendererAtPaint = await execute('({ visibilityState: document.visibilityState, hidden: document.hidden, documentHasFocus: document.hasFocus(), readyState: document.readyState, requestAnimationFrame: window.requestAnimationFrame.toString() })')
  stage(`screenshot ${file}: flush paint`, { rendererAtPaint })
  const paint = await flushPaint()
  stage(`screenshot ${file}: DOM snapshot`)
  const snapshot = await execute('(() => { const root = document.querySelector("#root"); const view = document.querySelector("#view"); const style = getComputedStyle(root); return { hash: location.hash, title: document.title, lang: document.documentElement.lang, rootSize: { width: root.offsetWidth, height: root.offsetHeight }, viewSize: { width: view.offsetWidth, height: view.offsetHeight }, background: style.backgroundColor, color: style.color, text: view.innerText.slice(0, 500) } })()')
  stage(`screenshot ${file}: capture page`)
  const image = await bounded(mainWindow.webContents.capturePage(), `capture page ${file}`)
  const size = image.getSize()
  const [width, height] = mainWindow.getContentSize()
  if (size.width !== width || size.height !== height || image.isEmpty()) throw new Error(`Unexpected image size: ${file}`)
  const png = image.toPNG()
  fs.writeFileSync(path.join(config.output, file), png)
  const record = { file, kind, phaseId: config.phase.id, route: snapshot.hash.split('?')[0].slice(1), themeId: global.lx.theme.theme.id, resolvedId: global.lx.theme.theme.resolvedId ?? global.lx.theme.theme.id, width, height, capturedAt: new Date().toISOString(), sha256: hash(png), bytes: png.length, rendererAtPaint, paint, snapshot, ...detail }
  captures.push(record)
  console.log(`Captured ${file} (${png.length} bytes)`)
  return record
}
async function acknowledgeAudioWarning() {
  await delay(1000)
  const missingAudio = await execute('document.body.innerText.includes(window.i18n.t("media_device__empty_device_tip"))')
  if (!missingAudio) return
  const image = await mainWindow.webContents.capturePage()
  const png = image.toPNG()
  const file = `${config.phase.id}-startup-audio-warning.png`
  fs.writeFileSync(path.join(config.output, file), png)
  const warningText = await execute('({ message: window.i18n.t("media_device__empty_device_tip"), confirmationButtonText: window.i18n.t("ok") })')
  observations.push({ kind: 'audio-device-unavailable', phaseId: config.phase.id, ...warningText, action: 'Captured the real startup warning, then clicked its original confirmation button', file, ...image.getSize(), sha256: hash(png), bytes: png.length })
  const dismissed = await execute('(() => { const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === window.i18n.t("ok")); if (!button) return false; button.click(); return true })()')
  if (!dismissed) throw new Error('Cannot acknowledge the real missing-audio-device warning')
  await waitFor(() => execute('!document.body.innerText.includes(window.i18n.t("media_device__empty_device_tip"))'), 'startup warning acknowledgement')
}
async function navigate(route) {
  stage(`navigate ${route}: click actual sidebar entry`)
  const clicked = await execute(`(() => { const link = Array.from(document.querySelectorAll('#left a[href]')).find(a => a.getAttribute('href').split('?')[0] === ${JSON.stringify('#' + route)}); if (!link) return false; link.click(); return true })()`)
  if (!clicked) throw new Error(`Cannot click navigation: ${route}`)
  movePointerAway()
  await waitFor(() => execute(`location.hash.split('?')[0] === ${JSON.stringify('#' + route)} && Boolean(document.querySelector('#view').children.length)`), `route ${route}`)
  await delay(900)
}
async function openThemes() {
  await navigate('/setting')
  const more = await execute('(() => { const button = document.querySelector("[data-action=show-themes]"); if (button) { button.click(); return true } return false })()')
  await waitFor(() => execute('document.querySelectorAll("[data-theme-id]").length >= 21'), 'all six new and fifteen retained theme entries')
  const ids = await execute('Array.from(document.querySelectorAll("[data-theme-id]"), el => el.dataset.themeId)')
  const required = [...Object.keys(palettes), ...legacyIds, customThemeId]
  for (const id of required) if (!ids.includes(id)) throw new Error(`Theme entry disappeared: ${id}`)
  checks.push({ kind: 'theme-catalog-preserved', phaseId: config.phase.id, openedMoreThemes: more, requiredIds: required, actualIds: ids })
}
async function focusWithKeyboard(selector) {
  const found = await execute(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center', inline: 'nearest' }); el.focus(); return true })()`)
  if (!found) throw new Error(`Cannot find focus target ${selector}`)
  key('Tab', ['shift'])
  await delay(50)
  key('Tab')
  await waitFor(() => execute(`document.activeElement?.matches(${JSON.stringify(selector)}) && document.activeElement.matches(':focus-visible')`), `real keyboard focus-visible ${selector}`, 5000)
  return execute(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const style = getComputedStyle(el); const rect = el.getBoundingClientRect(); const root = document.querySelector('#root').getBoundingClientRect(); return { selector: ${JSON.stringify(selector)}, inputSequence: ['programmatic starting focus', 'Shift+Tab', 'Tab'], focusVisible: el.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, outlineColor: style.outlineColor, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, insideWindow: rect.x >= root.x && rect.y >= root.y && rect.right <= root.right && rect.bottom <= root.bottom } })()`)
}
async function themeSnapshot() {
  const renderer = await execute(`(() => {
    const root = document.querySelector('#root'); const style = getComputedStyle(root)
    const probe = document.createElement('span'); probe.style.position = 'absolute'; probe.style.visibility = 'hidden'; root.appendChild(probe)
    const semanticColors = {}; const rawTokens = {}; const names = { paper: 'paper', ink: 'ink', list: 'list', accent: 'accent', onAccent: 'on-accent' }
    for (const [role, css] of Object.entries(names)) { rawTokens[role] = style.getPropertyValue('--lux-' + css).trim(); probe.style.color = 'var(--lux-' + css + ')'; semanticColors[role] = getComputedStyle(probe).color }
    probe.remove()
    return { selectedThemeId: window.lxData.appSetting['theme.id'], semanticColors, rawTokens, rootBackground: style.backgroundColor, rootColor: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth }
  })()`)
  return { mainSelectedId: global.lx.appSetting['theme.id'], resolvedId: global.lx.theme.theme.resolvedId, persistedThemeId: readSetting()['theme.id'], persistedConfigSha256: hash(fs.readFileSync(configFile)), renderer }
}
function assertTheme(snapshot, expected) {
  if (snapshot.mainSelectedId !== expected || snapshot.resolvedId !== expected || snapshot.persistedThemeId !== expected || snapshot.renderer.selectedThemeId !== expected) throw new Error(`Selected/main/resolved/renderer/persisted theme disagree: ${JSON.stringify(snapshot)}`)
  const palette = palettes[expected]
  if (palette) {
    for (const [role, hex] of Object.entries(palette)) {
      const value = parseInt(hex.slice(1), 16)
      const rgb = `rgb(${value >> 16 & 255}, ${value >> 8 & 255}, ${value & 255})`
      if (snapshot.renderer.semanticColors[role] !== rgb) throw new Error(`Wrong actual CSS ${expected}/${role}: ${snapshot.renderer.semanticColors[role]} !== ${rgb}`)
    }
  }
  if (snapshot.renderer.overflow) throw new Error(`Theme ${expected} creates horizontal window overflow`)
}
async function proveRestoredTheme(id) {
  const snapshot = await themeSnapshot()
  assertTheme(snapshot, id)
  checks.push({ kind: 'theme-restored-after-process-restart', themeId: id, phaseId: config.phase.id, processId: process.pid, profileWasNotReseeded: true, snapshot })
  await navigate('/setting')
  await screenshot(`restart-${id}-${config.sizes[0].width}x${config.sizes[0].height}.png`, 'restart', { restoredThemeId: id })
}
async function selectTheme(id) {
  await openThemes()
  const selector = themeSelector(id)
  const focusBefore = await focusWithKeyboard(selector)
  key(config.phase.activationKey)
  await waitFor(async() => {
    const snapshot = await themeSnapshot()
    return snapshot.mainSelectedId === id && snapshot.resolvedId === id && snapshot.persistedThemeId === id && snapshot.renderer.selectedThemeId === id
  }, `real theme selection and durable storage ${id}`)
  const selected = await execute(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return { pressed: el.getAttribute('aria-pressed'), text: el.innerText.trim(), role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex') } })()`)
  if (selected.pressed !== 'true' || selected.role !== 'button' || selected.tabindex !== '0' || !selected.text || selected.text.includes('theme_')) throw new Error(`Invalid selected theme semantics: ${JSON.stringify(selected)}`)
  const snapshot = await themeSnapshot()
  assertTheme(snapshot, id)
  checks.push({ kind: 'theme-selected', themeId: id, phaseId: config.phase.id, activationKey: config.phase.activationKey, selected, focusBefore, snapshot })
  await execute('document.activeElement?.blur()')
  movePointerAway()
  await delay(500)
  const size = config.sizes[0]
  await screenshot(`theme-${id}-${size.width}x${size.height}.png`, palettes[id] ? 'theme' : 'compatibility', { selectedThemeId: id, semanticColors: snapshot.renderer.semanticColors })
  if (palettes[id]) {
    const focus = await focusWithKeyboard(selector)
    if (focus.outlineStyle === 'none' || parseFloat(focus.outlineWidth) < 2 || parseFloat(focus.outlineOffset) < 2 || !focus.insideWindow) throw new Error(`Focus ring is missing, weak, or clipped: ${JSON.stringify(focus)}`)
    checks.push({ kind: 'focus-visible', themeId: id, phaseId: config.phase.id, ...focus })
    await screenshot(`focus-${id}-${size.width}x${size.height}.png`, 'focus', { focus })
  }
}
async function verifyAutomaticThemePreviews() {
  stage('open automatic-theme configuration through its actual context menu')
  const target = await execute('(() => { const el = Array.from(document.querySelectorAll("li[aria-label]")).find(el => el.getAttribute("aria-label") === window.i18n.t("theme_auto_tip")); if (!el) return null; el.scrollIntoView({ block: "center", inline: "nearest" }); const rect = el.getBoundingClientRect(); return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } })()')
  if (!target) throw new Error('Cannot find the original automatic-theme context-menu entry')
  mainWindow.webContents.sendInputEvent({ type: 'mouseMove', ...target })
  mainWindow.webContents.sendInputEvent({ type: 'mouseDown', button: 'right', clickCount: 1, ...target })
  mainWindow.webContents.sendInputEvent({ type: 'mouseUp', button: 'right', clickCount: 1, ...target })
  await waitFor(() => execute('Boolean(document.querySelector("[data-theme-dialog=automatic]"))'), 'real automatic-theme configuration dialog')
  await waitFor(() => execute(`document.querySelectorAll('[data-theme-dialog=automatic] [data-theme-preview-id]').length >= ${Object.keys(palettes).length + legacyIds.length}`), 'complete automatic-theme preview collection')
  const previews = await execute('Array.from(document.querySelectorAll("[data-theme-dialog=automatic] [data-theme-preview-id]"), el => { const swatch = el.querySelector("span"); if (!swatch) return { themeId: el.dataset.themePreviewId, missingSwatch: true }; const style = getComputedStyle(swatch, "::after"); return { themeId: el.dataset.themePreviewId, label: el.getAttribute("aria-label"), backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage } })')
  for (const [id, palette] of Object.entries(palettes)) {
    const preview = previews.find(item => item.themeId === id)
    const value = parseInt(palette.accent.slice(1), 16)
    const expected = `rgb(${value >> 16 & 255}, ${value >> 8 & 255}, ${value & 255})`
    if (!preview || preview.backgroundColor !== expected) throw new Error(`Automatic-theme preview ${id} lost its actual palette swatch: ${JSON.stringify({ preview, expected })}`)
  }
  checks.push({ kind: 'automatic-theme-preview-palettes', openedBy: 'right mouse button on original automatic-theme entry', previews })
  movePointerAway()
  const size = config.sizes[0]
  await screenshot(`auto-preview-${size.width}x${size.height}.png`, 'auto-preview', { previews })
  const closed = await execute('(() => { const dialog = document.querySelector("[data-theme-dialog=automatic]"); const button = dialog?.parentElement.querySelector(":scope > header > button"); if (!button) return false; button.click(); return true })()')
  if (!closed) throw new Error('Cannot close the automatic-theme dialog through its original close button')
  await waitFor(() => execute('!document.querySelector("[data-theme-dialog=automatic]")'), 'automatic-theme dialog closure')
  assertTheme(await themeSnapshot(), 'lime')
}
async function capture() {
  await waitFor(() => execute('Boolean(document.querySelector("#container #view") && document.querySelector("#root").offsetHeight > 0)').catch(() => false), 'real Vue application mount')
  await waitFor(() => Promise.resolve(global.lx?.inited && global.lx?.worker?.dbService), 'application and native database initialization')
  stage('query real native database worker')
  const initialUserLists = await bounded(global.lx.worker.dbService.getAllUserList(), 'real native database query')
  if (!Array.isArray(initialUserLists)) throw new Error('Native database did not return a real user-list collection')
  checks.push({ kind: 'native-database-query', userListCount: initialUserLists.length })
  if (app.getPath('userData') !== config.userData) throw new Error('The app did not retain the shared isolated userData')
  const originalResizable = mainWindow.isResizable()
  const originalFullscreen = mainWindow.isFullScreen()
  mainWindow.setResizable(true)
  mainWindow.setContentSize(config.sizes[0].width, config.sizes[0].height)
  mainWindow.show()
  await waitFor(() => execute(`innerWidth === ${config.sizes[0].width} && innerHeight === ${config.sizes[0].height}`), 'initial content size')
  await acknowledgeAudioWarning()
  if (config.mode === 'themes' && !config.phase.expectedRestoredThemeId) {
    const initial = await themeSnapshot()
    assertTheme(initial, 'lime')
    checks.push({ kind: 'new-profile-default', themeId: 'lime', snapshot: initial })
  }
  if (config.phase.search) await require('./search.cjs')({ execute, waitFor, mainWindow, screenshot, checks, key, navigate, config, flushPaint, readDefaultList: () => bounded(global.lx.worker.dbService.getListMusics('default'), 'real search add database query') })
  if (config.phase.media) {
    await require('./player.cjs')({ config, mainWindow, execute, waitFor, screenshot, navigate, bounded, checks, observations, stage, delay, readSetting, key })
  }
  if (config.phase.downloads) await require('./downloads.cjs')({ config, mainWindow, execute, waitFor, screenshot, navigate, checks, stage, delay })
  if (config.phase.window) {
    await require('./window.cjs')({ mainWindow, execute, waitFor, screenshot, navigate, checks, observations, key, readSetting, flushPaint })
  }
  if (config.phase.nativeDrag) {
    if (originalResizable !== false || originalFullscreen || global.lx.appSetting['common.startInFullscreen'] !== false) throw new Error('Native-drag fixture requires the original default fixed, nonfullscreen window')
    const preparedResizable = mainWindow.isResizable()
    mainWindow.setResizable(originalResizable)
    mainWindow.focus()
    await waitFor(async() => {
      const [width, height] = mainWindow.getContentSize()
      return width === config.sizes[0].width && height === config.sizes[0].height && !mainWindow.isResizable() && !mainWindow.isFullScreen() && !mainWindow.isMinimized() && mainWindow.isVisible() && mainWindow.isFocused() &&
        await execute(`innerWidth === ${config.sizes[0].width} && innerHeight === ${config.sizes[0].height} && !document.documentElement.classList.contains('fullscreen')`)
    }, 'original fixed window and native/renderer viewport readiness before drag')
    const paint = await flushPaint()
    const renderer = await execute('({ width: innerWidth, height: innerHeight, startInFullscreen: window.lxData.appSetting["common.startInFullscreen"], fullscreen: document.documentElement.classList.contains("fullscreen"), devicePixelRatio, scale: visualViewport.scale })')
    if (preparedResizable !== true || renderer.startInFullscreen !== false || renderer.fullscreen || renderer.devicePixelRatio !== 1 || renderer.scale !== 1 || mainWindow.webContents.getZoomFactor() !== 1) throw new Error('Original native-drag fixture state or CSS/native coordinate scale changed')
    checks.push({ kind: 'native-drag-window-fixture', originalResizable, originalFullscreen, startInFullscreen: global.lx.appSetting['common.startInFullscreen'], preparedResizable, restoredResizable: mainWindow.isResizable(), contentSize: mainWindow.getContentSize(), renderer, paint })
    await require('./native-drag.cjs')({ mainWindow, execute, waitFor, screenshot, flushPaint, delay, checks, observations, stage })
  }
  if (config.phase.settings) {
    await require('./settings.cjs')({ config, mainWindow, execute, waitFor, screenshot, navigate, checks, delay, readSetting })
  }
  if (config.phase.expectedRestoredThemeId) await proveRestoredTheme(config.phase.expectedRestoredThemeId)
  if (config.phase.baseline) {
    stage('verify six actual sidebar entries')
    const anchors = await execute('Array.from(document.querySelectorAll("#left a[href]"), a => a.getAttribute("href"))')
    for (const route of routes) if (!anchors.some(href => href.split('?')[0] === '#' + route.path)) throw new Error(`Missing actual navigation entry: ${route.path}`)
    for (const size of config.sizes) {
      mainWindow.setContentSize(size.width, size.height)
      await waitFor(() => execute(`innerWidth === ${size.width} && innerHeight === ${size.height}`), `${size.width}x${size.height} content size`)
      for (const route of routes) { await navigate(route.path); await screenshot(`${route.name}-${size.width}x${size.height}.png`, 'route') }
    }
  }
  if (config.phase.selectThemeId) {
    mainWindow.setContentSize(config.sizes[0].width, config.sizes[0].height)
    await waitFor(() => execute(`innerWidth === ${config.sizes[0].width} && innerHeight === ${config.sizes[0].height}`), 'theme evidence size')
    await selectTheme(config.phase.selectThemeId)
  }
  if (config.mode === 'themes' && config.phase.baseline) await verifyAutomaticThemePreviews()
  if (errors.length) throw new Error(`Unexpected renderer runtime errors: ${JSON.stringify(errors)}`)
  stage('normal application quit after complete evidence')
  writeManifest('passed')
  completed = true
  // Real app shutdown: before-quit/close/worker termination run normally. The
  // driver waits for this process to exit before starting the next phase.
  global.lx.isSkipTrayQuit = true
  app.quit()
}

require(path.join(config.root, 'dist/main.js'))
