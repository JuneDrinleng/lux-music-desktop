const { execFileSync } = require('node:child_process')

// Use trusted keyboard input on the original controls and observe actual audio.
// Never call a component handler, synthesize click(), or change media state.
module.exports = async function checkDetailKeyboard(context) {
  const { mainWindow, execute, readMedia, control, until, key, delay } = context
  const results = []
  const press = keyCode => {
    mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    mainWindow.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Enter' ? '\r' : ' ' })
    mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  }
  const focus = async(expression) => {
    await execute(`(${expression}).focus()`)
    key('Tab', ['shift'])
    key('Tab')
    await until(() => execute(`document.activeElement === ${expression} && document.activeElement.matches(':focus-visible')`), 'Tab focus reaches original detail button')
  }
  await execute(`(() => {
    const events = []; const listener = event => {
      const button = event.target.closest?.('[data-action=detail-controls] button');
      if (button) events.push({ type: event.type, code: event.code, trusted: event.isTrusted, defaultPrevented: event.defaultPrevented, label: button.getAttribute('aria-label') });
    };
    window.__detailKeyboardEvidence = { events, listener };
    for (const type of ['click', 'keyup']) document.addEventListener(type, listener);
  })()`)
  const resetEvents = () => execute('window.__detailKeyboardEvidence.events.length = 0')
  const checkEvents = async(input) => {
    await delay(100)
    const events = await execute('window.__detailKeyboardEvidence.events')
    const clicks = events.filter(event => event.type === 'click')
    if (clicks.length !== 1 || !clicks[0].trusted) throw new Error(`Detail ${input} must produce exactly one trusted native click: ${JSON.stringify(events)}`)
    if (input.includes('Space') && !events.some(event => event.type === 'keyup' && event.code === 'Space' && event.trusted && !event.defaultPrevented)) throw new Error(`Detail Space keyup was cancelled: ${JSON.stringify(events)}`)
    return events
  }
  try {
    for (const input of ['Enter', 'Space', 'OS Space']) {
      const before = await readMedia()
      const activate = () => input === 'OS Space'
        ? execFileSync('xdotool', ['key', '--clearmodifiers', 'space'], { timeout: 2000, stdio: 'ignore' })
        : press(input)
      for (let round = 0; round < 2; round++) {
        const paused = round === 0 ? !before.audio.paused : before.audio.paused
        await focus(control(paused ? 'player__pause' : 'player__play'))
        await resetEvents()
        activate()
        await until(async() => (await readMedia()).audio.paused === paused && await execute(`Boolean(${control(paused ? 'player__play' : 'player__pause')})`), `detail ${input} switches actual audio and matching label`)
        results.push({ input, round, events: await checkEvents(input), state: await readMedia() })
      }
    }
    for (const input of ['Enter', 'Space']) {
      const before = await readMedia()
      for (const action of ['next', 'prev']) {
        const previous = await readMedia()
        await focus(control(`player__${action}`))
        await resetEvents()
        press(input)
        await until(async() => {
          const state = await readMedia()
          return state.musicInfo.id !== previous.musicInfo.id && !state.audio.paused && decodeURIComponent(new URL(state.audio.currentSrc).pathname) === state.musicInfo.id
        }, `detail ${input} ${action} switches actual native resource`)
        results.push({ input, action, events: await checkEvents(input), state: await readMedia() })
      }
      const restored = await readMedia()
      if (restored.musicInfo.id !== before.musicInfo.id || restored.audio.paused !== before.audio.paused) throw new Error('Detail keyboard track check did not restore original playback')
    }
    return { action: 'native-keyboard-controls', results }
  } finally {
    await execute(`(() => {
      for (const type of ['click', 'keyup']) document.removeEventListener(type, window.__detailKeyboardEvidence.listener);
      delete window.__detailKeyboardEvidence;
    })()`)
  }
}
