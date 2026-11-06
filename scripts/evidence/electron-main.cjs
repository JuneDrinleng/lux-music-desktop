const { app, ipcMain, shell } = require('electron')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const installOfflineGuard = require('./offline.cjs')

const config = JSON.parse(fs.readFileSync(process.env.LUX_EVIDENCE_CONFIG, 'utf8'))
const routes = [
  { name: 'search', path: '/search' },
  { name: 'songlists', path: '/songList/list' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'library', path: '/list' },
  { name: 'downloads', path: '/download' },
  { name: 'settings', path: '/setting' },
]
const startedAt = new Date().toISOString()
const manifestPath = path.join(config.output, 'manifest.json')
const errors = []
const captures = []
const observations = []
let blockedNetworkRequests = 0
let completed = false
let mainWindow
const preferences = {
  'common.langId': 'zh-cn',
  'common.isAgreePact': true,
  'common.showChangeLog': false,
  'common.tryAutoUpdate': false,
  'common.transparentWindow': false,
  'common.isShowAnimation': false,
  'common.randomAnimate': false,
  'search.isShowHotSearch': false,
  'search.isShowHistorySearch': false,
  'download.enable': true,
  'sync.enable': false,
  'openAPI.enable': false,
  'desktopLyric.enable': false,
  'tray.enable': false,
}

const userData = path.join(config.scratch, 'user-data')
const lxData = path.join(userData, 'LxDatas')
fs.mkdirSync(lxData, { recursive: true })
fs.writeFileSync(path.join(lxData, 'config_v2.json'), JSON.stringify({ version: '2.1.0', setting: { version: '2.1.0', ...preferences } }, null, 2))
app.setPath('userData', userData)
app.setPath('appData', config.scratch)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
// Avoid changing the host's URL-scheme association or launching a browser.
app.setAsDefaultProtocolClient = () => false
shell.openExternal = async() => { throw new Error('External navigation disabled in evidence run') }
installOfflineGuard(() => { blockedNetworkRequests++ })
ipcMain.on('lux-evidence:network-blocked', () => { blockedNetworkRequests++ })
ipcMain.on('lux-evidence:runtime-error', (_event, error) => { errors.push(error) })

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const execute = code => mainWindow.webContents.executeJavaScript(code, true)
const waitFor = async(predicate, description, timeout = 30000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const flushPaint = () => execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

function writeManifest(status, failure) {
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    source: config.source,
    runtime: {
      os: `${os.platform()} ${os.release()} ${os.arch()}`,
      driverNode: config.driverNode,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      modulesAbi: process.versions.modules,
      scaleFactor: 1,
    },
    application: {
      mainEntry: 'dist/main.js',
      rendererEntry: 'dist/index.html',
      nativeDatabase: 'better-sqlite3; real application worker, isolated temporary database',
      routeNavigation: 'click actual sidebar anchors and inspect active route',
      data: 'empty isolated userData; no user accounts, secrets, music, or public API responses',
      network: 'Node TCP and Chromium HTTP(S) denied; remote pages show real offline states',
      blockedNetworkRequests,
      seededPreferences: preferences,
      unverifiedNativeBoundaries: ['Windows/macOS window controls and taskbar', 'system URL scheme registration (suppressed)', 'system tray', 'audio output', 'desktop lyric window', 'downloaded media', 'real online music services'],
    },
    command: config.command,
    captures,
    observations,
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
setTimeout(() => fail(new Error('Evidence run exceeded 120 seconds')), 120000).unref()

app.on('browser-window-created', (_event, window) => {
  const ses = window.webContents.session
  const preload = path.join(__dirname, 'offline-preload.cjs')
  if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', filePath: preload })
  else ses.setPreloads([...ses.getPreloads(), preload])
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    blockedNetworkRequests++
    callback({ cancel: true })
  })
  if (mainWindow) return
  mainWindow = window
  window.webContents.on('render-process-gone', (_event, details) => fail(new Error(`Renderer stopped: ${details.reason}`)))
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) fail(new Error(`Renderer failed to load (${code}): ${description}; ${url}`))
  })
  capture().catch(fail)
})

