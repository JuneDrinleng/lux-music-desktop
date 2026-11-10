// Original search settings only: native input, read-only observations, no mocks.
const { performance } = require('node:perf_hooks')
const createUiTools = require('./ui.cjs')

const controls = [
  { id: 'setting_search_showHot_enable', setting: 'search.isShowHotSearch', label: 'setting__search_hot' },
  { id: 'setting_search_showHistory_enable', setting: 'search.isShowHistorySearch', label: 'setting__search_history' },
  { id: 'setting_search_focusSearchBox_enable', setting: 'search.isFocusSearchBox', label: 'setting__search_focus_search_box' },
]
const scenes = [
  ['lime', 1024, 700, 16], ['lime', 1280, 800, 16], ['lime', 1440, 900, 16],
  ['oat_milk', 1280, 800, 16], ['ink_night', 1280, 800, 16], ['lime', 828, 540, 19],
].map(([theme, width, height, font]) => ({ theme, width, height, font }))
const keys = [...controls.map(control => control.setting), 'theme.id', 'common.fontSize']
const label = id => `document.querySelector('label[for="${id}"]')`
const checkbox = id => `${label(id)}.querySelector('[role=checkbox]')`

module.exports = async function settingsSearchEvidence(context) {
  // This is the existing player ...context. Do not require extra injected tools.
  const { mainWindow, execute: rawExecute, waitFor, screenshot, checks, delay, key, readSetting } = context
  const started = performance.now()
  let phase = 'body'
  let epoch = 0
  let deadline = started + 40000
  const record = { kind: 'settings-search', budgetMs: { body: 40000, cleanup: 10000 }, scenes: [], actions: [], focus: [], cleanup: [] }
  checks.push(record) // Retain partial results and every failure in the manifest.
  const within = async(description, operation) => {
    const owner = phase
    const generation = epoch
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw new Error(`Search settings ${owner} budget exhausted: ${description}`)
    let timer
    try {
      const result = await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Search settings ${owner} deadline: ${description}`)), remaining) }),
      ])
      if (owner !== phase || generation !== epoch || performance.now() > deadline) throw new Error(`Search settings expired operation: ${description}`)
      return result
    } finally { clearTimeout(timer) }
  }
  const execute = async(code) => {
    const result = await within('renderer observation', () => rawExecute(`(async() => { try { return { value: await (${code}) } } catch (error) { return { failure: String(error.stack || error) } } })()`))
    if (result.failure) throw new Error(result.failure)
    return result.value
  }
  const until = (predicate, description) => within(description, () => waitFor(predicate, description, Math.min(2500, Math.max(1, deadline - performance.now()))))
  const { click: nativeClick, target, i18nControl } = createUiTools({ mainWindow, execute })
  const click = expression => within('original native mouse click', () => nativeClick(expression))
  const paint = async() => {
    const frames = await execute('new Promise(resolve => requestAnimationFrame(first => requestAnimationFrame(second => resolve({ first, second }))))')
    if (!(frames.second > frames.first)) throw new Error('Search settings did not paint two distinct frames')
    return frames
  }
  const values = async(names = keys) => {
    const renderer = await execute(`Object.fromEntries(${JSON.stringify(names)}.map(key => [key, window.lxData.appSetting[key]]))`)
    const disk = readSetting()
    return Object.fromEntries(names.map(name => [name, { renderer: renderer[name], main: global.lx.appSetting[name], disk: disk[name] }]))
  }
  const agrees = (state, name, value) => ['renderer', 'main', 'disk'].every(source => state[name][source] === value)
  const visit = async(hash) => {
    await click(`Array.from(document.querySelectorAll('#left a[href]')).find(el => el.getAttribute('href').split('?')[0] === ${JSON.stringify(hash.split('?')[0])})`)
    await until(() => execute(`${hash.includes('?') ? `location.hash === ${JSON.stringify(hash)}` : `location.hash.split('?')[0] === ${JSON.stringify(hash)}`} && Boolean(document.querySelector('#view').children.length)`), `original sidebar ${hash}`)
  }
  const category = async(name, id = name) => {
    await click(i18nControl('#view [role=tab]', `setting__${name}`))
    await until(() => execute(`Boolean(document.querySelector('#view dl > dt#${id}')) && (${i18nControl('#view [role=tab]', `setting__${name}`)}).getAttribute('aria-selected') === 'true'`), `original search-settings category ${name}`)
  }
  const openSearch = async() => {
    if (!await execute('location.hash === "#/setting"')) await visit('#/setting')
    await category('search')
  }
  const assertValues = async(expected) => {
    let state
    await until(async() => {
      state = await values(Object.keys(expected))
      return Object.entries(expected).every(([name, value]) => agrees(state, name, value))
    }, 'specified search settings renderer/main/temporary disk agreement')
    for (const control of controls.filter(control => control.setting in expected)) {
      if (!await execute(`(${checkbox(control.id)}).getAttribute('aria-checked') === '${expected[control.setting]}' && document.getElementById('${control.id}').checked === ${expected[control.setting]}`)) throw new Error(`Original checkbox aria/input disagree: ${control.id}`)
    }
    return state
  }
  const basic = async() => {
    if (!await execute('location.hash === "#/setting"')) await visit('#/setting')
    await category('basic')
  }
  const theme = async(id) => {
    await basic()
    if (await execute('Boolean(document.querySelector("[data-action=show-themes]"))')) await click('document.querySelector("[data-action=show-themes]")')
    await until(() => execute('document.querySelectorAll("[data-theme-id]").length >= 21'), 'original full theme catalog')
    await click(`document.querySelector('[data-theme-id="${id}"]')`)
    const state = await assertValues({ 'theme.id': id })
    if (!await execute(`document.querySelector('[data-theme-id="${id}"]').getAttribute('aria-pressed') === 'true'`)) throw new Error(`Theme UI state disagrees: ${id}`)
    return state
  }
  const font = async(size) => {
    await basic()
    await click(label(`setting_basic_font_size_${size}`))
    const state = await assertValues({ 'common.fontSize': size })
    if (!await execute(`document.getElementById('setting_basic_font_size_${size}').checked && getComputedStyle(document.documentElement).fontSize === '${size}px'`)) throw new Error(`Original font UI/computed state disagrees: ${size}`)
    return state
  }
  // Full rectangles, text fragments, ancestor clipping and centre hits. Vertical
  // scrolling is permitted; no crop tolerance or focus/paint assertion is relaxed.
  const geometry = async(expression, focused = false) => {
    await within('scroll original content into view', () => target(expression))
    await paint()
    return execute(`(() => {
      const el = (${expression}); const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p); const pr = p.getBoundingClientRect();
        if (/^(hidden|clip|auto|scroll)$/.test(ps.overflowX)) { clip.left = Math.max(clip.left, pr.left + p.clientLeft); clip.right = Math.min(clip.right, pr.left + p.clientLeft + p.clientWidth); }
        if (/^(hidden|clip|auto|scroll)$/.test(ps.overflowY)) { clip.top = Math.max(clip.top, pr.top + p.clientTop); clip.bottom = Math.min(clip.bottom, pr.top + p.clientTop + p.clientHeight); }
      }
      const inside = r => r.left >= clip.left && r.top >= clip.top && r.right <= clip.right && r.bottom <= clip.bottom;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const range = document.createRange(); range.selectNodeContents(el);
      const text = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0).map(box);
      const outline = ${focused} ? parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset) : 0;
      const outer = { left: r.left - outline, top: r.top - outline, right: r.right + outline, bottom: r.bottom + outline };
      if (r.width <= 0 || r.height <= 0 || s.visibility !== 'visible' || !inside(r) || !hit || !(hit === el || el.contains(hit)) || text.some(r => !inside(r))) throw new Error('Search settings content clipped or covered: ' + JSON.stringify({ rect: box(r), clip, text }));
      if (${focused} && (document.activeElement !== el || !el.matches(':focus-visible') || s.outlineStyle === 'none' || parseFloat(s.outlineWidth) < 2 || !inside(outer))) throw new Error('Search settings keyboard focus/outline clipped: ' + JSON.stringify({ rect: box(r), outer, clip }));
      return { rect: box(r), clip, text, centreHit: true, font: s.fontFamily, fontSize: s.fontSize, focusVisible: el.matches(':focus-visible'), outline: { width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, style: s.outlineStyle } };
    })()`)
  }
  const layout = async() => {
    const inventory = await execute(`(() => {
      const heading = document.querySelector('#search'); const dd = heading.nextElementSibling; const panel = dd.closest('dl').parentElement;
      const actual = Array.from(dd.querySelectorAll('input'), el => el.id);
      const expected = ${JSON.stringify(controls)};
      if (JSON.stringify(actual) !== JSON.stringify(expected.map(c => c.id)) || dd.querySelectorAll('[role=checkbox]').length !== 3 || heading.textContent.trim() !== window.i18n.t('setting__search')) throw new Error('Original search heading/control inventory changed');
      for (const c of expected) {
        const label = dd.querySelector('label[for="' + c.id + '"]'); const role = label?.querySelector('[role=checkbox]'); const span = label?.querySelector('span');
        if (!role || role.getAttribute('tabindex') !== '0' || role.getAttribute('aria-disabled') !== 'false' || role.getAttribute('aria-label') !== window.i18n.t(c.label) || span.textContent.trim() !== window.i18n.t(c.label)) throw new Error('Original search control semantics changed: ' + c.id);
        const cr = role.getBoundingClientRect(); const tr = span.getBoundingClientRect();
        if (tr.left < cr.right || label.scrollWidth > label.clientWidth) throw new Error('Search text overlaps checkbox or overflows');
      }
      const root = getComputedStyle(document.querySelector('#root')); const ds = getComputedStyle(dd); const hs = getComputedStyle(heading);
      const colors = new OffscreenCanvas(1, 1).getContext('2d');
      const tokenMatches = (actual, name) => {
        const token = root.getPropertyValue('--lux-' + name).trim();
        if (!token || !CSS.supports('color', token)) return false;
        colors.fillStyle = actual; const canonical = colors.fillStyle;
        colors.fillStyle = token; return canonical === colors.fillStyle;
      };
      if (panel.scrollWidth > panel.clientWidth || document.documentElement.scrollWidth > innerWidth || ds.fontFamily !== getComputedStyle(panel).fontFamily || !tokenMatches(ds.backgroundColor, 'paper') || !tokenMatches(ds.color, 'ink') || !tokenMatches(hs.color, 'ink') || hs.borderTopWidth !== '2px') throw new Error('Search semantic paper/ink/font/rule or horizontal layout disagrees');
      return { ids: actual, horizontalOverflow: false, font: ds.fontFamily, paper: ds.backgroundColor, ink: ds.color, tokens: Object.fromEntries(['paper', 'ink', 'muted', 'rule', 'hairline'].map(name => [name, root.getPropertyValue('--lux-' + name).trim()])) };
    })()`)
    inventory.heading = await geometry('document.querySelector("#search")')
    inventory.controls = []
    for (const control of controls) {
      inventory.controls.push({ id: control.id, label: await geometry(label(control.id)), checkbox: await geometry(checkbox(control.id)) })
    }
    await execute('document.querySelector("#view dl").parentElement.scrollTo({ top: 0, behavior: "instant" })')
    await paint()
    return inventory
  }
  const tabTo = async(control) => {
    await click('document.querySelector("#search")')
    const trace = []
    for (let index = 0; index < 40; index++) {
      key('Tab')
      await within('native Tab dispatch', () => delay(20))
      const active = await execute(`({ tag: document.activeElement.tagName, id: document.activeElement.id, role: document.activeElement.getAttribute('role'), target: document.activeElement === (${checkbox(control.id)}) })`)
      trace.push(active)
      if (active.target) return { input: 'native heading mouse click, then real Tab only; no DOM focus()', trace, geometry: await geometry(checkbox(control.id), true) }
    }
    throw new Error(`Real Tab never reached original checkbox: ${control.id}`)
  }
  const toggle = async(control, input, expected) => {
    const before = await assertValues({ [control.setting]: !expected })
    if (input !== 'mouse' && !await execute(`document.activeElement === (${checkbox(control.id)}) && document.activeElement.matches(':focus-visible')`)) throw new Error('Keyboard action is not on the original focused checkbox')
    // Read-only observer counts actual aria transitions, including double toggles.
    // A second renderer command confirms that observer installation has run.
    const transitions = execute(`new Promise(resolve => {
      const el = (${checkbox(control.id)}); const changes = [];
      const observer = new MutationObserver(records => { for (const record of records) changes.push(el.getAttribute(record.attributeName)); });
      observer.observe(el, { attributes: true, attributeFilter: ['aria-checked'] });
      setTimeout(() => { observer.disconnect(); resolve(changes); }, 300);
    })`)
    transitions.catch(() => {})
    await execute('true')
    if (input === 'mouse') await click(label(control.id))
    else key(input)
    const changes = await transitions
    if (JSON.stringify(changes) !== JSON.stringify([String(expected)])) throw new Error(`Expected exactly one ${input} toggle: ${control.id}: ${JSON.stringify(changes)}`)
    const after = await assertValues({ [control.setting]: expected })
    await paint()
    return { input, expected, before, after, ariaTransitions: changes }
  }
  let initial
  let originalCategory
  let failure
  const boundary = async() => ({
    ...await execute(`(() => {
      const audio = window.__luxEvidenceAudioElements?.find(el => (el.currentSrc || el.src).includes('lux-software-evidence-'));
      return { queue: Array.from(document.querySelectorAll('#play-queue [data-queue-id]'), el => el.dataset.queueId), musicId: window.lxData.musicInfo.id, audio: audio ? { src: audio.currentSrc || audio.src, paused: audio.paused, volume: audio.volume, muted: audio.muted } : null };
    })()`),
    sourceIds: await within('read original source playlist IDs', async() => (await global.lx.worker.dbService.getListMusics('default')).map(item => item.id)),
  })
  const native = () => ({ bounds: mainWindow.getBounds(), visible: mainWindow.isVisible(), focused: mainWindow.isFocused(), minimized: mainWindow.isMinimized(), maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() })
  try {
    const state = await values()
    if (!keys.every(name => agrees(state, name, state[name].renderer)) || controls.some(c => typeof state[c.setting].renderer !== 'boolean')) throw new Error('Initial specified search/theme/font states disagree')
    initial = { values: Object.fromEntries(keys.map(name => [name, state[name].renderer])), hash: await execute('location.hash'), native: native(), boundary: await boundary() }
    record.initial = initial
    if (initial.boundary.queue.length || !initial.boundary.audio) throw new Error('Queue must finish empty with the original native audio fixture')
    await visit('#/setting')
    originalCategory = await execute('document.querySelector("#view [role=tab][aria-selected=true]").getAttribute("aria-label")')
    record.originalCategory = originalCategory
    for (const scene of scenes) {
      const selection = { theme: await theme(scene.theme), font: await font(scene.font) }
      mainWindow.setContentSize(scene.width, scene.height)
      await until(async() => JSON.stringify(mainWindow.getContentSize()) === JSON.stringify([scene.width, scene.height]) && await execute(`innerWidth === ${scene.width} && innerHeight === ${scene.height}`), 'exact native/renderer search settings viewport')
      await openSearch()
      const file = `settings-search-${scene.theme}-${scene.width}x${scene.height}-font${scene.font}.png`
      const detail = { scene, selection, native: { contentSize: mainWindow.getContentSize(), minimumConstraint: mainWindow.getMinimumSize() }, layout: await layout() }
      await within(`screenshot ${file}`, () => screenshot(file, 'settings-search', detail))
      record.scenes.push({ file, ...detail })
    }
    for (const control of controls) {
      const original = initial.values[control.setting]
      const action = { id: control.id, setting: control.setting, original, operations: [] }
      record.actions.push(action)
      action.operations.push(await toggle(control, 'mouse', !original))
      await category('basic')
      await openSearch()
      action.reentered = await assertValues({ [control.setting]: !original })
      action.operations.push(await toggle(control, 'mouse', original))
      const focus = await tabTo(control)
      const file = `settings-search-focus-${control.id}.png`
      await within(`screenshot ${file}`, () => screenshot(file, 'settings-search', { control, scene: scenes.at(-1), focus }))
      record.focus.push({ id: control.id, file, ...focus })
      for (const input of ['Enter', 'Space']) {
        action.operations.push(await toggle(control, input, !original))
        action.operations.push(await toggle(control, input, original))
      }
      action.restored = await assertValues({ [control.setting]: original })
    }
    if (JSON.stringify(record.scenes.map(item => item.scene)) !== JSON.stringify(scenes) || record.focus.length !== 3 || controls.some(c => !record.focus.some(item => item.id === c.id))) throw new Error('Fixed search settings screenshot/focus matrix is incomplete')
    for (const control of controls) {
      const action = record.actions.find(item => item.id === control.id)
      if (!action?.reentered || !action.restored || JSON.stringify(action.operations.map(item => item.input)) !== JSON.stringify(['mouse', 'mouse', 'Enter', 'Enter', 'Space', 'Space'])) throw new Error(`Missing search settings action/restoration: ${control.id}`)
    }
    record.bodyComplete = true
  } catch (error) {
    failure = error
    record.failure = String(error.stack || error)
  } finally {
    record.bodyElapsedMs = Math.round(performance.now() - started)
    phase = 'cleanup'
    epoch++
    const cleanupDeadline = performance.now() + 10000
    const attempt = async(name, operation) => {
      epoch++
      deadline = Math.min(cleanupDeadline, performance.now() + 1800)
      try {
        await within(name, operation)
        record.cleanup.push({ name, restored: true })
      } catch (error) { record.cleanup.push({ name, restored: false, failure: String(error.stack || error) }) }
    }
    for (const control of controls) {
      await attempt(control.setting, async() => {
        if (!initial) throw new Error('Initial snapshot unavailable')
        await openSearch()
        const state = await values([control.setting])
        if (!agrees(state, control.setting, initial.values[control.setting])) await click(label(control.id))
        await assertValues({ [control.setting]: initial.values[control.setting] })
      })
    }
    await attempt('theme', async() => { if (!initial) throw new Error('Initial snapshot unavailable'); await theme(initial.values['theme.id']) })
    await attempt('font', async() => { if (!initial) throw new Error('Initial snapshot unavailable'); await font(initial.values['common.fontSize']) })
    await attempt('category and route', async() => {
      if (!initial || !originalCategory) throw new Error('Initial route/category unavailable')
      await click(`Array.from(document.querySelectorAll('#view [role=tab]')).find(el => el.getAttribute('aria-label') === ${JSON.stringify(originalCategory)})`)
      await until(() => execute(`document.querySelector('#view [role=tab][aria-selected=true]').getAttribute('aria-label') === ${JSON.stringify(originalCategory)}`), 'restore original category')
      await visit(initial.hash)
    })
    await attempt('native bounds and state', async() => {
      if (!initial) throw new Error('Initial native state unavailable')
      mainWindow.setBounds(initial.native.bounds)
      await until(async() => JSON.stringify(native()) === JSON.stringify(initial.native), 'restore exact original window bounds/native state')
    })
    await attempt('final values and queue/audio/source invariants', async() => {
      if (!initial) throw new Error('Initial snapshot unavailable')
      const final = await values()
      if (!keys.every(name => agrees(final, name, initial.values[name])) || JSON.stringify(await boundary()) !== JSON.stringify(initial.boundary)) throw new Error('Search cleanup changed specified settings, empty queue, source IDs or current audio semantics')
      record.final = { values: final, hash: await execute('location.hash'), native: native(), boundary: await boundary() }
      if (record.final.hash !== initial.hash) throw new Error('Original route did not restore')
    })
    record.elapsedMs = Math.round(performance.now() - started)
    record.unverified = ['search result pages and full M3a', 'public online sources', 'physical audio hardware', 'Windows/macOS']
  }
  const cleanupFailures = record.cleanup.filter(item => !item.restored)
  if (failure || cleanupFailures.length || !record.bodyComplete || record.cleanup.length !== 8) throw new AggregateError([...(failure ? [failure] : []), ...cleanupFailures.map(item => new Error(`${item.name}: ${item.failure}`))], 'Search settings evidence or restoration failed')
  record.complete = true
}
