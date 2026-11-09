const createUiTools = require('./ui.cjs')
const createLayout = require('./layout.cjs')

const routes = [
  { name: 'search', path: '/search', labelKey: 'search' },
  { name: 'songlists', path: '/songList/list', labelKey: 'song_list' },
  { name: 'leaderboard', path: '/leaderboard', labelKey: 'leaderboard' },
  { name: 'library', path: '/list', labelKey: 'my_list' },
  { name: 'downloads', path: '/download', labelKey: 'download' },
  { name: 'settings', path: '/setting', labelKey: 'setting' },
]
const detailQuery = { source: 'kw', id: 'digest-8__9001', page: '3', fromName: 'SongList' }

// Exported tools only. Consumers must explicitly enable supported UI checks.
module.exports = function createNavigationEvidence(context) {
  const { execute, waitFor, navigate, screenshot, checks, observations, readSetting, stage } = context
  const { click, i18nControl } = createUiTools(context)
  const { rendererToolsSource } = createLayout(context)
  const state = () => execute(`(() => {
    const router = document.querySelector('#root').__vue_app__?.config.globalProperties.$router;
    if (!router) throw new Error('Mounted production router unavailable');
    const route = router.currentRoute.value;
    const entries = Array.from(document.querySelectorAll('#left a[href]'), el => ({ href: el.getAttribute('href').split('?')[0], label: el.getAttribute('aria-label'), text: el.innerText.trim(), current: el.getAttribute('aria-current'), selected: el.getAttribute('aria-selected') }));
    return { path: route.path, query: route.query, fullPath: route.fullPath, hash: location.hash, routeName: route.meta.name, origin: window.lx.songListInfo.fromName, entries, hasSemanticNavigation: Boolean(document.querySelector('#left nav')), viewMounted: Boolean(document.querySelector('#view')?.children.length), width: innerWidth, height: innerHeight, font: getComputedStyle(document.documentElement).fontSize, history: window.history.state };
  })()`)
  const waitPath = path => waitFor(async() => { const current = await state(); return current.path === path && current.viewMounted }, `production Router route ${path}`)
  const originalRoute = path => `Array.from(document.querySelectorAll('#left a[href]')).find(el => el.getAttribute('href').split('?')[0] === ${JSON.stringify('#' + path)})`
  const detailMatches = current => current.path === '/songList/detail' && Object.keys(current.query).length === Object.keys(detailQuery).length && Object.entries(detailQuery).every(([key, value]) => current.query[key] === value) && current.origin === detailQuery.fromName
  const waitDetail = () => waitFor(async() => detailMatches(await state()), 'complete detail query and original fromName state')
  const fixtureDetail = async() => {
    stage('navigation: seed labelled offline detail through mounted production router.push')
    await execute(`(() => { const router = document.querySelector('#root').__vue_app__?.config.globalProperties.$router; if (!router) throw new Error('Mounted production router unavailable'); return router.push({ path: '/songList/detail', query: ${JSON.stringify(detailQuery)} }).then(() => true) })()`)
    await waitDetail()
  }
  const detailBack = async() => {
    await click("Array.from(document.querySelectorAll('#view button')).find(el => el.textContent.trim() === window.i18n.t('back'))")
    await waitPath('/songList/list')
    const restored = await state()
    checks.push({ kind: 'original-detail-back', origin: 'SongList', restored })
    return restored
  }
  const verifyBasicRoutes = async() => {
    if (readSetting()['download.enable'] !== true) throw new Error('Six-route fixture requires download enabled before navigation')
    const results = []
    for (const route of routes) {
      stage(`navigation: native click original sidebar ${route.path}`)
      const input = await click(originalRoute(route.path))
      await waitPath(route.path)
      const current = await state()
      const selected = current.entries.filter(entry => entry.current === 'page' || entry.selected === 'true')
      if (current.entries.length !== routes.length || selected.length !== 1 || selected[0].href !== '#' + route.path || !selected[0].label) throw new Error(`Original route selection is incomplete: ${JSON.stringify(current)}`)
      const result = { kind: 'original-native-navigation', route: route.path, input, state: current }
      checks.push(result)
      results.push(result)
      await screenshot(`navigation-${route.name}-${current.width}x${current.height}-font${current.font}.png`, 'navigation-route', { navigation: result })
    }
    return results
  }
  const verifyReadableLabels = async(activePath) => {
    const current = await state()
    if (!current.hasSemanticNavigation || current.entries.length !== routes.length) throw new Error('Readable navigation consumer is absent or incomplete; enable this check only after M2a')
    const expected = await execute(`Object.fromEntries(${JSON.stringify(routes)}.map(route => [route.path, window.i18n.t(route.labelKey)]))`)
    const labels = await execute(`Array.from(document.querySelectorAll('#left a[href]'), anchor => {
      const tools = ${rendererToolsSource};
      const label = Array.from(anchor.children).find(el => el.tagName === 'SPAN');
      if (!label) throw new Error('Future readable navigation label span is missing');
      const box = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      const rect = label.getBoundingClientRect();
      const clipping = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const style = getComputedStyle(label);
      const visibility = tools.visibility(label); const visible = rect.width > 0 && rect.height > 0 && visibility.visible;
      const clips = tools.clipping(label).ancestors; const self = tools.frame(label);
      if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX) || /^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
        if (self.transform !== 'none' || !['0px', 'padding-box', 'padding-box 0px'].includes(style.overflowClipMargin)) throw new Error('Transformed/expanded label clip needs a dedicated consumer');
      }
      clips.unshift({ tag: label.tagName, id: label.id, overflowX: style.overflowX, overflowY: style.overflowY, clip: self.paddingBox });
      for (const parent of clips) {
        if (/^(hidden|clip|auto|scroll)$/.test(parent.overflowX)) {
          clipping.left = Math.max(clipping.left, parent.clip.x); clipping.right = Math.min(clipping.right, parent.clip.right);
        }
        if (/^(hidden|clip|auto|scroll)$/.test(parent.overflowY)) {
          clipping.top = Math.max(clipping.top, parent.clip.y); clipping.bottom = Math.min(clipping.bottom, parent.clip.bottom);
        }
      }
      const range = document.createRange();
      range.selectNodeContents(label);
      const textRects = Array.from(range.getClientRects(), box).filter(rect => rect.width > 0 && rect.height > 0);
      const clipped = !textRects.length || textRects.some(rect => rect.left < clipping.left - 0.01 || rect.top < clipping.top - 0.01 || rect.right > clipping.right + 0.01 || rect.bottom > clipping.bottom + 0.01);
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { href: anchor.getAttribute('href').split('?')[0], text: label.innerText.trim(), rect: box(rect), textRects, clipping, clipAncestors: clips, visibility, visible, clipped, occluded: !hit || !anchor.contains(hit), style: { display: style.display, visibility: style.visibility, opacity: style.opacity } };
    })`)
    for (const route of routes) {
      const entry = current.entries.find(entry => entry.href === '#' + route.path)
      if (!entry || !entry.text || entry.text !== expected[route.path] || entry.label !== expected[route.path]) throw new Error(`Visible navigation label is missing or mismatched: ${route.path}`)
      const label = labels.find(label => label.href === '#' + route.path)
      if (!label || label.text !== expected[route.path] || !label.visible || label.clipped || label.occluded) throw new Error(`Navigation label is hidden, clipped or covered: ${route.path}; ${JSON.stringify(label)}`)
    }
    const active = current.entries.filter(entry => entry.current === 'page')
    if (active.length !== 1 || active[0].href !== '#' + activePath) throw new Error(`Current navigation aria disagrees with ${activePath}: ${JSON.stringify(active)}`)
    checks.push({ kind: 'readable-navigation-labels', activePath, expected, labels, state: current })
    return current
  }
  const verifyOriginalDetailBack = async() => {
    await navigate('/songList/list')
    await fixtureDetail()
    const fixture = await state()
    const restored = await detailBack()
    checks.push({ kind: 'original-detail-fixture', boundary: 'labelled offline detail through mounted production router.push; original detail back receives native input; online detail requests remain blocked', query: detailQuery, fixture, restored })
    return restored
  }
  const verifyHistory = async() => {
    const available = await execute("['history-back', 'history-forward'].every(action => document.querySelector('[data-action=' + action + ']'))")
    if (!available) throw new Error('Original history controls are absent; enable this check only after M2b')
    await navigate('/list')
    await fixtureDetail()
    await navigate('/setting')
    stage('navigation: original toolbar back restores complete detail query')
    await click("document.querySelector('[data-action=history-back]')")
    await waitDetail()
    const back = await state()
    checks.push({ kind: 'original-history-query', action: 'back', expected: detailQuery, state: back })
    await screenshot('navigation-history-back-detail.png', 'navigation-history', { state: back })
    await click("document.querySelector('[data-action=history-back]')")
    await waitPath('/list')
    await click("document.querySelector('[data-action=history-forward]')")
    await waitDetail()
    const forward = await state()
    checks.push({ kind: 'original-history-query', action: 'forward', expected: detailQuery, state: forward })
    await screenshot('navigation-history-forward-detail.png', 'navigation-history', { state: forward })
    await detailBack()
    checks.push({ kind: 'history-fixture-boundary', query: detailQuery, boundary: 'only initial detail fixture uses mounted production router.push; subsequent back/forward/detail-return all use original controls and native input; no direct hash/history state writes' })
    return { back, forward }
  }
  const downloadState = async() => ({
    ...await execute("({ renderer: window.lxData.appSetting['download.enable'], checkbox: document.getElementById('setting_download_enable')?.checked ?? null })"),
    main: global.lx.appSetting['download.enable'],
    disk: readSetting()['download.enable'],
  })
  const downloadMatches = (setting, value) => ['renderer', 'main', 'disk', 'checkbox'].every(key => setting[key] === value)
  const verifyDownloadGate = async() => {
    if (readSetting()['download.enable'] !== true) throw new Error('Download-toggle fixture requires initial enabled state')
    let failure
    try {
      for (const value of [false, true]) {
        await navigate('/setting')
        await click(i18nControl('#view [role=tab]', 'setting__download'))
        await waitFor(() => execute('Boolean(document.getElementById("setting_download_enable"))'), 'original Download settings tab mounts checkbox')
        const before = await execute('document.getElementById("setting_download_enable").checked')
        if (before === value) throw new Error('Original download setting was not in the expected opposite state before native toggle')
        await click('document.querySelector("label[for=setting_download_enable]")')
        await waitFor(async() => downloadMatches(await downloadState(), value), `original download toggle persists and checkbox agrees ${value}`)
        const current = await state()
        const hasDownload = current.entries.some(entry => entry.href === '#/download')
        if (current.entries.length !== (value ? 6 : 5) || hasDownload !== value || routes.filter(route => route.path !== '/download').some(route => !current.entries.some(entry => entry.href === '#' + route.path))) throw new Error(`Download toggle changed wrong original entries: ${JSON.stringify(current.entries)}`)
        checks.push({ kind: 'original-download-gating', value, setting: await downloadState(), state: current })
        await screenshot(`navigation-download-${value ? 'enabled' : 'disabled'}.png`, 'navigation-download', { value, state: current })
      }
    } catch (error) {
      failure = error
    } finally {
      try {
        await navigate('/setting')
        await click(i18nControl('#view [role=tab]', 'setting__download'))
        await waitFor(() => execute('Boolean(document.getElementById("setting_download_enable"))'), 'cleanup original Download checkbox')
        if (!await execute('document.getElementById("setting_download_enable").checked')) await click('document.querySelector("label[for=setting_download_enable]")')
        await waitFor(async() => downloadMatches(await downloadState(), true), 'restore renderer, main, disk and original download checkbox together')
      } catch (error) {
        observations.push({ kind: 'navigation-cleanup-failure', message: String(error.stack || error) })
        failure ||= error
      }
    }
    if (failure) throw failure
  }
  return { verifyBasicRoutes, verifyReadableLabels, verifyOriginalDetailBack, verifyHistory, verifyDownloadGate }
}
