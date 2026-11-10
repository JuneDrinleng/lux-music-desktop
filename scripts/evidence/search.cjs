const createUiTools = require('./ui.cjs')

module.exports = async function searchEvidence(context) {
  const { execute, waitFor, mainWindow, screenshot, checks, key, navigate, config, readDefaultList } = context
  const { click, i18nControl } = createUiTools(context)
  const input = "document.querySelector('#toolbar input')"
  const page = '[data-search-page]'
  const results = []
  const state = () => execute(`(() => {
    const route = document.querySelector('#root').__vue_app__.config.globalProperties.$router.currentRoute.value;
    const root = document.querySelector('${page}');
    const suggestions = Array.from(document.querySelectorAll('#toolbar li'), el => ({ text: el.innerText, height: el.parentElement.parentElement.getBoundingClientRect().height }));
    return { query: { ...route.query }, text: root.innerText, rows: root.querySelectorAll('.list-item').length, input: document.querySelector('#toolbar input').value, focused: document.activeElement === document.querySelector('#toolbar input'), suggestions, fixture: window.__searchFixture };
  })()`)
  const proof = async(action, predicate) => {
    try { await waitFor(async() => predicate(await state()), `search ${action}`) } catch (error) {
      console.error('Search failure snapshot:', JSON.stringify(await state()))
      throw error
    }
    // Drain queued virtualizer callbacks/tasks before switching views. Screenshots
    // separately retain the original strictly advancing two-frame paint gate.
    await execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))))', 'search virtualizer callbacks settled')
    results.push({ action, state: await state() })
  }
  const fill = async(text) => {
    await click(input)
    await waitFor(() => execute(`document.activeElement === ${input}`), 'native search input focus')
    key('A', ['control'])
    await waitFor(() => execute(`(${input}).selectionStart === 0 && (${input}).selectionEnd === (${input}).value.length`), 'native select all')
    await mainWindow.webContents.insertText(text)
    await waitFor(() => execute(`(${input}).value === ${JSON.stringify(text)}`), 'native text insertion')
  }
  const submit = async(text) => {
    await fill(text)
    key('Enter')
  }
  const tab = (scope, label) => `Array.from(document.querySelectorAll('[data-search-${scope}] [role=tab]')).find(el => el.textContent.trim() === ${JSON.stringify(label)})`
  const typeTab = type => `Array.from(document.querySelectorAll('[data-search-types] [role=tab]')).find(el => el.textContent.trim() === window.i18n.t('search__type_${type}'))`
  const snap = name => screenshot(`search-${name}.png`, 'search', { fixture: 'in-memory raw HTTP; real SDK/router/store/SQLite; all song/playlist data labelled FIXTURE' })
  mainWindow.focus()
  await navigate('/search')
  await proof('hot-search', s => s.text.includes('fixture-collection'))
  await snap('discovery')
  await fill('fixture')
  await proof('suggestion-dropdown', s => s.focused && s.suggestions.some(item => item.text === 'fixture-collection' && item.height > 0))
  await snap('suggestions')
  key('Down')
  key('Enter')
  await proof('keyboard-suggestion-submit', s => s.query.text === 'fixture-collection' && s.rows > 0)
  const geometry = async() => execute(`(() => {
    const slots = Array.from(document.querySelectorAll('${page} .list-item'), row => {
      const r = row.getBoundingClientRect(); const slot = row.parentElement;
      return { index: Number(row.querySelector('.num').innerText) - 1, height: r.height, slotHeight: slot.getBoundingClientRect().height, top: parseFloat(slot.style.top) };
    });
    const font = window.lxData.appSetting['common.fontSize'];
    const expected = Math.ceil(font * 2.3);
    if (!slots.length || slots.some(row => row.height !== expected || row.slotHeight !== expected || row.top !== row.index * expected)) throw new Error('Virtual row height/position changed: ' + JSON.stringify({ font, expected, slots }));
    return { font, expected, slots };
  })()`)
  const initialGeometry = await geometry()
  await click("document.querySelector('[data-search-page] .list-item')", { button: 'left' })
  mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' })
  await click("document.querySelectorAll('[data-search-page] .list-item')[1]")
  await click("document.querySelectorAll('[data-search-page] .list-item')[2]")
  mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' })
  await proof('multi-select', () => execute("document.querySelectorAll('[data-search-page] .list-item.active').length === 2"))
  await snap('songs-multi-select')
  await click("document.querySelector('[data-search-page] .list-item')", { button: 'right' })
  await waitFor(() => execute("Boolean(document.querySelector('[role=toolbar][aria-hidden=false]'))"), 'original song context menu')
  const menu = await execute(`['list__play', 'list__download', 'list__add_to'].map(key => {
    const el = Array.from(document.querySelectorAll('[role=toolbar][aria-hidden=false] [role=tab]')).find(el => el.getAttribute('aria-label') === window.i18n.t(key));
    if (!el || !el.getBoundingClientRect().height) throw new Error('Original action missing: ' + key);
    return { key, label: el.innerText, disabled: el.hasAttribute('disabled') };
  })`)
  if (!menu[0].disabled || !menu[1].disabled || menu[2].disabled) throw new Error('Original unsupported-source action guards changed')
  results.push({ action: 'play-download-add-menu-preserved', menu, boundary: 'No user music API installed; original play/download guards remain disabled' })
  await snap('song-menu')
  await click("document.querySelector('[data-search-page] h1')")
  await waitFor(() => execute("!document.querySelector('[role=toolbar][aria-hidden=false]')"), 'song menu dismissed')
  const controls = await execute("Array.from(document.querySelectorAll('[data-search-page] .list-item button'), el => ({ label: el.getAttribute('aria-label'), disabled: el.disabled }))")
  if (!controls.length) throw new Error('Original song action controls disappeared')
  await click(i18nControl(`${page} .list-item button`, 'list__add_to'))
  await waitFor(() => execute("Boolean(document.querySelector('#view h2'))"), 'original add-to-list modal')
  await snap('add-to-list')
  await click("Array.from(document.querySelectorAll('#view button')).find(el => (el.getAttribute('aria-label') || '').startsWith(window.i18n.t('list_add__btn_title', { name: '' }).split('「')[0]))")
  await waitFor(async() => (await readDefaultList()).some(item => item.name === 'FIXTURE · 夜航 01'), 'real SQLite add from search')
  results.push({ action: 'add-to-list-through-ipc', persisted: await readDefaultList() })
  // Scroll the real DOM, then verify rendered virtual indices and slot positions.
  await execute("document.querySelector('[data-search-page] .scroll[tabindex]').scrollTo({ top: 420 })")
  await waitFor(() => execute("Number(document.querySelector('[data-search-page] .list-item .num')?.innerText) > 1"), 'virtual scrolling')
  const scrolledGeometry = await geometry()
  await snap('songs-scrolled')
  await click(i18nControl(`${page} button`, 'pagination__next'))
  await proof('music-pagination', s => s.query.page === '2' && s.text.includes('夜航 31'))
  await waitFor(() => execute("document.querySelector('[data-search-page] .scroll[tabindex]').scrollTop === 0"), 'original page-change scroll reset')
  const sourceLabels = await execute("Array.from(document.querySelectorAll('[data-search-sources] [role=tab]'), el => el.innerText)")
  for (const [index, label] of sourceLabels.entries()) {
    await click(tab('sources', label))
    await proof(`source-${label}`, s => s.query.source === ['kw', 'kg', 'tx', 'wy', 'mg', 'all'][index] && s.query.page === '1' && (index === 0 || index === 5 ? s.rows > 0 && !s.text.includes('列表加载中') : s.text.includes('加载失败')))
    const current = await state()
    if (current.query.page !== '1') throw new Error('Source switch did not reset page')
    results.push({ action: 'source-switch', label, source: current.query.source, page: current.query.page })
  }
  // Return to the real first source (KW) before exercising both result types.
  await click(tab('sources', sourceLabels[0]))
  await proof('source-restored', s => s.query.source === 'kw' && s.rows > 0)
  await click(typeTab('songlist'))
  await proof('songlist-switch', s => s.query.type === 'songlist' && s.text.includes('夜间选集 1'))
  await snap('playlists')
  await click(i18nControl(`${page} button`, 'pagination__next'))
  await proof('songlist-pagination', s => s.query.page === '2' && s.text.includes('夜间选集 19'))
  await click(typeTab('music'))
  await proof('music-switch-resets-page', s => s.query.type === 'music' && s.query.page === '1' && s.rows > 0)
  for (const type of ['music', 'songlist']) {
    if (type === 'songlist') {
      await click("document.querySelector('#toolbar input').nextElementSibling")
      await proof('clear-before-type-switch', s => s.query.text === '')
      await click(typeTab('songlist'))
      await proof('empty-type-switch', s => s.query.type === 'songlist' && s.query.text === '')
    }
    await submit('fixture-empty')
    await proof(`${type}-loading`, s => s.text.includes('列表加载中'))
    await proof(`${type}-empty`, s => s.query.text === 'fixture-empty' && s.text.includes('列表竟然是空的'))
    await snap(`${type}-empty`)
    await submit('fixture-retry')
    await proof(`${type}-failure`, s => s.query.text === 'fixture-retry' && s.text.includes('加载失败'))
    await snap(`${type}-failure`)
    // Retain the original recovery path: clear and resubmit the same keyword.
    await click("document.querySelector('#toolbar input').nextElementSibling")
    await proof(`${type}-clear-before-retry`, s => s.query.text === '')
    await submit('fixture-retry')
    await proof(`${type}-retry-original-submit`, s => s.text.includes(type === 'music' ? '夜航 01' : '夜间选集 1'))
  }
  // Clear through the original toolbar, then exercise history click/remove/clear.
  await click("document.querySelector('#toolbar input').nextElementSibling")
  await proof('history-retained', s => s.query.text === '' && s.text.includes('fixture-retry'))
  await snap('history')
  const historyButton = text => `Array.from(document.querySelectorAll('${page} dl:last-child dd button')).find(el => el.innerText === ${JSON.stringify(text)})`
  await click(historyButton('fixture-collection'))
  await proof('history-click', s => s.query.text === 'fixture-collection' && s.text.includes('夜间选集 1'))
  await click("document.querySelector('#toolbar input').nextElementSibling")
  await proof('clear-search', s => s.query.text === '' && s.text.includes('fixture-collection'))
  await click(historyButton('fixture-collection'), { button: 'right' })
  await proof('history-remove-contextmenu', () => execute("!Array.from(document.querySelectorAll('[data-search-page] dl:last-child dd')).some(el => el.innerText === 'fixture-collection')"))
  await click(i18nControl(`${page} button`, 'history_clear'))
  await proof('history-clear', () => execute("!document.querySelector('[data-search-page] button[aria-label=' + JSON.stringify(window.i18n.t('history_clear')) + ']')"))
  await click("document.querySelector('[data-search-page] dd button')")
  await proof('hot-search-click', s => s.query.text === 'fixture-collection' && s.text.includes('夜间选集 1'))
  await click(typeTab('music'))
  await proof('final-music', s => s.query.type === 'music' && s.rows > 0)
  for (const size of [{ width: 1024, height: 700 }, { width: 1440, height: 900 }]) {
    mainWindow.setContentSize(size.width, size.height)
    await waitFor(() => execute(`innerWidth === ${size.width} && innerHeight === ${size.height}`), 'search resized viewport')
    await geometry()
    await snap(`${size.width}x${size.height}`)
  }
  await navigate('/setting')
  await click("document.querySelector('label[for=setting_basic_font_size_19]')")
  await waitFor(() => execute("window.lxData.appSetting['common.fontSize'] === 19"), 'real font-size setting')
  await navigate('/search')
  await proof('font-scaling-search-retained', s => s.rows > 0)
  const scaledGeometry = await geometry()
  await snap('font19')
  for (const theme of ['oat_milk', 'ink_night']) {
    await navigate('/setting')
    if (await execute("Boolean(document.querySelector('[data-action=show-themes]'))")) await click("document.querySelector('[data-action=show-themes]')")
    await waitFor(() => execute("document.querySelectorAll('[data-theme-id]').length >= 21"), 'expanded production theme catalog')
    await click(`document.querySelector('[data-theme-id=${theme}]')`)
    await waitFor(() => execute(`document.querySelector('[data-theme-id=${theme}]').getAttribute('aria-pressed') === 'true'`), `real search theme ${theme}`)
    await navigate('/search')
    await proof(`theme-${theme}`, s => s.rows > 0)
    await geometry()
    await snap(theme)
  }
  const final = await state()
  if (final.fixture.expectedFailures !== 2 || final.fixture.requests.filter(r => r.fail).length !== 2) throw new Error('Injected failures were not both observed')
  checks.push({ kind: 'search-behaviors', results, initialGeometry, scrolledGeometry, scaledGeometry, controls, fixture: final.fixture, seededSearchSettings: { hotSearch: true, history: true, actionButtons: true }, requestedSizes: config.sizes })
}