async function capture() {
  await waitFor(() => execute('Boolean(document.querySelector("#container #view") && document.querySelector("#root").offsetHeight > 0)').catch(() => false), 'real Vue application mount')
  await waitFor(() => Promise.resolve(global.lx?.inited && global.lx?.worker?.dbService), 'application and native database initialization')
  const anchors = await execute('Array.from(document.querySelectorAll("#left a[href]"), a => a.getAttribute("href"))')
  for (const route of routes) {
    if (!anchors.some(href => href.split('?')[0] === '#' + route.path)) throw new Error(`Missing actual navigation entry: ${route.path}`)
  }
  mainWindow.setResizable(true)
  let navigationIndex = 0
  for (const size of config.sizes) {
    mainWindow.setContentSize(size.width, size.height)
    mainWindow.show()
    await waitFor(() => execute(`innerWidth === ${size.width} && innerHeight === ${size.height}`), `${size.width}x${size.height} content size`)
    if (!observations.length) {
      await delay(1000)
      const missingAudio = await execute('document.body.innerText.includes(window.i18n.t("media_device__empty_device_tip"))')
      if (missingAudio) {
        const image = await mainWindow.webContents.capturePage()
        const png = image.toPNG()
        const file = 'startup-audio-warning.png'
        fs.writeFileSync(path.join(config.output, file), png)
        const warningText = await execute('({ message: window.i18n.t("media_device__empty_device_tip"), confirmationButtonText: window.i18n.t("ok") })')
        observations.push({ kind: 'audio-device-unavailable', ...warningText, action: 'Captured the real startup warning, then clicked its normal confirmation button before page evidence', file, width: size.width, height: size.height, sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length })
        const dismissed = await execute('(() => { const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === window.i18n.t("ok")); if (!button) return false; button.click(); return true })()')
        if (!dismissed) throw new Error('Cannot acknowledge the real missing-audio-device warning')
        await waitFor(() => execute('!document.body.innerText.includes(window.i18n.t("media_device__empty_device_tip"))'), 'startup warning acknowledgement')
      }
    }
    for (const route of routes) {
      const clicked = await execute(`(() => { const link = Array.from(document.querySelectorAll('#left a[href]')).find(a => a.getAttribute('href').split('?')[0] === ${JSON.stringify('#' + route.path)}); if (!link) return false; link.click(); return true })()`)
      if (!clicked) throw new Error(`Cannot click navigation: ${route.path}`)
      mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: Math.floor(size.width / 2) + navigationIndex++, y: 15 })
      await waitFor(() => execute(`location.hash.split('?')[0] === ${JSON.stringify('#' + route.path)} && Boolean(document.querySelector('#view').children.length)`), `route ${route.path}`)
      await delay(900)
      await execute('document.fonts.ready.then(() => true)')
      await flushPaint()
      const snapshot = await execute('(() => { const root = document.querySelector(\'#root\'); const view = document.querySelector(\'#view\'); const style = getComputedStyle(root); return { hash: location.hash, title: document.title, lang: document.documentElement.lang, rootSize: { width: root.offsetWidth, height: root.offsetHeight }, viewSize: { width: view.offsetWidth, height: view.offsetHeight }, background: style.backgroundColor, color: style.color, themeId: window.lxData?.themeId ?? null, text: view.innerText.slice(0, 500) } })()')
      const image = await mainWindow.webContents.capturePage()
      const imageSize = image.getSize()
      if (imageSize.width !== size.width || imageSize.height !== size.height || image.isEmpty()) throw new Error(`Unexpected image size on ${route.path}`)
      const png = image.toPNG()
      const filename = `${route.name}-${size.width}x${size.height}.png`
      fs.writeFileSync(path.join(config.output, filename), png)
      captures.push({ file: filename, route: route.path, themeId: global.lx.theme.theme.id, width: size.width, height: size.height, capturedAt: new Date().toISOString(), sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length, snapshot })
      console.log(`Captured ${filename} (${png.length} bytes)`)
    }
  }
  if (errors.length) throw new Error(`Unexpected renderer runtime errors: ${JSON.stringify(errors)}`)
  completed = true
  writeManifest('passed')
  app.exit(0)
}

// This is the real production main bundle. All production modules, DB workers,
// application IPC handlers, router, components, and CSS run without substitution.
require(path.join(config.root, 'dist/main.js'))
