const createUiTools = require('./ui.cjs')
const createLayoutEvidence = require('./layout.cjs')

const styles = ['mini', 'middle', 'full']
const fixtures = [[1024, 700, 16], [1280, 800, 16], [1440, 900, 16], [828, 540, 16], [828, 540, 19]]
const modeKeys = { listLoop: 'player__play_toggle_mode_list_loop', random: 'player__play_toggle_mode_random', list: 'player__play_toggle_mode_list', singleLoop: 'player__play_toggle_mode_single_loop', none: 'player__play_toggle_mode_off' }
const epsilon = 0.01
const rectSource = `(el, tools) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
    visibility: tools.visibility(el), clipping: tools.clipping(el) };
}`
const inside = (r, width, height) => r && r.visibility.visible && ['x', 'y', 'width', 'height', 'right', 'bottom'].every(key => Number.isFinite(r[key])) && r.width > 0 && r.height > 0 && r.x >= -epsilon && r.y >= -epsilon && r.right <= width + epsilon && r.bottom <= height + epsilon && !r.clipping.outsideViewport && !r.clipping.ancestors.some(a => a.clipped)
const popupList = 'Array.from(document.querySelectorAll(\'#root [aria-hidden=false]\')).filter(el => getComputedStyle(el).position === \'absolute\' && el.getBoundingClientRect().width > 0)'

