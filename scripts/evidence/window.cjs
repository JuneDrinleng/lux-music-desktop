const createUiTools = require('./ui.cjs')

// Original M1 controls work here; no future Lux shell or toolbar is required.
module.exports = async function runWindowEvidence(context) {
  const { mainWindow, execute, waitFor, screenshot, navigate, bounded, checks, observations, key, readSetting, flushPaint } = context
  const { click, i18nControl } = createUiTools({ execute, mainWindow })
  const initialSide = readSetting()['common.controlBtnPosition']
  const allControls = '#left button, #toolbar button'
  const selectSide = async(side) => {
    await navigate('/setting')
    await click(i18nControl('#view [role=tab]', 'setting__basic'))
    const id = `setting_basic_control_btn_position_${side}`
    await waitFor(() => execute(`Boolean(document.getElementById(${JSON.stringify(id)}))`), 'original Basic tab mounts window-side setting')
    if (!await execute(`document.getElementById(${JSON.stringify(id)}).checked`)) await click(`document.querySelector('label[for="${id}"]')`)
    await waitFor(async() => await execute(`window.lxData.appSetting['common.controlBtnPosition'] === ${JSON.stringify(side)}`) && global.lx.appSetting['common.controlBtnPosition'] === side && readSetting()['common.controlBtnPosition'] === side, `original persisted window-side setting ${side}`)
  }
  const controls = () => execute(`(() => {
    const labels = ['min', 'close'].map(key => window.i18n.t(key));
    return Array.from(document.querySelectorAll(${JSON.stringify(allControls)})).filter(el => labels.includes(el.getAttribute('aria-label'))).map(el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { label: el.getAttribute('aria-label'), side: el.closest('#left') ? 'left' : 'right', x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' };
    });
  })()`)
  let failure
  try {
    for (const side of ['left', 'right']) {
      await selectSide(side)
      await navigate('/search')
      const state = await controls()
      const [width, height] = mainWindow.getContentSize()
      if (state.length !== 2 || state.some(el => el.side !== side || !el.visible || el.x < 0 || el.y < 0 || el.right > width || el.bottom > height)) throw new Error(`Original window controls clipped or on wrong side: ${JSON.stringify(state)}`)
      await screenshot(`window-controls-${side}.png`, 'window-controls', { controls: state })
      let minimized = false
      const onMinimize = () => { minimized = true }
      mainWindow.once('minimize', onMinimize)
      try {
        await click(i18nControl(allControls, 'min'))
        await waitFor(() => Promise.resolve(minimized && mainWindow.isMinimized()), `original ${side} minimize IPC and BrowserWindow event`)
      } finally { mainWindow.removeListener('minimize', onMinimize) }
      mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      await waitFor(() => Promise.resolve(!mainWindow.isMinimized() && mainWindow.isVisible() && mainWindow.isFocused()), 'visible focused restore after actual minimize event')
      let closeRequested = false
      const protectCapture = event => { closeRequested = true; event.preventDefault() }
      mainWindow.once('close', protectCapture)
      try {
        await click(i18nControl(allControls, 'close'))
        await waitFor(() => Promise.resolve(closeRequested && !mainWindow.isDestroyed()), `original ${side} close IPC request`)
      } finally { mainWindow.removeListener('close', protectCapture) }
      checks.push({ kind: 'original-window-events', side, minimizeEvent: minimized, closeRequested, closeBoundary: 'original button IPC reached BrowserWindow close; evidence listener prevented destruction; this is request evidence, not application exit; production main_window_close handlers still run in the isolated tray/sync/lyric-disabled fixture' })
    }
    const beforeFullscreenBounds = mainWindow.getBounds()
    const beforeFont = await execute('getComputedStyle(document.documentElement).fontSize')
    await execute('document.activeElement?.blur()')
    key('F11')
    await waitFor(async() => mainWindow.isFullScreen() && await execute('document.documentElement.classList.contains("fullscreen")'), 'original F11 enters native fullscreen and renderer state')
    const fullscreen = { native: mainWindow.isFullScreen(), renderer: await execute('document.documentElement.classList.contains("fullscreen")'), controls: await controls(), regions: await execute("['#toolbar', '#left'].map(selector => ({ selector, appRegion: getComputedStyle(document.querySelector(selector)).getPropertyValue('-webkit-app-region') }))") }
    if (fullscreen.controls.length !== 2 || fullscreen.controls.some(el => el.visible) || fullscreen.regions.some(region => region.appRegion !== 'no-drag')) throw new Error(`Fullscreen original controls/drag state wrong: ${JSON.stringify(fullscreen)}`)
    await screenshot('window-fullscreen.png', 'window-fullscreen', { fullscreen })
    let fullscreenExited = false
    const onLeaveFullscreen = () => { fullscreenExited = true }
    mainWindow.once('leave-full-screen', onLeaveFullscreen)
    try {
      key('F11')
      await waitFor(async() => {
        const bounds = mainWindow.getBounds()
        return fullscreenExited && !mainWindow.isFullScreen() && mainWindow.isVisible() && mainWindow.isFocused() &&
          Object.keys(beforeFullscreenBounds).every(key => bounds[key] === beforeFullscreenBounds[key]) &&
          await execute(`!document.documentElement.classList.contains('fullscreen') && getComputedStyle(document.documentElement).fontSize === ${JSON.stringify(beforeFont)}`)
      }, 'original F11 leave event, focused original bounds and configured font')
    } finally { mainWindow.removeListener('leave-full-screen', onLeaveFullscreen) }
    const restoredControls = await controls()
    const restoredRegions = await execute("['#toolbar', '#left'].map(selector => ({ selector, appRegion: getComputedStyle(document.querySelector(selector)).getPropertyValue('-webkit-app-region') }))")
    if (restoredControls.length !== 2 || restoredControls.some(el => !el.visible) || restoredRegions.some(region => region.appRegion !== 'drag')) throw new Error('Original window controls/drag rules did not restore after F11')
    const restoredPaint = await flushPaint()
    checks.push({ kind: 'original-fullscreen-state', entered: fullscreen, exited: { restoredPaint, leaveFullscreenEvent: fullscreenExited, beforeBounds: beforeFullscreenBounds, restoredBounds: mainWindow.getBounds(), native: mainWindow.isFullScreen(), renderer: await execute('document.documentElement.classList.contains("fullscreen")'), controls: restoredControls, regions: restoredRegions, restoredFont: await execute('getComputedStyle(document.documentElement).fontSize'), expectedFont: beforeFont } })
    observations.push({ kind: 'window-platform-boundary', verified: 'original Linux controls, native minimize event, guarded close request and F11 state', unverified: ['native drag (separate M2t3b2 checkpoint; failed diagnostic retained)', 'Windows/macOS native window behavior', 'actual close-button process exit (request guarded only); driver still observes normal application quit at phase end'] })
  } catch (error) {
    failure = error
    observations.push({ kind: 'window-evidence-failure', message: String(error.stack || error), bounds: mainWindow.isDestroyed() ? null : mainWindow.getBounds() })
  } finally {
    try {
      if (mainWindow.isMinimized()) { mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
      if (mainWindow.isFullScreen()) {
        await execute('document.activeElement?.blur()')
        key('F11')
        await waitFor(async() => !mainWindow.isFullScreen() && await execute('!document.documentElement.classList.contains("fullscreen")'), 'original F11 cleanup exits fullscreen')
      }
      await selectSide(initialSide)
      await navigate('/search')
    } catch (error) {
      failure ||= error
      observations.push({ kind: 'window-cleanup-failure', message: String(error.stack || error) })
    }
  }
  if (failure) throw failure
}
