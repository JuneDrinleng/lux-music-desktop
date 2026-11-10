const { performance } = require('node:perf_hooks')
const createUiTools = require('./ui.cjs')

// Only original DOM input and read-only native media observations. The parent
// keeps its 90s media deadline; this check and its restoration have finite bounds.
module.exports = async function playDetailEvidence(context) {
  const { mainWindow, execute, waitFor, screenshot, navigate, readSetting, readMedia, checks, observations, key, delay, wheel, imported } = context
  const { click, target, i18nControl } = createUiTools({ execute, mainWindow })
  const initial = readSetting()
  const before = await readMedia()
  const bounds = mainWindow.getBounds()
  let deadline = performance.now() + 55000
  let restoring = false
  const until = (predicate, label) => {
    const remaining = Math.min(6000, deadline - performance.now())
    if (remaining <= 0) throw new Error(`Detail ${restoring ? 'restoration' : 'check'} deadline: ${label}`)
    return waitFor(predicate, label, remaining)
  }
  const detail = 'document.querySelector("[data-action=detail-controls]").parentElement'
  const control = (key, prefix = false) => i18nControl('[data-action=detail-controls] [aria-label]', key, prefix)
  const hideButton = i18nControl('[aria-label]', 'player__hide_detail_tip')
  const modeKeys = { listLoop: 'list_loop', random: 'random', list: 'list', singleLoop: 'single_loop', none: 'off' }
  const modalClose = 'Array.from(document.querySelectorAll("#root header button")).find(el => el.querySelector("use")?.getAttribute("xlink:href") === "#icon-delete")'
  const results = []
  let pendingVolumeDelta = null
  const open = async() => {
    await click(i18nControl('#player [aria-label]', 'player__pic_tip'))
    await until(() => execute('Boolean(document.querySelector("[data-action=detail-controls]"))'), 'detail enters through original artwork')
    await target(control('player__prev'))
  }
  const hide = async() => {
    if (!await execute('Boolean(document.querySelector("[data-action=detail-controls]"))')) return
    await click(hideButton)
    await until(() => execute('!document.querySelector("[data-action=detail-controls]")'), 'original detail hide completes')
  }
  const closePopup = async() => {
    await click(`${detail}.querySelector('h1')`)
    await until(() => execute('!Array.from(document.querySelectorAll("#root [aria-hidden=false]")).some(el => getComputedStyle(el).position === "absolute")'), 'detail popup closes')
  }
  const setting = async(name, value) => {
    await hide()
    await navigate('/setting')
    await click(i18nControl('#view [role=tab]', 'setting__basic'))
    if (name === 'theme.id') {
      if (await execute('Boolean(document.querySelector("[data-action=show-themes]"))')) await click('document.querySelector("[data-action=show-themes]")')
      await until(() => execute(`Boolean(document.querySelector('[data-theme-id="${value}"]'))`), 'original theme selector')
      await click(`document.querySelector('[data-theme-id="${value}"]')`)
    } else {
      const id = name === 'common.fontSize' ? `setting_basic_font_size_${value}` : `setting_basic_control_btn_position_${value}`
      await until(() => execute(`Boolean(document.getElementById('${id}'))`), 'original basic setting')
      await click(`document.querySelector('label[for="${id}"]')`)
    }
    await until(async() => await execute(`window.lxData.appSetting[${JSON.stringify(name)}] === ${JSON.stringify(value)}`) && readSetting()[name] === value && global.lx.appSetting[name] === value, `persisted detail setting ${name}`)
    await navigate('/list')
  }
  const mode = async(value) => {
    const current = readSetting()['player.togglePlayMethod']
    await click(control(`player__play_toggle_mode_${modeKeys[current]}`))
    const option = i18nControl('#root [aria-hidden=false] [aria-label]', `player__play_toggle_mode_${modeKeys[value]}`)
    await until(() => execute(`Boolean(${option})`), 'original detail mode popup')
    await click(option)
    await until(async() => (await readMedia()).setting.mode === value && readSetting()['player.togglePlayMethod'] === value, 'detail mode persisted')
    await closePopup()
  }
  const rate = async(value) => {
    await click(control('player__playback_rate', true))
    const slider = 'document.getElementById("player__playback_preserves_pitch")?.parentElement.parentElement.parentElement.nextElementSibling.lastElementChild'
    await until(() => execute(`Boolean(${slider})`), 'original rate slider')
    await click(slider, { ratio: (value * 100 - 50) / 150 })
    await until(async() => Math.abs((await readMedia()).audio.playbackRate - value) < 0.015, 'native playbackRate from original slider')
    await closePopup()
  }
  const geometry = async() => {
    const state = await execute(`(() => {
      const el = ${detail}; const r = el.getBoundingClientRect();
      const heading = el.querySelector('h1'); const title = heading.getBoundingClientRect();
      const buttons = [...el.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0);
      return { viewport: [innerWidth, innerHeight], font: getComputedStyle(document.documentElement).fontSize,
        noOverflow: el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth,
        titleVisible: title.width > 0 && title.x >= r.x && title.right <= r.right && title.bottom <= el.querySelector('[data-action=detail-controls]').getBoundingClientRect().top,
        noCover: !el.querySelector('img'), coverLoaded: !el.querySelector('img') || (el.querySelector('img').complete && el.querySelector('img').naturalWidth > 0), paper: getComputedStyle(el).backgroundColor,
        buttons: buttons.map(b => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return { label: b.getAttribute('aria-label'), inside: q.x >= 0 && q.y >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, hit: hit === b || b.contains(hit) } }) };
    })()`)
    if (!state.noOverflow || !state.titleVisible || !state.coverLoaded || state.buttons.some(b => !b.inside || !b.hit)) throw new Error(`Detail clipping/hit/cover regression: ${JSON.stringify(state)}`)
    return state
  }
  let failure
  try {
    await open()
    const started = await readMedia()
    await until(async() => (await readMedia()).audio.currentTime > started.audio.currentTime + 0.2, 'detail native clock advances')
    await click(control('player__pause'))
    await until(async() => (await readMedia()).audio.paused, 'detail pause')
    const paused = await readMedia()
    await delay(220)
    if (Math.abs((await readMedia()).audio.currentTime - paused.audio.currentTime) > 0.1) throw new Error('Detail paused audio clock advanced')
    await click('document.querySelector("[data-action=detail-controls] [data-action=seek-progress]")', { ratio: 0.4 })
    await until(async() => Math.abs((await readMedia()).audio.currentTime - 18) < 1, 'detail original seek reaches real 45s WAV')
    await click(control('player__play'))
    await until(async() => !(await readMedia()).audio.paused, 'detail resume')
    results.push({ action: 'clock-pause-seek-resume', paused, resumed: await readMedia() })
    const fallback = await geometry()
    if (!fallback.noCover) throw new Error('Original no-cover fixture unexpectedly has artwork')
    await screenshot('detail-no-cover-1280x800.png', 'play-detail', { geometry: fallback })
    for (const [action, track] of [['next', imported[1]], ['prev', imported[0]]]) {
      await click(control(`player__${action}`))
      await until(async() => { const s = await readMedia(); return s.musicInfo.id === track.id && !s.audio.paused && decodeURIComponent(new URL(s.audio.currentSrc).pathname) === track.id }, `detail ${action} native resource`)
      results.push({ action, state: await readMedia() })
    }
    await click(control('player__pause'))
    await until(async() => (await readMedia()).audio.paused, 'pause while inspecting layout')
    const volumeKey = () => control(readSetting()['player.isMute'] ? 'player__volume_muted' : 'player__volume', !readSetting()['player.isMute'])
    const calibration = await wheel(await target(volumeKey()), 1)
    const delta = (before.audio.volume >= 0.02 ? 100 : -100) * Math.sign(calibration.deltaY)
    pendingVolumeDelta = delta
    await wheel(await target(volumeKey()), delta)
    await until(async() => Math.abs((await readMedia()).audio.volume - before.audio.volume) > 0.01 && Math.abs((await readMedia()).audio.volume - readSetting()['player.volume']) < 0.001, 'detail wheel changes native persisted volume')
    await click(volumeKey())
    const mute = 'document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]")'
    await until(() => execute(`Boolean(${mute})`), 'detail mute popup')
    await click(mute)
    await until(async() => (await readMedia()).audio.muted !== before.audio.muted && readSetting()['player.isMute'] !== before.audio.muted, 'detail native persisted mute')
    const changed = await readMedia()
    await click(mute)
    await closePopup()
    await wheel(await target(volumeKey()), -delta)
    await until(async() => Math.abs((await readMedia()).audio.volume - before.audio.volume) < 0.001 && (await readMedia()).audio.muted === before.audio.muted, 'detail restores volume and mute')
    pendingVolumeDelta = null
    results.push({ action: 'volume-mute', changed, restored: await readMedia() })
    await mode('random')
    const random = await readMedia()
    await mode(before.setting.mode)
    results.push({ action: 'persisted-mode', random, restored: await readMedia() })
    await rate(1.5)
    const faster = await readMedia()
    await rate(before.audio.playbackRate)
    results.push({ action: 'native-playback-rate', faster, restored: await readMedia() })
    key('F11')
    await until(() => execute('document.querySelector("[data-action=play-detail]").classList.contains("fullscreen")').then(value => value && mainWindow.isFullScreen()), 'detail native and renderer fullscreen')
    await click(i18nControl('[data-action=play-detail] [aria-label]', 'fullscreen_exit'))
    await until(() => execute('!document.querySelector("[data-action=play-detail]").classList.contains("fullscreen")').then(value => value && !mainWindow.isFullScreen()), 'original detail fullscreen exit IPC')
    results.push({ action: 'native-fullscreen-exit', bounds: mainWindow.getBounds() })
    for (const [theme, width, height, side, font] of [
      ['lime', 1280, 800, 'right', 16], ['lime', 1024, 700, 'left', 16], ['lime', 1440, 900, 'right', 16],
      ['oat_milk', 1280, 800, 'left', 16], ['ink_night', 1280, 800, 'right', 16], ['ink_night', 828, 540, 'left', 19],
    ]) {
      for (const [name, value] of [['theme.id', theme], ['common.controlBtnPosition', side], ['common.fontSize', font]]) if (readSetting()[name] !== value) await setting(name, value)
      await hide()
      mainWindow.setContentSize(width, height)
      await until(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), 'detail actual viewport')
      await open()
      for (const name of ['lyric__select', 'comment__show', 'player__sound_effect', 'player__playback_rate', 'player__add_music_to']) await target(control(name, name === 'player__playback_rate'))
      const previousId = (await readMedia()).musicInfo.id
      await click(control('player__prev'))
      await until(async() => (await readMedia()).musicInfo.id !== previousId, 'original previous track for artwork variants')
      await until(() => execute(`Boolean(${detail}.querySelector('img')) === ${previousId === imported[0].id}`), 'original local sidecar cover or fallback')
      key('Tab')
      const focus = await execute(`(() => { const el = document.activeElement; const s = getComputedStyle(el); return { inside: ${detail}.contains(el), visible: el.matches(':focus-visible'), outline: s.outlineWidth, label: el.getAttribute('aria-label') } })()`)
      if (!focus.inside || !focus.visible || focus.outline !== '2px') throw new Error(`Missing detail keyboard focus: ${JSON.stringify(focus)}`)
      await screenshot(`detail-${theme}-${side}-${width}x${height}-font${font}.png`, 'play-detail', { theme, side, focus, geometry: await geometry() })
    }
    await click(control('comment__show'))
    await until(() => execute(`(() => { const el = ${detail}.querySelector('.comment'); return el && el.textContent.includes(window.i18n.t('comment__unavailable')) && Math.abs(el.getBoundingClientRect().width - el.clientWidth) < 0.1 })()`), 'original local-file comments unavailable state')
    await screenshot('detail-comment-return-828x540.png', 'play-detail', { geometry: await geometry(), boundary: 'local WAV has no online comments; original unavailable state' })
    await click(control('comment__show'))
    await hide()
    await open()
    results.push({ action: 'themes-sizes-sides-focus-comments-hide-restore', geometry: await geometry() })
    await click(control('player__sound_effect'))
    await until(() => execute('Boolean(document.getElementById("player__sound_effect_panner_enabled"))'), 'original sound-effect modal binding')
    await click(modalClose)
    await until(() => execute('!document.querySelector("#root input[id*=sound_effect]")'), 'sound-effect modal closes')
    await hide()
    await navigate('/setting')
    await click(i18nControl('#view [role=tab]', 'setting__basic'))
    const timer = "Array.from(document.querySelectorAll('#view button')).find(el => el.textContent.trim().startsWith(window.i18n.t('setting__play_timeout')))"
    await click(timer)
    await until(() => execute('Boolean(document.querySelector("#view input[type=number]"))'), 'original timer modal binding')
    await click(modalClose)
    await until(() => execute('!document.querySelector("#view input[type=number]")'), 'timer closes without scheduling')
    results.push({ action: 'original-effects-and-timer-entries', timer: 'original Basic settings entry after hiding detail; no timer started', effects: 'original shared modal opened without altering algorithms' })
  } catch (error) {
    failure = error
    observations.push({ kind: 'play-detail-failure', message: String(error.stack || error), results })
  } finally {
    restoring = true
    deadline = performance.now() + 20000
    // Restoration owns a separate finite 20s budget, including failure paths.
    const restore = async() => {
      // Close an original shared modal if a check failed while it was open.
      if (await execute(`Boolean(${modalClose})`)) await click(modalClose)
      if (mainWindow.isFullScreen()) { key('F11'); await waitFor(() => Promise.resolve(!mainWindow.isFullScreen()), 'restore fullscreen', 4000) }
      await hide()
      for (const name of ['theme.id', 'common.controlBtnPosition', 'common.fontSize']) if (readSetting()[name] !== initial[name]) await setting(name, initial[name])
      mainWindow.setBounds(bounds)
      await navigate('/list')
      const track = imported.find(item => item.id === before.musicInfo.id)
      if (!track) throw new Error('Original detail track is outside the imported fixture pair')
      await click(`Array.from(document.querySelectorAll('#my-list .list-item')).find(el => el.textContent.includes(${JSON.stringify(track.name)}))`, { count: 2 })
      await waitFor(async() => (await readMedia()).musicInfo.id === track.id && !(await readMedia()).audio.paused, 'restore original real track', 4000)
      await open()
      if (readSetting()['player.isMute'] !== before.audio.muted) {
        await click(control(readSetting()['player.isMute'] ? 'player__volume_muted' : 'player__volume', !readSetting()['player.isMute']))
        await until(() => execute('Boolean(document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]"))'), 'restore mute popup')
        await click('document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]")')
        await closePopup()
      }
      if (pendingVolumeDelta && Math.abs((await readMedia()).audio.volume - before.audio.volume) > 0.001) await wheel(await target(control(before.audio.muted ? 'player__volume_muted' : 'player__volume', !before.audio.muted)), -pendingVolumeDelta)
      if ((await readMedia()).audio.playbackRate !== before.audio.playbackRate) await rate(before.audio.playbackRate)
      if (readSetting()['player.togglePlayMethod'] !== before.setting.mode) await mode(before.setting.mode)
      if (before.audio.paused) { await click(control('player__pause')); await waitFor(async() => (await readMedia()).audio.paused, 'restore original pause state', 3000) }
      await click('document.querySelector("[data-action=detail-controls] [data-action=seek-progress]")', { ratio: before.audio.currentTime / before.audio.duration })
      await hide()
      const final = await readMedia()
      if (final.musicInfo.id !== before.musicInfo.id || final.audio.paused !== before.audio.paused || Math.abs(final.audio.volume - before.audio.volume) > 0.001 || final.audio.muted !== before.audio.muted || final.audio.playbackRate !== before.audio.playbackRate || readSetting()['player.togglePlayMethod'] !== initial['player.togglePlayMethod'] || Object.entries(bounds).some(([k, v]) => mainWindow.getBounds()[k] !== v)) throw new Error(`Detail restoration mismatch: ${JSON.stringify(final)}`)
      results.push({ action: 'restore', before, final, bounds, setting: readSetting() })
    }
    try {
      await context.bounded(restore(), 'detail full restoration', 20000)
    } catch (error) { failure ||= error; observations.push({ kind: 'play-detail-restoration-failure', message: String(error.stack || error) }) }
  }
  if (failure) throw failure
  checks.push({ kind: 'real-play-detail', results, unverified: ['physical sound-card output', 'all sound-effect algorithms', 'online lyrics/comments', 'Windows/macOS native behavior'] })
}
