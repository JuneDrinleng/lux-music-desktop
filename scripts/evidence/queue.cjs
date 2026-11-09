// Exercise the production queue through native input; only inspect DOM/audio/DB.
const createUiTools = require('./ui.cjs')

module.exports = async function runQueueEvidence(context) {
  const { mainWindow, execute, waitFor, screenshot, navigate, checks, delay, key, imported, readMedia, readSetting, progressStyle } = context
  const { target, click, i18nControl } = createUiTools({ execute, mainWindow })
  const results = []
  const panel = 'document.querySelector("#play-queue")'
  const toggle = 'document.querySelector("[data-action=queue-toggle]")'
  const button = action => `document.querySelector('#play-queue [data-action=queue-${action}]')`
  const ids = () => execute('Array.from(document.querySelectorAll("#play-queue [data-queue-id]"), el => el.dataset.queueId)')
  const expectIds = async(expected) => waitFor(async() => JSON.stringify(await ids()) === JSON.stringify(expected), `queue order ${expected.map(id => id.split('/').at(-1))}`, 5000)
  const show = async() => {
    if (!await execute(`${toggle}.getAttribute('aria-expanded') === 'true'`)) await click(toggle)
    await waitFor(() => execute(`(() => { const el = ${panel}.closest('[aria-hidden]'); const s = getComputedStyle(el); return el.getAttribute('aria-hidden') === 'false' && Number(s.opacity) === 1 && (s.transform === 'none' || new DOMMatrixReadOnly(s.transform).isIdentity) })()`), 'queue visible after original popup transition')
  }
  const surface = async() => {
    const state = await execute(`(() => { const el = ${panel}; const r = el.getBoundingClientRect(); const outer = getComputedStyle(el.closest('[aria-hidden]')); return { x: r.x, y: r.y, width: r.width, height: r.height, inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, border: outer.borderTopWidth, radius: outer.borderRadius, filter: outer.filter, arrow: getComputedStyle(el.closest('[aria-hidden]'), '::before').display, fontSize: getComputedStyle(el).fontSize } })()`)
    if (!state.inside || state.border !== '2px' || state.radius !== '0px' || state.filter !== 'none' || state.arrow !== 'none') throw new Error(`Queue surface is clipped or not using magazine rules: ${JSON.stringify(state)}`)
    return state
  }
  const enqueue = async(track) => {
    await click(`Array.from(document.querySelectorAll('#my-list .list-item')).find(el => el.textContent.includes(${JSON.stringify(track.name)}))`, { button: 'right' })
    const option = i18nControl('#root ul[aria-hidden=false] > li', 'list__play_later')
    await waitFor(() => execute(`Boolean(${option})`), 'original play-later context menu')
    await click(option)
  }
  await navigate('/list')
  const [first, second] = imported
  await enqueue(first)
  await enqueue(second)
  await expectIds([first.id, second.id])
  results.push({ action: 'enqueue', ids: await ids(), boundary: 'original track context menu; no queue state injected' })
  await show()
  const from = await target(button('drag'))
  const to = await target('document.querySelectorAll("#play-queue [data-action=queue-drag]")[1]')
  const send = (type, x, y) => mainWindow.webContents.sendInputEvent({ type, x, y, ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }) })
  send('mouseMove', from.x, from.y)
  send('mouseDown', from.x, from.y)
  for (let step = 1; step <= 12; step++) {
    send('mouseMove', from.x, Math.round(from.y + (to.y - from.y + 8) * step / 12))
    await delay(35)
  }
  send('mouseUp', to.x, to.y + 8)
  await expectIds([second.id, first.id])
  results.push({ action: 'drag', from, to, ids: await ids(), input: 'webContents.sendInputEvent mouse down/move/up' })
  await click(button('drag'))
  key('Down')
  await expectIds([first.id, second.id])
  results.push({ action: 'keyboard-reorder', ids: await ids() })
  for (const [theme, width, height] of [['lime', 1280, 800], ['lime', 1024, 700], ['lime', 1440, 900], ['lime', 828, 540], ['oat_milk', 1280, 800], ['ink_night', 1280, 800]]) {
    if (readSetting()['theme.id'] !== theme) {
      await navigate('/setting')
      await click(i18nControl('#view [role=tab]', 'setting__basic'))
      const more = 'document.querySelector("[data-action=show-themes]")'
      if (await execute(`Boolean(${more})`)) await click(more)
      await waitFor(() => execute('document.querySelectorAll("[data-theme-id]").length >= 21'), 'full original theme selector')
      await click(`document.querySelector('[data-theme-id="${theme}"]')`)
      await waitFor(() => execute(`window.lxData.appSetting['theme.id'] === '${theme}'`), 'actual selected queue theme')
      await navigate('/list')
    }
    mainWindow.setContentSize(width, height)
    await waitFor(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), 'queue viewport')
    await show()
    const geometry = await surface()
    await screenshot(`queue-${theme}-${width}x${height}.png`, 'queue', { theme, geometry, ids: await ids() })
    key('Escape')
    await waitFor(() => execute(`document.activeElement === ${toggle} && ${toggle}.getAttribute('aria-expanded') === 'false'`), 'Escape closes queue and restores trigger focus')
  }
  // Use the original font radio, including renderer/main/disk agreement.
  await navigate('/setting')
  await click(i18nControl('#view [role=tab]', 'setting__basic'))
  await click('document.querySelector("label[for=setting_basic_font_size_19]")')
  await waitFor(async() => await execute("getComputedStyle(document.documentElement).fontSize === '19px' && window.lxData.appSetting['common.fontSize'] === 19") && readSetting()['common.fontSize'] === 19 && global.lx.appSetting['common.fontSize'] === 19, 'real font setting 19px')
  await navigate('/list')
  mainWindow.setContentSize(828, 540)
  await waitFor(() => execute('innerWidth === 828 && innerHeight === 540'), 'minimum queue viewport')
  await show()
  for (const action of ['drag', 'play', 'remove', 'clear']) await target(button(action))
  await screenshot('queue-font-19-828x540.png', 'queue', { fontSize: 19, geometry: await surface(), ids: await ids() })
  key('Escape')
  await navigate('/setting')
  await click(i18nControl('#view [role=tab]', 'setting__basic'))
  await click('document.querySelector("label[for=setting_basic_font_size_16]")')
  await waitFor(async() => await execute("getComputedStyle(document.documentElement).fontSize === '16px'") && readSetting()['common.fontSize'] === 16 && global.lx.appSetting['common.fontSize'] === 16, 'restore original font size')
  mainWindow.setContentSize(1280, 800)
  await navigate('/list')
  results.push({ action: 'escape-focus', verified: true })
  const variants = []
  for (const style of ['mini', 'full', 'middle']) {
    await progressStyle(style)
    await navigate('/list')
    await show()
    await expectIds([first.id, second.id])
    for (const action of ['drag', 'play', 'remove', 'clear']) await target(button(action))
    variants.push({ style, geometry: await surface() })
    key('Escape')
  }
  results.push({ action: 'player-variants', variants })
  await show()
  await click('document.querySelectorAll("#play-queue [data-action=queue-play]")[1]')
  await expectIds([first.id])
  await waitFor(async() => { const state = await readMedia(); return state.musicInfo.id === second.id && state.audio && !state.audio.paused && state.audio.currentTime > 0.2 }, 'queue selection plays native local audio')
  const before = await readMedia()
  await waitFor(async() => (await readMedia()).audio.currentTime > before.audio.currentTime + 0.2, 'queue playback clock advances')
  results.push({ action: 'play', ids: await ids(), player: await readMedia() })
  key('Escape')
  await click(i18nControl('#player [aria-label]', 'player__next'))
  await expectIds([])
  await waitFor(async() => (await readMedia()).musicInfo.id === first.id, 'original Next consumes remaining queue item')
  results.push({ action: 'next-consumes-queue', player: await readMedia() })
  await enqueue(first)
  await enqueue(second)
  await show()
  await click(button('remove'))
  await expectIds([second.id])
  if ((await readMedia()).musicInfo.id !== first.id) throw new Error('Queue removal changed current playback')
  results.push({ action: 'remove', ids: await ids() })
  await click(button('clear'))
  await expectIds([])
  if ((await readMedia()).musicInfo.id !== first.id || !await execute(`${button('clear')}.disabled`)) throw new Error('Clear changed playback or did not disable empty clear action')
  results.push({ action: 'clear', ids: await ids(), currentId: (await readMedia()).musicInfo.id })
  await screenshot('queue-empty-1280x800.png', 'queue', { ids: [], currentId: first.id })
  const list = await global.lx.worker.dbService.getListMusics('default')
  if (list.length !== imported.length || !imported.every(item => list.some(stored => stored.id === item.id))) throw new Error('Queue operations modified the source playlist')
  key('Escape')
  checks.push({ kind: 'real-queue', results, sourceListUnchanged: true, unverified: ['audible speaker output', 'Windows/macOS input', 'production online sources'] })
}
