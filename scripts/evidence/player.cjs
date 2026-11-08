const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const { dialog } = require('electron')
const createUiTools = require('./ui.cjs')

// A generated PCM file exercises metadata parsing, SQLite and the production
// media element. It is a software-pipeline fixture, not proof of loudspeakers.
const createWave = (frequency) => {
  const sampleRate = 16000
  const seconds = 45
  const samples = sampleRate * seconds
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index++) {
    const envelope = Math.min(index / 1600, (samples - index - 1) / 1600, 1)
    bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 1600 * envelope), 44 + index * 2)
  }
  return bytes
}

module.exports = async function runRealPlayerEvidence(context) {
  const { config, mainWindow, execute, waitFor, screenshot, navigate, bounded, checks, observations, stage, delay, readSetting } = context
  const deadline = performance.now() + 90000
  const originalPicker = dialog.showOpenDialog
  const initial = readSetting()
  const pickerCalls = []
  const mediaChecks = []
  const modeKeys = {
    listLoop: 'player__play_toggle_mode_list_loop',
    random: 'player__play_toggle_mode_random',
    list: 'player__play_toggle_mode_list',
    singleLoop: 'player__play_toggle_mode_single_loop',
    none: 'player__play_toggle_mode_off',
  }
  const fixtureDirectory = path.join(config.scratch, 'software-media-fixtures')
  fs.mkdirSync(fixtureDirectory, { recursive: true })
  const fixtures = [220, 330].map((frequency, index) => {
    const filePath = path.join(fixtureDirectory, `lux-software-evidence-${index + 1}.wav`)
    const bytes = createWave(frequency)
    fs.writeFileSync(filePath, bytes)
    return { filePath, frequency, durationSeconds: 45, sampleRate: 16000, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  const fixturePaths = fixtures.map(item => item.filePath)
  const wheelObservations = []
  const until = async(predicate, description) => {
    const remaining = Math.min(10000, deadline - performance.now())
    if (remaining <= 0) throw new Error(`Real media evidence exhausted its deadline: ${description}`)
    await waitFor(predicate, description, remaining)
  }
  const { target, click, i18nControl } = createUiTools({ execute, mainWindow })
  const readMedia = () => execute(`(() => {
    if (!Array.isArray(window.__luxEvidenceAudioElements)) throw new Error('Read-only native Audio observer was not installed before application startup');
    const elements = window.__luxEvidenceAudioElements;
    const audio = elements.find(el => { try { return ${JSON.stringify(fixturePaths)}.includes(decodeURIComponent(new URL(el.currentSrc || el.src).pathname)) } catch { return false } });
    return {
      audio: audio ? { src: audio.src, currentSrc: audio.currentSrc, paused: audio.paused, ended: audio.ended, currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null, readyState: audio.readyState, networkState: audio.networkState, volume: audio.volume, muted: audio.muted, error: audio.error ? { code: audio.error.code, message: audio.error.message } : null } : null,
      audioCount: elements.length, musicInfo: JSON.parse(JSON.stringify(window.lxData.musicInfo)),
      playInfo: JSON.parse(JSON.stringify(window.lxData.playInfo)), playMusicInfo: JSON.parse(JSON.stringify(window.lxData.playMusicInfo)), status: window.lxData.status.value,
      controls: { play: Boolean(${i18nControl('#player [aria-label]', 'player__play')}), pause: Boolean(${i18nControl('#player [aria-label]', 'player__pause')}) },
      setting: { volume: window.lxData.appSetting['player.volume'], mute: window.lxData.appSetting['player.isMute'], mode: window.lxData.appSetting['player.togglePlayMethod'], style: window.lxData.appSetting['common.playBarProgressStyle'] }
    };
  })()`)
  const pauseIfPlaying = async() => {
    const state = await readMedia()
    if (state.audio && !state.audio.paused) {
      await click(i18nControl('#player [aria-label]', 'player__pause'))
      await until(async() => (await readMedia()).audio?.paused === true, 'native media pause during cleanup')
    }
  }
  const closePopups = async() => {
    await click('document.querySelector("#toolbar input")')
    await until(() => execute('!Array.from(document.querySelectorAll("#root [aria-hidden=false]")).some(el => getComputedStyle(el).position === "absolute")'), 'native player popup closure')
  }
  const selectMode = async(mode) => {
    const current = await execute("window.lxData.appSetting['player.togglePlayMethod']")
    if (current === mode) return
    await click(i18nControl('#player [aria-label]', modeKeys[current] || modeKeys.none))
    const option = i18nControl('#root [aria-hidden=false] button', modeKeys[mode] || modeKeys.none)
    await until(() => execute(`Boolean(${option})`), 'real playback mode popup')
    await click(option)
    await until(async() => await execute(`window.lxData.appSetting['player.togglePlayMethod'] === ${JSON.stringify(mode)}`) && readSetting()['player.togglePlayMethod'] === mode, `real persisted playback mode ${mode}`)
    await closePopups()
  }
  const progressStyle = async(style) => {
    if (readSetting()['common.playBarProgressStyle'] === style) return
    await navigate('/setting')
    await click(i18nControl('#view [role=tab]', 'setting__basic'))
    const selector = `label[for="setting_basic_playbar_progress_style_${style}"]`
    await until(() => execute(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), 'original basic settings tab mounts progress-style control')
    await click(`document.querySelector(${JSON.stringify(selector)})`)
    await until(async() => await execute(`window.lxData.appSetting['common.playBarProgressStyle'] === ${JSON.stringify(style)}`) && readSetting()['common.playBarProgressStyle'] === style, `real persisted progress style ${style}`)
  }
  const wheel = async(point, deltaY) => {
    const count = await execute('window.__luxEvidenceMediaWheel.events.length')
    mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    mainWindow.webContents.sendInputEvent({ type: 'mouseWheel', x: point.x, y: point.y, deltaX: 0, deltaY })
    await until(() => execute(`window.__luxEvidenceMediaWheel.events.length > ${count}`), 'trusted native volume wheel event')
    const received = await execute('window.__luxEvidenceMediaWheel.events.at(-1)')
    if (!received.trusted || !received.deltaY) throw new Error(`Native wheel did not reach the real volume control: ${JSON.stringify(received)}`)
    wheelObservations.push({ requestedDeltaY: deltaY, received })
    return received
  }

  let failure
  let volumeWheelDelta
  try {
    stage('real media: create generated WAV files and preserve native controls')
    if (initial['common.fontSize'] !== 16 || initial['common.controlBtnPosition'] !== 'right' || initial['common.playBarProgressStyle'] !== 'mini' || initial['download.enable'] !== true) throw new Error('Real media phase requires the initial Linux font16/right/mini/download-enabled baseline')
    await progressStyle('middle')
    await selectMode('listLoop')
    await navigate('/list')
    await click('document.querySelector("#my-list .default-list")')
    await until(() => execute('location.hash.startsWith("#/list?id=default")'), 'actual default list selection')
    const before = await bounded(global.lx.worker.dbService.getListMusics('default'), 'real database before local import')
    if (before.some(item => fixturePaths.includes(item.id))) throw new Error('Media fixtures already existed before the import action')
    const expectedPickerTitle = await execute("window.i18n.t('lists__add_local_file_desc')")
    dialog.showOpenDialog = async(...args) => {
      const options = args.at(-1)
      if (options?.title !== expectedPickerTitle || !options?.properties?.includes('multiSelections') || !options?.filters?.some(item => item.extensions?.includes('wav'))) throw new Error('Unexpected native picker request during the local WAV import')
      pickerCalls.push({ title: options.title, properties: options.properties, filters: options.filters, returnedPaths: fixturePaths })
      return { canceled: false, filePaths: fixturePaths }
    }
    stage('real media: native context menu and original local-file import')
    await click('document.querySelector("#my-list .default-list")', { button: 'right' })
    const importOption = i18nControl('#root ul[aria-hidden=false] > li', 'lists__select_local_file')
    await until(() => execute(`Boolean(${importOption})`), 'actual list local-file context menu option')
    await click(importOption)
    await until(async() => {
      const list = await global.lx.worker.dbService.getListMusics('default')
      return fixturePaths.every(file => list.some(item => item.id === file && item.source === 'local' && item.meta.filePath === file))
    }, 'local worker metadata and SQLite list import')
    dialog.showOpenDialog = originalPicker
    if (pickerCalls.length !== 1) throw new Error(`Original file picker was not invoked exactly once: ${pickerCalls.length}`)
    const imported = (await global.lx.worker.dbService.getListMusics('default')).filter(item => fixturePaths.includes(item.id))
    if (imported.length !== 2 || imported.some(item => item.interval !== '00:45')) throw new Error(`Real worker did not parse both WAV durations: ${JSON.stringify(imported)}`)
    const first = imported[0]
    const second = imported[1]
    const firstRow = `Array.from(document.querySelectorAll('#my-list .list-item')).find(el => el.textContent.includes(${JSON.stringify(first.name)}))`
    await until(() => execute(`Boolean(${firstRow})`), 'actual imported local track row')
    mediaChecks.push({ action: 'local-file-import', pickerBoundary: 'only Electron OS picker return value replaced; original UI, renderer IPC, metadata worker and SQLite used', pickerCalls, imported, fixtures })
    stage('real media: native row double click starts production playback')
    await click(firstRow)
    await click(firstRow, { count: 2 })
    await until(async() => {
      const state = await readMedia()
      return state.audio && !state.audio.paused && state.audio.duration > 44.9 && state.audio.duration < 45.1 && state.audio.currentTime > 0.2 && state.controls.pause && !state.controls.play && state.musicInfo.id === first.id
    }, 'real WAV playback clock and pause control')
    const playing = await readMedia()
    await until(async() => (await readMedia()).audio.currentTime > playing.audio.currentTime + 0.25, 'real advancing HTMLAudioElement time')
    const advanced = await readMedia()
    mediaChecks.push({ action: 'playing', before: playing, after: advanced })
    await screenshot('media-real-playing.png', 'media', { fixtures, player: advanced })

    await click(i18nControl('#player [aria-label]', 'player__pause'))
    await until(async() => {
      const state = await readMedia()
      return state.audio?.paused === true && state.controls.play && !state.controls.pause
    }, 'real native pause and play control')
    const paused = await readMedia()
    await delay(250)
    const stillPaused = await readMedia()
    if (Math.abs(stillPaused.audio.currentTime - paused.audio.currentTime) > 0.1) throw new Error(`Paused native audio clock still advanced: ${JSON.stringify({ paused, stillPaused })}`)
    mediaChecks.push({ action: 'pause', before: paused, after: stillPaused })
    stage('real media: production progress mousedown/up seeks paused native media')
    await click('document.querySelector("#player [data-action=seek-progress]")', { ratio: 0.55 })
    await until(async() => {
      const state = await readMedia()
      return state.audio?.paused === true && Math.abs(state.audio.currentTime - state.audio.duration * 0.55) < 1.2
    }, 'real native seek via original progress control')
    const seeked = await readMedia()
    mediaChecks.push({ action: 'seek', expectedFraction: 0.55, before: stillPaused, after: seeked })
    await screenshot('media-real-paused-seek.png', 'media', { player: seeked })
    await click(i18nControl('#player [aria-label]', 'player__play'))
    await until(async() => {
      const state = await readMedia()
      return state.audio && !state.audio.paused && state.audio.currentTime > seeked.audio.currentTime + 0.1 && state.controls.pause
    }, 'resume real native media after seek')

    stage('real media: real next and previous buttons change native resources')
    for (const [action, expected] of [['next', second], ['prev', first]]) {
      await click(i18nControl('#player [aria-label]', `player__${action}`))
      await until(async() => {
        const state = await readMedia()
        return state.musicInfo.id === expected.id && state.audio && !state.audio.paused && decodeURIComponent(new URL(state.audio.currentSrc || state.audio.src).pathname) === expected.id && state.audio.duration === 45 && state.controls.pause
      }, `real ${action} switches both application track and native resource`)
      mediaChecks.push({ action, expectedId: expected.id, state: await readMedia() })
    }
    stage('real media: original volume and playback-mode controls update native state')
    await execute(`(() => {
      const events = [];
      const listener = event => { const button = event.target.closest('button'); events.push({ deltaY: event.deltaY, deltaMode: event.deltaMode, trusted: event.isTrusted, label: button?.getAttribute('aria-label'), at: performance.now() }) };
      window.__luxEvidenceMediaWheel = { events, listener };
      document.addEventListener('wheel', listener, { capture: true, passive: true });
    })()`)
    const volumeBefore = await readMedia()
    const volumeControl = i18nControl('#player [aria-label]', volumeBefore.audio.muted ? 'player__volume_muted' : 'player__volume', !volumeBefore.audio.muted)
    const volumePoint = await target(volumeControl)
    // Electron's input delta can have the opposite sign to DOM WheelEvent.
    // Observe a sub-step event first; the original control rounds to 1%, so
    // this calibration must leave native volume unchanged rather than guess.
    const calibration = await wheel(volumePoint, 1)
    if (Math.abs((await readMedia()).audio.volume - volumeBefore.audio.volume) > 0.001) throw new Error('Sub-step wheel calibration unexpectedly changed native volume')
    const desiredDomDelta = volumeBefore.audio.volume >= 0.02 ? 100 : -100
    volumeWheelDelta = desiredDomDelta * Math.sign(calibration.deltaY)
    const changedWheel = await wheel(volumePoint, volumeWheelDelta)
    if (Math.sign(changedWheel.deltaY) !== Math.sign(desiredDomDelta)) throw new Error(`Observed native wheel direction does not match the intended volume change: ${JSON.stringify(changedWheel)}`)
    await until(async() => {
      const state = await readMedia()
      return Math.abs(state.audio.volume - volumeBefore.audio.volume) > 0.01 && Math.abs(state.setting.volume - state.audio.volume) < 0.001 && Math.abs(readSetting()['player.volume'] - state.audio.volume) < 0.001
    }, 'real volume wheel changes native HTMLAudioElement and persisted setting')
    const volumeChanged = await readMedia()
    await closePopups()
    await click(i18nControl('#player [aria-label]', volumeChanged.audio.muted ? 'player__volume_muted' : 'player__volume', !volumeChanged.audio.muted))
    await until(() => execute('Boolean(document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]"))'), 'actual native volume popup')
    await click('document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]")')
    await until(async() => {
      const state = await readMedia()
      const expected = !volumeBefore.audio.muted
      return state.audio.muted === expected && state.setting.mute === expected && readSetting()['player.isMute'] === expected
    }, 'real mute checkbox changes native audio, renderer and persisted setting')
    const muted = { ...await readMedia(), persisted: { volume: readSetting()['player.volume'], mute: readSetting()['player.isMute'] } }
    await click('document.querySelector("#root [aria-hidden=false] label[for=player__volume_mute]")')
    await until(async() => {
      const state = await readMedia()
      return state.audio.muted === volumeBefore.audio.muted && state.setting.mute === volumeBefore.audio.muted && readSetting()['player.isMute'] === volumeBefore.audio.muted
    }, 'restore native, renderer and persisted mute by original checkbox')
    await closePopups()
    const restoreVolumePoint = await target(i18nControl('#player [aria-label]', volumeBefore.audio.muted ? 'player__volume_muted' : 'player__volume', !volumeBefore.audio.muted))
    await wheel(restoreVolumePoint, -volumeWheelDelta)
    await until(async() => {
      const state = await readMedia()
      return Math.abs(state.audio.volume - volumeBefore.audio.volume) < 0.001 && Math.abs(state.setting.volume - volumeBefore.audio.volume) < 0.001 && Math.abs(readSetting()['player.volume'] - volumeBefore.audio.volume) < 0.001
    }, 'restore native, renderer and persisted volume by original wheel control')
    volumeWheelDelta = null
    mediaChecks.push({ action: 'volume-and-mute', before: volumeBefore, changed: volumeChanged, muted, restored: { ...await readMedia(), persisted: { volume: readSetting()['player.volume'], mute: readSetting()['player.isMute'] } }, wheelObservations })
    await selectMode('random')
    const random = await readMedia()
    if (random.setting.mode !== 'random') throw new Error('Original mode control did not change actual player setting')
    await selectMode('listLoop')
    mediaChecks.push({ action: 'playback-mode', random, restored: await readMedia() })
    await screenshot('media-real-controls.png', 'media', { player: await readMedia() })
    checks.push({ kind: 'real-player', pipeline: 'generated PCM WAV → actual list menu → OS-picker boundary → real metadata worker → SQLite → native row/button input → production HTMLAudioElement', fixtures, results: mediaChecks, audioObservation: 'only read native elements from the constructor observer; no media method or property replaced', unverified: ['physical audio hardware and speakers', 'production online music services', 'full lyrics, sound effects, playback rate and desktop lyric behavior'] })
    observations.push({ kind: 'software-media-fixture-boundary', files: fixtures, verified: 'real local file metadata, SQLite list persistence, native audio clock/pause/seek/resource transitions and original playback controls', unverified: 'audible speaker output; generated tones are evidence fixtures, not user media' })
  } catch (error) {
    failure = error
    observations.push({ kind: 'real-player-failure', message: String(error.stack || error), results: mediaChecks, pickerCalls, wheelObservations, native: await readMedia().catch(error => ({ observationError: String(error) })) })
  } finally {
    dialog.showOpenDialog = originalPicker
    try {
      await execute('(() => { if (window.__luxEvidenceMediaWheel) { document.removeEventListener("wheel", window.__luxEvidenceMediaWheel.listener, { capture: true }); delete window.__luxEvidenceMediaWheel } })()')
      await pauseIfPlaying()
      if (volumeWheelDelta) observations.push({ kind: 'media-volume-cleanup-incomplete', pendingWheelDelta: volumeWheelDelta })
      await selectMode(initial['player.togglePlayMethod'])
      await progressStyle('mini')
      await navigate('/list')
      const final = readSetting()
      if (final['common.fontSize'] !== 16 || final['common.controlBtnPosition'] !== 'right' || final['common.playBarProgressStyle'] !== 'mini' || final['download.enable'] !== true) failure ||= new Error('Media phase did not preserve the standard settings baseline')
    } catch (error) {
      failure ||= error
      observations.push({ kind: 'media-cleanup-failure', message: String(error.stack || error) })
    }
  }
  if (failure) throw failure
}
