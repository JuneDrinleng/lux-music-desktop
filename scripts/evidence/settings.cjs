// Exercise the original settings UI; never inject replacement controls or CSS.
const createUiTools = require('./ui.cjs')

const sections = [
  ['basic', 'basic'], ['play', 'play'], ['play_detail', 'play_detail'],
  ['desktop_lyric', 'desktop_lyric'], ['search', 'search'], ['list', 'list'],
  ['download', 'download'], ['hot_key', 'hot_key'], ['sync', 'sync'],
  ['open_api', 'sync'], ['network', 'network'], ['odc', 'odc'],
  ['backup', 'backup'], ['other', 'other'], ['update', 'update'], ['about', 'about'],
]

module.exports = async function settingsEvidence(context) {
  const { config, mainWindow, execute, waitFor, screenshot, navigate, checks, delay, readSetting } = context
  const { click, i18nControl } = createUiTools(context)
  const tab = name => i18nControl('#view [role=tab]', `setting__${name}`)
  const open = async(name, id) => {
    await click(tab(name))
    await waitFor(() => execute(`Boolean(document.querySelector('#view dl > dt#${id}')) && Array.from(document.querySelectorAll('#view [role=tab]')).some(el => el.getAttribute('aria-selected') === 'true' && el.getAttribute('aria-label') === window.i18n.t('setting__${name}'))`), `original settings category ${name}`)
    await delay(200)
  }
  const resize = async({ width, height }) => {
    mainWindow.setContentSize(width, height)
    await waitFor(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), `settings ${width}x${height}`)
  }
  const layout = async(scenario) => {
    const overflow = await execute('(() => { const panel = document.querySelector("#view dl").parentElement; return panel.scrollWidth > panel.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth })()')
    if (overflow) throw new Error(`Horizontal settings overflow: ${scenario}`)
    checks.push({ kind: 'settings-layout', scenario, horizontalOverflow: false })
  }
  await navigate('/setting')
  const actual = await execute('Array.from(document.querySelectorAll("#view [role=tab]"), el => el.getAttribute("aria-label"))')
  const expected = await execute(`(${JSON.stringify(sections)}).map(([name]) => window.i18n.t('setting__' + name))`)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Original 16 settings categories changed order or disappeared')
  checks.push({ kind: 'settings-categories', actual, expected })
  for (const [name, id] of sections) {
    await open(name, id)
    // Scroll each original control into view and check its visible centre. Only
    // labels/IDs and geometry are read, never input values or credentials.
    const inventory = await execute(`(() => {
      const dl = document.querySelector('#view dl'); const scroller = dl.parentElement;
      const controls = Array.from(dl.querySelectorAll('button, input:not([aria-hidden=true]), [role=checkbox], [role=radio], [role=button]'))
        .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      const clipped = [];
      for (const el of controls) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = el.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !hit || !(el === hit || el.contains(hit))) clipped.push(el.id || el.getAttribute('aria-label') || el.textContent.trim());
      }
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      return { heading: dl.querySelector('dt').id, controlCount: controls.length, clipped,
        subgroups: Array.from(dl.querySelectorAll(':scope > dd > h3'), el => el.id || el.textContent.trim()),
        horizontalOverflow: scroller.scrollWidth > scroller.clientWidth + 1 };
    })()`)
    if (inventory.clipped.length || inventory.horizontalOverflow) throw new Error(`Settings controls clipped: ${name} ${JSON.stringify(inventory)}`)
    checks.push({ kind: 'settings-controls-reachable', category: name, ...inventory })
    await screenshot(`settings-${name}.png`, 'settings-category', { category: name })
  }
  await open('basic', 'basic')
  for (const size of config.sizes.slice(1)) {
    await resize(size)
    await layout(`${size.width}x${size.height}`)
    await screenshot(`settings-basic-${size.width}x${size.height}.png`, 'settings-size')
  }
  await resize(config.sizes[0])
  await click('document.querySelector("[data-action=show-themes]")')
  await waitFor(() => execute('document.querySelectorAll("[data-theme-id]").length >= 21'), 'expanded original theme catalog')
  for (const id of ['oat_milk', 'ink_night']) {
    await click(`document.querySelector('[data-theme-id="${id}"]')`)
    await waitFor(async() => await execute(`window.lxData.appSetting['theme.id'] === '${id}'`) && readSetting()['theme.id'] === id, `settings theme ${id}`)
    await execute('document.querySelector("#view dl").parentElement.scrollTo({ top: 0, behavior: "instant" })')
    await screenshot(`settings-${id}.png`, 'settings-theme')
  }
  await click('document.querySelector("[data-theme-id=lime]")')
  await waitFor(() => execute("window.lxData.appSetting['theme.id'] === 'lime'"), 'restore lime')
  const originalFontSize = await execute("window.lxData.appSetting['common.fontSize']")
  // Original largest font-size radio; no DOM style overrides.
  await click('document.querySelector("label[for=setting_basic_font_size_19]")')
  await waitFor(() => execute("window.lxData.appSetting['common.fontSize'] === 19"), 'original font scaling')
  await delay(200) // Allow native scroll anchoring after the font reflow.
  await execute('document.querySelector("#view dl").parentElement.scrollTo({ top: 0, behavior: "instant" })')
  await layout('font-19')
  await screenshot('settings-font-19.png', 'settings-font')
  await click(`document.querySelector('label[for=setting_basic_font_size_${originalFontSize}]')`)
  await waitFor(() => execute(`window.lxData.appSetting['common.fontSize'] === ${originalFontSize}`), 'restore font size')
  await open('search', 'search')
  const setting = 'search.isShowHistorySearch'
  const before = await execute(`window.lxData.appSetting[${JSON.stringify(setting)}]`)
  for (const value of [!before, before]) {
    await click('document.querySelector("label[for=setting_search_showHistory_enable]")')
    await waitFor(async() => await execute(`window.lxData.appSetting[${JSON.stringify(setting)}] === ${value}`) && readSetting()[setting] === value, 'original checkbox and durable setting')
  }
  checks.push({ kind: 'settings-checkbox-persistence', setting, before, after: readSetting()[setting], restored: true })
}