// Dormant until the normal-flow App and each explicitly selected player consumer exist.
// This factory never invokes DOM, input or captures. It does not replace player.cjs.
module.exports = function createPlayerLayoutEvidence(context) {
  const { execute, waitFor, mainWindow, navigate, screenshot, checks, observations, stage, readSetting } = context
  const { click, i18nControl } = createUiTools(context)
  const { verifyGeometry, rendererToolsSource } = createLayoutEvidence(context)
  const readValue = async(name, inputId) => ({
    ...await execute(`({ renderer: window.lxData.appSetting[${JSON.stringify(name)}], checked: ${inputId ? `document.getElementById(${JSON.stringify(inputId)})?.checked ?? null` : 'null'} })`),
    main: global.lx.appSetting[name],
    disk: readSetting()[name],
  })
  const matches = (state, value, checked = null) => state.renderer === value && state.main === value && state.disk === value && (checked === null || state.checked === checked)
  const waitValue = async(name, value, inputId) => {
    let state
    await waitFor(async() => matches(state = await readValue(name, inputId), value, inputId ? typeof value === 'boolean' ? value : true : null), `real renderer/main/disk/control ${name}=${value}`)
    return state
  }
  const setting = async(id, name, value) => {
    await navigate('/setting')
    const tab = i18nControl('#view [role=tab]', 'setting__basic')
    if (!await execute(`(${tab})?.getAttribute('aria-selected') === 'true'`)) await click(tab)
    await waitFor(() => execute(`Boolean(document.getElementById(${JSON.stringify(id)}) && document.querySelector('label[for="${id}"]'))`), `original Basic settings mounts ${id}`)
    if (!await execute(`document.getElementById(${JSON.stringify(id)}).checked`)) await click(`document.querySelector('label[for="${id}"]')`)
    const state = await waitValue(name, value, id)
    checks.push({ kind: 'player-layout-original-setting', inputId: id, name, value, state })
  }
  const font = async(value) => {
    await setting(`setting_basic_font_size_${value}`, 'common.fontSize', value)
    await waitFor(() => execute(`getComputedStyle(document.documentElement).fontSize === '${value}px'`), `actual root font ${value}px`)
  }
  const closePopups = async() => {
    await click('document.querySelector("#toolbar input")')
    await waitFor(() => execute(`${popupList}.length === 0`), 'native player popup closure')
  }
  const volumeTrigger = `(${i18nControl('#player button', 'player__volume', true)}) || (${i18nControl('#player button', 'player__volume_muted')})`
  const modeTrigger = async() => {
    const current = await execute("window.lxData.appSetting['player.togglePlayMethod']")
    if (!Object.hasOwn(modeKeys, current)) throw new Error(`Unknown original playback mode: ${current}`)
    return i18nControl('#player button', modeKeys[current])
  }
  const waitPopup = async(content, description) => {
    let previous
    await waitFor(async() => {
      const current = await execute(`(() => {
        const popups = ${popupList}; if (popups.length !== 1) return null;
        const el = popups[0]; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        if (!Boolean(${content}) || r.width <= 0 || r.height <= 0 || s.visibility !== 'visible' || Number(s.opacity) !== 1 ||
          !(s.transform === 'none' || new DOMMatrixReadOnly(s.transform).isIdentity)) return null;
        return [r.x, r.y, r.width, r.height];
      })()`)
      const stable = current && previous && current.every((value, index) => Number.isFinite(value) && Math.abs(value - previous[index]) <= epsilon)
      previous = current
      return stable
    }, `real original ${description} popup opaque/identity with stable bounds`)
  }
  const openPopup = async(type) => {
    await closePopups()
    await click(type === 'volume' ? volumeTrigger : await modeTrigger())
    const content = type === 'volume' ? 'el.querySelector("#player__volume_mute")' : `Object.values(${JSON.stringify(modeKeys)}).every(key => Array.from(el.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === window.i18n.t(key)))`
    await waitPopup(content, type)
  }
  const snapshotPopup = () => execute(`(() => {
    const tools = ${rendererToolsSource}; const rect = el => (${rectSource})(el, tools);
    return { width: innerWidth, height: innerHeight, popups: ${popupList}.map(el => ({ rect: rect(el), text: el.innerText,
      buttons: Array.from(el.querySelectorAll('button'), b => ({ label: b.getAttribute('aria-label'), rect: rect(b) })),
      muteLabel: el.querySelector('label[for="player__volume_mute"]') ? rect(el.querySelector('label[for="player__volume_mute"]')) : null,
      seekMask: el.querySelector('[data-action=seek-progress]') ? rect(el.querySelector('[data-action=seek-progress]')) : null })) };
  })()`)
  const assertPopup = (state, type) => {
    if (state.popups.length !== 1 || state.popups.some(p => !inside(p.rect, state.width, state.height) || p.buttons.some(b => !inside(b.rect, state.width, state.height)))) throw new Error(`Original ${type} popup/buttons missing or clipped: ${JSON.stringify(state)}`)
    const p = state.popups[0]
    if ((type === 'volume' && !inside(p.muteLabel, state.width, state.height)) || (type === 'mini-progress' && !inside(p.seekMask, state.width, state.height))) throw new Error(`Original ${type} control missing or clipped: ${JSON.stringify(state)}`)
  }
  const capture = async(records, file, kind, state) => {
    await screenshot(file, kind, { playerLayout: state })
    records.push({ file, kind })
  }
  const popupCapture = async(records, style, type) => {
    await openPopup(type)
    const state = await snapshotPopup()
    assertPopup(state, type)
    checks.push({ kind: 'shell-player-popup', style, type, state })
    await capture(records, `shell-popup-${style}-${type}.png`, 'shell-player-popup', state)
  }
  const mute = async(value) => {
    await openPopup('volume')
    const inputId = 'player__volume_mute'
    const before = await readValue('player.isMute', inputId)
    if (before.checked !== value) await click('document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]")')
    const state = await waitValue('player.isMute', value, inputId)
    const label = value ? i18nControl('#player button', 'player__volume_muted') : i18nControl('#player button', 'player__volume', true)
    await waitFor(() => execute(`Boolean(${label})`), `actual volume label for mute=${value}`)
    return state
  }
  const mode = async(value) => {
    await openPopup('mode')
    await click(i18nControl('#root [aria-hidden=false] button', modeKeys[value]))
    const state = await waitValue('player.togglePlayMethod', value)
    await waitFor(() => execute(`Boolean(${i18nControl('#player button', modeKeys[value])})`), `actual mode trigger label ${value}`)
    await closePopups()
    return state
  }
  const snapshotPlayer = () => execute(`(() => {
    if (!document.getElementById('player')) throw new Error('Required future player consumer missing');
    const tools = ${rendererToolsSource}; const rect = el => (${rectSource})(el, tools); const t = key => { const value = window.i18n.t(key); if (typeof value !== 'string' || !value.trim() || value === key) throw new Error('Actual player translation missing: ' + key); return value; };
    const els = Array.from(document.querySelectorAll('#player button'));
    const role = (name, predicate) => ({ role: name, present: els.some(predicate) }); const labelIs = key => el => el.getAttribute('aria-label') === t(key);
    const roles = [role('cover', labelIs('player__pic_tip')), role('title-copy', el => (el.getAttribute('aria-label') || '').endsWith(t('copy_tip'))), role('previous', labelIs('player__prev')), role('play-pause', el => [t('player__play'), t('player__pause')].includes(el.getAttribute('aria-label'))), role('next', labelIs('player__next')), role('add-current-track', labelIs('player__add_music_to')), role('desktop-lyrics', el => el.hasAttribute('aria-pressed')), role('volume', el => (el.getAttribute('aria-label') || '').startsWith(t('player__volume')) || el.getAttribute('aria-label') === t('player__volume_muted')), role('playback-mode', el => Object.values(${JSON.stringify(modeKeys)}).map(t).includes(el.getAttribute('aria-label')))];
    const style = window.lxData.appSetting['common.playBarProgressStyle'];
    if (style === 'mini') roles.push(role('mini-progress', el => (el.getAttribute('aria-label') || '').startsWith(t('player__progress'))));
    return { width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize, style, roles,
      buttons: els.map(el => ({ label: el.getAttribute('aria-label'), text: el.innerText.trim(), emptyTitle: !window.lxData.musicInfo.id && !el.innerText.trim() && el.getAttribute('aria-label') === t('copy_tip'), rect: rect(el) })),
      musicInfo: JSON.parse(JSON.stringify(window.lxData.musicInfo)), playMusicInfo: JSON.parse(JSON.stringify(window.lxData.playMusicInfo)), playInfo: JSON.parse(JSON.stringify(window.lxData.playInfo)), status: window.lxData.status.value };
  })()`)
  const verifyPlayer = async(style, name, expected) => {
    const geometry = await verifyGeometry(name, expected)
    const state = await snapshotPlayer()
    if (state.width !== expected.width || state.height !== expected.height || state.fontSize !== `${expected.fontSize}px`) throw new Error('Actual player viewport/font changed after shell geometry verification')
    if (state.style !== style || !matches(await readValue('common.playBarProgressStyle'), style)) throw new Error('Original progress style was silently substituted or not persisted')
    if (state.roles.some(role => !role.present) || state.buttons.length < state.roles.length) throw new Error(`A future original player control is missing: ${JSON.stringify(state)}`)
    for (const button of state.buttons) if (!(button.emptyTitle && button.rect.width === 0) && !inside(button.rect, state.width, state.height)) throw new Error(`Original player control clipped: ${JSON.stringify(button)}`)
    const proof = { style, geometry, player: state }
    checks.push({ kind: 'player-layout-controls', name, ...proof })
    return proof
  }
  const miniProgress = async(records) => {
    await closePopups()
    const trigger = i18nControl('#player button', 'player__progress', true)
    await click(trigger)
    await waitFor(() => execute(`(${trigger})?.getAttribute('aria-expanded') === 'true' && ${popupList}.some(el => el.querySelector('[data-action=seek-progress]'))`), 'original mini progress expanded/seek DOM')
    await waitPopup('el.querySelector("[data-action=seek-progress]")', 'mini-progress')
    const state = await snapshotPopup()
    assertPopup(state, 'mini-progress')
    checks.push({ kind: 'shell-mini-progress-geometry', state })
    await capture(records, 'shell-player-mini-progress-popup.png', 'shell-mini-progress', state)
    await closePopups()
  }
  const verifyStyle = async(style) => {
    if (!styles.includes(style)) throw new Error(`Unsupported original player style: ${style}`)
    for (const [name, value] of [['player.isMute', false], ['player.togglePlayMethod', 'listLoop']]) {
      const state = await readValue(name)
      if (!matches(state, value)) throw new Error(`Player evidence requires the owned baseline ${name}=${value}: ${JSON.stringify(state)}`)
    }
    stage(`player layout: explicit ${style} consumer; five actual viewport/font fixtures`)
    const records = []
    let failure
    try {
      await setting(`setting_basic_playbar_progress_style_${style}`, 'common.playBarProgressStyle', style)
      for (const [width, height, fontSize] of fixtures) {
        await font(fontSize)
        mainWindow.setContentSize(width, height)
        await waitFor(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), `actual fixture viewport ${width}x${height}`)
        await navigate('/search')
        const name = `player-${style}-${width}x${height}-font${fontSize}`
        const state = await verifyPlayer(style, name, { width, height, fontSize })
        await capture(records, `shell-${name}.png`, 'shell-player', state)
      }
      await popupCapture(records, style, 'volume')
      const muted = await mute(true)
      const restored = await mute(false)
      checks.push({ kind: 'shell-player-live-mute-binding', style, muted, restored })
      await closePopups()
      await popupCapture(records, style, 'mode')
      const random = await mode('random')
      const listLoop = await mode('listLoop')
      checks.push({ kind: 'shell-player-live-mode-binding', style, random, listLoop })
      if (style === 'mini') await miniProgress(records)
    } catch (error) { failure = error } finally {
      for (const restore of [() => mute(false), () => mode('listLoop'), () => closePopups(), () => font(16)]) {
        try { await restore() } catch (error) {
          observations.push({ kind: 'player-layout-cleanup-failure', style, message: error.message })
          failure ||= error
        }
      }
    }
    if (failure) throw failure
    const expected = { 'shell-player': 5, 'shell-player-popup': 2, 'shell-mini-progress': style === 'mini' ? 1 : 0 }
    for (const [kind, count] of Object.entries(expected)) if (records.filter(r => r.kind === kind).length !== count) throw new Error(`Player ${style} subset incomplete: ${kind} expected ${count}`)
    if (new Set(records.map(record => record.file)).size !== records.length) throw new Error('Player subset reused a capture filename')
    const result = { style, records, completeParentM2: false }
    checks.push({ kind: 'player-layout-style-subset', ...result })
    return result
  }
  const verifyCompleteMatrix = async() => {
    const results = []
    let failure
    try { for (const style of styles) results.push(await verifyStyle(style)) } catch (error) { failure = error } finally {
      try { await setting('setting_basic_playbar_progress_style_mini', 'common.playBarProgressStyle', 'mini') } catch (error) {
        observations.push({ kind: 'player-layout-final-style-cleanup-failure', message: error.message })
        failure ||= error
      }
    }
    if (failure) throw failure
    const records = results.flatMap(result => result.records)
    const expected = { 'shell-player': 15, 'shell-player-popup': 6, 'shell-mini-progress': 1 }
    for (const [kind, count] of Object.entries(expected)) if (records.filter(r => r.kind === kind).length !== count) throw new Error(`Complete player matrix incomplete: ${kind} expected ${count}`)
    if (new Set(records.map(record => record.file)).size !== records.length) throw new Error('Complete player matrix reused a capture filename')
    const result = { styles: [...styles], expected, records, completePlayerSubset: true, completeParentM2: false }
    checks.push({ kind: 'player-layout-complete-subset', ...result })
    observations.push({ kind: 'player-layout-boundary', verified: 'Actual merged three-style DOM, original control roles, viewport/font layout, popup bounds and real UI renderer/main/disk setting bindings', unverified: 'This is only the player subset; three original minimum-window focus images, routes/history/window/drag and themes are separate required gates. Real native media is verified separately by player.cjs; audible hardware output remains unverified.' })
    return result
  }
  return { verifyStyle, verifyCompleteMatrix }
}
