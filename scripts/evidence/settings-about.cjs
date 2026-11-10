// M3d5b: production About entry, original links (geometry only), signed Pact.
const createUiTools = require('./ui.cjs')
const { AsyncLocalStorage } = require('node:async_hooks')

const scenes = [
  ['lime', 1024, 700, 16], ['lime', 1280, 800, 16], ['lime', 1440, 900, 16],
  ['oat_milk', 1280, 800, 16], ['ink_night', 1280, 800, 16], ['lime', 828, 540, 19],
]
const about = 'document.querySelector("#view dt#about + dd")'
const pact = 'Array.from(document.querySelectorAll("#root main")).find(el => el.querySelector("h2")?.textContent === "许可协议")'
const pactButton = `${about}?.querySelector('button')`
const closeButton = `${pact}?.parentElement.querySelector('header button')`

module.exports = async function settingsAboutEvidence(context) {
  const { mainWindow, checks, observations, key, readSetting } = context
  let deadline = Date.now() + 40000
  let cleanup = false
  const operations = new AsyncLocalStorage()
  const step = async(work, description) => {
    const parent = operations.getStore()
    const end = Math.min(deadline, parent?.end ?? Infinity, cleanup ? Date.now() + 2000 : Infinity)
    const token = { end, cancelled: false, parent }
    const assertActive = () => {
      for (let t = token; t; t = t.parent) if (t.cancelled || Date.now() >= t.end) throw new Error(`About ${cleanup ? 'cleanup' : 'checks'} deadline: ${description}`)
    }
    assertActive()
    let timer
    try {
      const value = await Promise.race([
        operations.run(token, async() => { assertActive(); return work() }),
        new Promise((resolve, reject) => { timer = setTimeout(() => { token.cancelled = true; reject(new Error(`About deadline: ${description}`)) }, end - Date.now()) }),
      ])
      assertActive()
      return value
    } finally { clearTimeout(timer) }
  }
  const execute = async(code) => {
    const result = await step(() => context.execute(`(async() => { try { return { value: await eval(${JSON.stringify(code)}) } } catch (error) { return { error: String(error.stack || error) } } })()`), 'renderer')
    if (result.error) throw new Error(result.error)
    return result.value
  }
  const paint = () => step(() => context.flushPaint(), 'real paint')
  const wait = (predicate, description) => step(async() => {
    const end = Math.min(deadline, Date.now() + 3000)
    while (Date.now() < end) {
      if (await predicate()) return
      await step(() => new Promise(resolve => setTimeout(resolve, 40)), 'poll')
    }
    throw new Error(`About state did not settle: ${description}`)
  }, description)
  const { click: rawClick, target, i18nControl } = createUiTools({ execute, mainWindow })
  const click = expression => step(() => rawClick(expression), 'native click')
  const tab = name => i18nControl('#view [role=tab]', `setting__${name}`)
  const selectTab = async(name) => {
    await click(tab(name))
    await wait(() => execute(`Boolean(document.querySelector('#view dt#${name}')) && (${tab(name)})?.getAttribute('aria-selected') === 'true'`), `category ${name}`)
    await paint()
  }
  const durable = async(name, value) => {
    await wait(async() => await execute(`window.lxData.appSetting[${JSON.stringify(name)}] === ${JSON.stringify(value)}`) && global.lx.appSetting[name] === value && readSetting()[name] === value, `renderer/main/disk ${name}`)
    return { renderer: await execute(`window.lxData.appSetting[${JSON.stringify(name)}]`), main: global.lx.appSetting[name], disk: readSetting()[name] }
  }
  const setTheme = async(id) => {
    await selectTab('basic')
    if (await execute('Boolean(document.querySelector("[data-action=show-themes]"))')) await click('document.querySelector("[data-action=show-themes]")')
    await click(`document.querySelector('[data-theme-id="${id}"]')`)
    const state = await durable('theme.id', id)
    await wait(() => execute(`document.querySelector('[data-theme-id="${id}"]')?.getAttribute('aria-pressed') === 'true'`), 'selected original theme control')
    return state
  }
  const setFont = async(size) => {
    await selectTab('basic')
    await click(`document.querySelector('label[for="setting_basic_font_size_${size}"]')`)
    const state = await durable('common.fontSize', size)
    await wait(() => execute(`document.getElementById('setting_basic_font_size_${size}').checked && getComputedStyle(document.documentElement).fontSize === '${size}px'`), 'original font radio and computed root size')
    return state
  }
  // All rectangles, including text lines and focus rings, must fit the actual
  // clipping ancestors. No viewport/CSS/state replacement is used.
  const geometry = (expression, focus = false) => execute(`(() => {
    const el = (${expression}); if (!el) throw new Error('About DOM missing');
    const style = getComputedStyle(el); const r = el.getBoundingClientRect();
    let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p); const b = p.getBoundingClientRect();
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) < 1) throw new Error('About hidden ancestor');
      const border = ['Left','Top','Right','Bottom'].map(side => parseFloat(s['border' + side + 'Width']));
      const scrollX = Math.max(0, p.offsetWidth - p.clientWidth - border[0] - border[2]);
      const scrollY = Math.max(0, p.offsetHeight - p.clientHeight - border[1] - border[3]);
      // Preserve fractional padding-box edges; clientWidth/Height round to integers.
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clip.left = Math.max(clip.left, b.left + border[0]); clip.right = Math.min(clip.right, b.right - border[2] - scrollX); }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { clip.top = Math.max(clip.top, b.top + border[1]); clip.bottom = Math.min(clip.bottom, b.bottom - border[3] - scrollY); }
    }
    const fits = b => b.left >= clip.left - .01 && b.top >= clip.top - .01 && b.right <= clip.right + .01 && b.bottom <= clip.bottom + .01;
    const range = document.createRange(); range.selectNodeContents(el);
    const lines = Array.from(range.getClientRects()).filter(b => b.width && b.height);
    if (!lines.length && el.querySelector('svg')) lines.push(el.querySelector('svg').getBoundingClientRect());
    const ring = ${focus} ? parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset) : 0;
    const bounds = { left: r.left - ring, top: r.top - ring, right: r.right + ring, bottom: r.bottom + ring };
    if (!r.width || !r.height || style.visibility !== 'visible' || !lines.length || lines.some(b => !fits(b)) || !fits(bounds)) throw new Error('About clipped text/control/focus: ' + JSON.stringify({ text: el.textContent, bounds, clip, lines: lines.map(b => ({left: b.left, top: b.top, right: b.right, bottom: b.bottom})) }));
    if (${focus} && (el !== document.activeElement || !el.matches(':focus-visible') || style.outlineStyle === 'none' || parseFloat(style.outlineWidth) <= 0)) throw new Error('Actual Tab outline missing');
    return { text: el.textContent.trim(), rect: { x: r.x, y: r.y, width: r.width, height: r.height }, lines: lines.length, clip, focusVisible: el.matches(':focus-visible'), outline: { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor } };
  })()`)
  const captured = []
  const shot = async(id, part, detail = {}) => {
    const file = `about-${id}-${part}.png`
    const record = await step(() => context.screenshot(file, 'settings-about', { scenario: id, part, ...detail }), `capture ${file}`)
    if (record?.file !== file || record.kind !== 'settings-about' || !record.sha256) throw new Error('About screenshot record missing')
    captured.push(file)
  }
  let initial
  let failure
  const cleanupFailures = []
  const restored = []
  const restoredState = {}
  try {
    initial = {
      bounds: mainWindow.getBounds(),
      resizable: mainWindow.isResizable(),
      fullscreen: mainWindow.isFullScreen(),
      theme: readSetting()['theme.id'],
      font: readSetting()['common.fontSize'],
      location: await execute('location.hash'),
      category: await execute('location.hash.startsWith("#/setting") ? document.querySelector("#view [role=tab][aria-selected=true]")?.getAttribute("aria-label") || null : null'),
    }
    await durable('common.isAgreePact', true)
    if (await execute(`Boolean(${pact})`)) throw new Error('About fixture unexpectedly shows Pact before entry')
    if (initial.fullscreen) throw new Error('Window checks must return from fullscreen before About')
    mainWindow.setResizable(true)
    await step(() => context.navigate('/setting'), 'original settings sidebar entry')
    for (const [theme, width, height, font] of scenes) {
      const id = `${theme}-${width}x${height}-${font}px`
      // Native window size is a harness viewport; theme and font use only UI.
      mainWindow.setContentSize(width, height)
      await wait(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), `viewport ${id}`)
      const themeState = await setTheme(theme)
      const fontState = await setFont(font)
      await selectTab('about')
      await execute(`${about}.parentElement.parentElement.scrollTo({top: 0, behavior: 'instant'})`)
      await paint()
      const inventory = await execute(`(() => {
        const dd = (${about}); const panel = dd.parentElement.parentElement; const s = getComputedStyle(dd);
        const paragraphs = Array.from(dd.querySelectorAll('.p'), el => el.textContent.trim());
        const links = Array.from(dd.querySelectorAll('.hover.underline'), el => el.textContent.trim());
        if (paragraphs.length !== 10 || links.length !== 5 || !paragraphs.at(-1).includes('落雪无痕') || dd.querySelector('button')?.textContent.trim() !== '许可协议') throw new Error('Original About inventory changed');
        if (panel.scrollWidth > panel.clientWidth || document.documentElement.scrollWidth > innerWidth) throw new Error('About horizontal overflow');
        if (s.fontFamily !== getComputedStyle(dd.parentElement).fontFamily) throw new Error('About must inherit user font');
        return { paragraphs, links, fontFamily: s.fontFamily, background: s.backgroundColor, color: s.color, tokens: Object.fromEntries(['paper','ink','muted','rule','hairline'].map(k => [k, s.getPropertyValue('--lux-' + k).trim()])), viewport: { width: innerWidth, height: innerHeight }, panel: { width: panel.clientWidth, height: panel.clientHeight, scrollHeight: panel.scrollHeight }, horizontalOverflow: false };
      })()`)
      await shot(id, 'top', { inventory, themeState, fontState })
      const reachability = []
      for (let i = 0; i < 10; i++) {
        const expression = `${about}.querySelectorAll('.p')[${i}]`
        await execute(`(${expression}).scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'})`)
        await paint()
        reachability.push(await geometry(expression))
      }
      const links = []
      for (let i = 0; i < 5; i++) {
        const expression = `${about}.querySelectorAll('.hover.underline')[${i}]`
        await execute(`(${expression}).scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'})`)
        await paint()
        const center = await step(() => target(expression), 'original link center (never clicked)')
        links.push({ center, geometry: await geometry(expression) })
      }
      await execute(`${about}.querySelector('.p:last-child').scrollIntoView({block: 'end', behavior: 'instant'})`)
      await shot(id, 'bottom')
      // Seed position, then require actual native Shift+Tab/Tab to return.
      await execute(`(${pactButton}).scrollIntoView({block: 'center', behavior: 'instant'}); (${pactButton}).focus()`)
      key('Tab', ['shift'])
      await paint()
      key('Tab')
      await wait(() => execute(`document.activeElement === (${pactButton}) && document.activeElement.matches(':focus-visible')`), 'actual Tab to original Pact button')
      const focus = await geometry(pactButton, true)
      await shot(id, 'focus', { focus })
      await click(pactButton)
      await wait(() => execute(`Boolean(${pact})`), 'original PactModal opens')
      await paint()
      const agreement = await execute(`(() => { const main = (${pact}); const text = main.innerText; if (!text.includes('LX Music（洛雪音乐助手）桌面版项目') || !text.includes('九、接受协议') || main.querySelectorAll('button').length) throw new Error('Original signed Pact body/path missing'); return { paragraphs: main.querySelectorAll('p').length, signed: window.lxData.appSetting['common.isAgreePact'], title: main.querySelector('h2').textContent }; })()`)
      const close = await geometry(closeButton)
      await shot(id, 'pact', { agreement, close })
      await click(closeButton)
      await wait(() => execute(`!(${pact}) && Boolean(${about})`), 'original Pact close returns to About')
      await durable('common.isAgreePact', true)
      checks.push({ kind: 'settings-about-scene', id, themeState, fontState, inventory, reachability, links, focus, pact: { opened: true, closed: true, agreement, close } })
    }
    const expected = scenes.flatMap(([t, w, h, f]) => ['top', 'bottom', 'focus', 'pact'].map(part => `about-${t}-${w}x${h}-${f}px-${part}.png`))
    if (JSON.stringify(captured) !== JSON.stringify(expected) || checks.filter(c => c.kind === 'settings-about-scene').length !== scenes.length) throw new Error('About fixed scenario/Pact/screenshot matrix incomplete')
  } catch (error) { failure = error } finally {
    cleanup = true
    deadline = Date.now() + 10000
    const attempt = async(name, work) => {
      try { restoredState[name] = await step(work, name) ?? true; restored.push(name) } catch (error) { cleanupFailures.push({ name, error }); observations.push({ kind: 'settings-about-cleanup-failure', name, message: String(error.stack || error) }) }
    }
    if (initial) {
      await attempt('pact', async() => { if (await execute(`Boolean(${pact})`)) { await click(closeButton); await wait(() => execute(`!(${pact})`), 'cleanup original Pact close') } })
      await attempt('fullscreen', async() => { if (mainWindow.isFullScreen() !== initial.fullscreen) { key('F11'); await wait(() => execute(`document.documentElement.classList.contains('fullscreen') === ${initial.fullscreen}`), 'fullscreen cleanup') } })
      await attempt('theme', () => setTheme(initial.theme))
      await attempt('font', () => setFont(initial.font))
      await attempt('route/category', async() => {
        if (initial.category) {
          await click(`Array.from(document.querySelectorAll('#view [role=tab]')).find(el => el.getAttribute('aria-label') === ${JSON.stringify(initial.category)})`)
        } else await step(() => context.navigate(initial.location.slice(1).split('?')[0]), 'restore original sidebar route')
        await wait(() => execute(`location.hash === ${JSON.stringify(initial.location)} && (location.hash.startsWith('#/setting') ? document.querySelector('#view [role=tab][aria-selected=true]')?.getAttribute('aria-label') || null : null) === ${JSON.stringify(initial.category)}`), 'original route and category restored')
      })
      await attempt('bounds', async() => { mainWindow.setBounds(initial.bounds); await wait(() => Promise.resolve(Object.entries(initial.bounds).every(([k, v]) => mainWindow.getBounds()[k] === v)), 'original bounds restored'); await paint() })
      await attempt('resizable', async() => { mainWindow.setResizable(initial.resizable); if (mainWindow.isResizable() !== initial.resizable || mainWindow.isFullScreen() !== initial.fullscreen) throw new Error('About native state restoration mismatch') })
    }
    checks.push({ kind: 'settings-about-restoration', initial, restored, restoredState, native: { bounds: mainWindow.getBounds(), resizable: mainWindow.isResizable(), fullscreen: mainWindow.isFullScreen() }, failures: cleanupFailures.map(({ name, error }) => ({ name, message: String(error) })), complete: Boolean(initial) && restored.length === 7 && !cleanupFailures.length })
  }
  if (failure) observations.push({ kind: 'settings-about-failure', message: String(failure.stack || failure), captured })
  if (failure || cleanupFailures.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupFailures.map(item => item.error)], 'About evidence or independent cleanup failed')
  if (!checks.at(-1).complete) throw new Error('About restoration record incomplete')
  checks.push({ kind: 'settings-about-complete', scenarios: scenes.length, screenshots: captured.length, checksBudgetMs: 40000, cleanupBudgetMs: 10000 })
}
