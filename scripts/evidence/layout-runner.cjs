const createUiTools = require('./ui.cjs')
const createNavigation = require('./navigation.cjs')
const createLayout = require('./layout.cjs')

// Dormant until M2a; callers activate the complete fixed wide/minimum plan.
module.exports = function createLayoutRunner(context) {
  const { mainWindow, execute, waitFor, navigate, readSetting, screenshot, flushPaint, checks, observations, stage } = context
  const { target, click, i18nControl } = createUiTools(context)
  const shots = []
  let frame
  const setting = async(inputId) => ({
    ...await execute(`(() => {
      const input = ${inputId ? `document.getElementById(${JSON.stringify(inputId)})` : 'null'};
      ${inputId ? "if (!input) throw new Error('Original font radio is missing');" : ''}
      return { renderer: window.lxData.appSetting['common.fontSize'], computed: getComputedStyle(document.documentElement).fontSize,
        rootComputed: getComputedStyle(document.getElementById('root')).fontSize, width: innerWidth, height: innerHeight,
        ${inputId ? 'checked: input.checked, disabled: input.disabled,' : ''} };
    })()`),
    main: global.lx.appSetting['common.fontSize'],
    disk: readSetting()['common.fontSize'],
  })
  const fontMatches = (state, value) => ['renderer', 'main', 'disk'].every(key => state[key] === value) && state.computed === `${value}px` && state.rootComputed === `${value}px`
  const font = async(value) => {
    const id = `setting_basic_font_size_${value}`
    await navigate('/setting')
    await click(i18nControl('#view [role=tab]', 'setting__basic'))
    await waitFor(() => execute(`Boolean(document.getElementById(${JSON.stringify(id)}))`), 'original Basic tab mounts font radio')
    const before = await setting(id)
    if (before.disabled) throw new Error(`Original font radio is disabled: ${id}`)
    const input = await click(`document.querySelector('label[for=${id}]')`)
    await waitFor(async() => { const current = await setting(id); return current.checked && fontMatches(current, value) }, `original font ${value}: radio/renderer/main/disk/computed agree`)
    const after = await setting(id)
    checks.push({ kind: 'shell-original-font', value, inputId: id, input, before, after })
    return after
  }
  const resize = async(width, height) => {
    mainWindow.setContentSize(width, height)
    await waitFor(async() => {
      const current = await setting(); const native = mainWindow.getContentSize()
      return current.width === width && current.height === height && native[0] === width && native[1] === height
    }, `real layout viewport ${width}x${height}`)
  }
  const identity = async() => {
    const brand = await target('document.querySelector(\'#left [aria-label="Lux Music"]\')')
    const title = await execute('document.title')
    if (!brand.text.includes('LUX') || !brand.text.includes('MUSIC') || title !== 'Lux Music') throw new Error('M2a visible Lux wordmark/document title consumer is absent')
    return { brand, title }
  }
  const capture = async(file, kind, detail) => {
    const kinds = { 'navigation-route': 'shell-route', 'layout-focus': 'shell-focus', 'navigation-download': 'shell-download-setting' }
    if (!frame || !kinds[kind]) throw new Error(`Unexpected M2a capture outside an explicit frame: ${kind}`)
    await execute('document.fonts.ready.then(() => true)')
    await flushPaint()
    const activePath = detail.navigation?.route || '/search'
    const labels = kind === 'navigation-download' ? null : await navigation.verifyReadableLabels(activePath)
    const geometry = await layout.verifyGeometry(file, frame)
    const brand = await identity()
    const output = file.replace(/^(navigation|layout)-/, 'shell-').replace(/px(?=\.png$)/, '')
    const result = await screenshot(output, kinds[kind], { ...detail, frame, geometry, labels, identity: brand })
    shots.push({ file: output, kind: kinds[kind], frame: { ...frame } })
    return result
  }
  const navigation = createNavigation({ ...context, screenshot: capture })
  const layout = createLayout({ ...context, screenshot: capture })
  const prepare = async(width, height, fontSize) => {
    frame = { width, height, fontSize }
    stage(`M2a real frame ${width}x${height}/font${fontSize}`)
    await font(fontSize)
    await resize(width, height)
    if (!fontMatches(await setting(), fontSize)) throw new Error('Actual layout font changed during viewport preparation')
  }
  const preserve = async(name, action, expectedKinds) => {
    if (mainWindow.isFullScreen()) throw new Error('M2a layout fixture requires an original nonfullscreen window')
    const original = await setting(); const originalSize = mainWindow.getContentSize(); const originalResizable = mainWindow.isResizable()
    if (!Number.isInteger(original.renderer) || original.renderer < 14 || original.renderer > 19 || !fontMatches(original, original.renderer)) throw new Error('Original font renderer/main/disk/computed fixture disagrees')
    const first = shots.length
    let failure
    try {
      mainWindow.setResizable(true) // Layout fixture only; native-drag retains its independent default-false gate.
      await action()
      const current = shots.slice(first)
      for (const [kind, count] of Object.entries(expectedKinds)) if (current.filter(shot => shot.kind === kind).length !== count) throw new Error(`M2a ${name} incomplete ${kind}/${count}`)
      if (current.length !== Object.values(expectedKinds).reduce((sum, count) => sum + count, 0)) throw new Error(`M2a ${name} has unexpected extra captures`)
    } catch (error) { failure = error } finally {
      for (const [step, restore] of [['font', () => font(original.renderer)], ['viewport', () => resize(...originalSize)], ['resizable', async() => {
        mainWindow.setResizable(originalResizable)
        await waitFor(() => Promise.resolve(mainWindow.isResizable() === originalResizable), 'original layout resizable state restored')
      }]]) {
        try { await restore() } catch (error) {
          observations.push({ kind: 'layout-cleanup-failure', name, step, message: String(error.stack || error) })
          failure ||= error
        }
      }
      frame = null
    }
    if (failure) throw failure
    await flushPaint()
    await waitFor(async() => {
      const current = await setting(); const native = mainWindow.getContentSize()
      return fontMatches(current, original.renderer) && current.width === originalSize[0] && current.height === originalSize[1] &&
        native[0] === originalSize[0] && native[1] === originalSize[1] && mainWindow.isResizable() === originalResizable
    }, 'final font/native/renderer viewport and resizable restoration agree')
    const restored = { ...await setting(), nativeSize: mainWindow.getContentSize(), resizable: mainWindow.isResizable() }
    const proof = { name, original, originalSize, originalResizable, restored, captures: shots.slice(first) }
    checks.push({ kind: 'shell-layout-consumer', ...proof })
    return proof
  }
  const wide = () => preserve('wide', async() => {
    for (const [width, height] of [[1024, 700], [1280, 800], [1440, 900]]) {
      await prepare(width, height, 16)
      await navigation.verifyBasicRoutes()
    }
  }, { 'shell-route': 18 })
  const minimum = () => preserve('minimum', async() => {
    for (const fontSize of [16, 19]) {
      await prepare(828, 540, fontSize)
      await navigation.verifyBasicRoutes()
    }
    await navigate('/search')
    await layout.verifyFocus('#left nav a[href="#/search"]', 'navigation-minimum-font19')
    await layout.verifyFocus('#toolbar input', 'search-minimum-font19')
  }, { 'shell-route': 12, 'shell-focus': 2 })
  const interactions = () => preserve('M2a-original-navigation', async() => {
    await prepare(1280, 800, 16)
    await navigation.verifyOriginalDetailBack()
    await navigation.verifyDownloadGate()
  }, { 'shell-download-setting': 2 })
  return { wide, minimum, interactions }
}
