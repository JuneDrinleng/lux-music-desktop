const { execFile } = require('node:child_process')
const { performance } = require('node:perf_hooks')

// Two priming motions establish a real native drag before measured travel.
module.exports = async function runNativeDragEvidence(context) {
  if (process.platform !== 'linux' || process.env.LUX_EVIDENCE_PRIVATE_DBUS !== '1' || !process.env.DBUS_SESSION_BUS_ADDRESS || !process.env.DISPLAY) throw new Error('Native drag requires the owned private Linux Xvfb/D-Bus/WM session')
  const { mainWindow, execute, waitFor, screenshot, flushPaint, delay, checks, observations, stage } = context
  const windowState = () => ({ resizable: mainWindow.isResizable(), fullscreen: mainWindow.isFullScreen(), minimized: mainWindow.isMinimized(), visible: mainWindow.isVisible(), focused: mainWindow.isFocused() })
  const fixedActive = state => state.resizable === false && !state.fullscreen && !state.minimized && state.visible && state.focused
  const results = []
  const xid = mainWindow.getNativeWindowHandle().readUInt32LE(0).toString()
  const dragPoint = scope => execute(`(() => {
    const region = document.querySelector(${JSON.stringify(scope)});
    if (!region) throw new Error('Original drag region missing');
    const r = region.getBoundingClientRect();
    const effective = el => { while (el) { const value = getComputedStyle(el).getPropertyValue('-webkit-app-region'); if (value && value !== 'none') return value; el = el.parentElement } return 'none' };
    const candidates = [region, ...region.children].map(el => { const box = el.getBoundingClientRect(); return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) } });
    for (let y = Math.ceil(r.top + 24); y < r.bottom - 16; y += 16) for (let x = Math.ceil(r.left + 24); x < r.right - 16; x += 16) candidates.push({ x, y });
    for (const { x, y } of candidates) {
      const hit = document.elementFromPoint(x, y);
      if (x >= 16 && y >= 16 && x < innerWidth - 16 && y < innerHeight - 16 && hit && region.contains(hit) && !hit.closest('button,input,a,label,[role=tab]') && effective(hit) === 'drag') return { x, y, scope: ${JSON.stringify(scope)}, hitTag: hit.tagName, hitText: hit.innerText.slice(0, 80), appRegion: 'drag' };
    }
    throw new Error('No actual original drag point; native drag cannot be skipped');
  })()`)
  for (const scope of ['#left', '#toolbar']) {
    const started = performance.now()
    const deadline = started + 20000
    const attempt = { kind: 'native-drag-attempt', scope, nativeWindowId: xid, originalBefore: mainWindow.getBounds(), windowStateBefore: windowState(), priming: [], travel: [], commands: [] }
    observations.push(attempt)
    const remaining = () => Math.max(0, deadline - performance.now())
    const budget = description => {
      const timeout = Math.floor(remaining())
      if (timeout <= 0) throw new Error(`Native gesture exceeded its20000ms case budget during ${description}`)
      return timeout
    }
    // Only query/paint/timer/poll promises race a deadline. They cannot start
    // native input after timeout; the awaited control flow stops here.
    const readOnly = async(operation, description, limit = Infinity) => {
      const timeout = Math.min(limit, budget(description))
      let timer
      try {
        const result = await Promise.race([
          Promise.resolve().then(operation),
          new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Native gesture timed out during ${description}`)), timeout) }),
        ])
        budget(description)
        return result
      } finally { clearTimeout(timer) }
    }
    const pause = () => readOnly(() => delay(50), 'input settling delay')
    const command = async(args, cleanup = false) => {
      const timeout = cleanup ? 2000 : Math.min(2000, budget(args[0]))
      const record = { args, timeout }
      attempt.commands.push(record)
      // Do not race this promise: execFile kills a timed-out owned child, and
      // its callback must complete before finally can issue mouseup.
      const result = await new Promise((resolve, reject) => {
        const child = execFile('xdotool', args, { timeout, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
          Object.assign(record, { pid: child.pid ?? null, stdout, stderr, code: error ? error.code ?? null : 0, signal: error?.signal ?? null, killed: error?.killed ?? false })
          if (error) reject(error)
          else resolve(stdout.trim())
        })
      })
      if (!cleanup) budget(args[0])
      return result
    }
    const sample = async(cleanup = false) => ({ bounds: mainWindow.getBounds(), pointer: await command(['getmouselocation', '--shell'], cleanup) })
    const same = (a, b) => Object.keys(a).every(key => a[key] === b[key])
    const stable = async(predicate, description) => {
      let previous; let repeats = 0
      const timeout = Math.min(3000, budget(description))
      await readOnly(() => waitFor(() => {
        budget(description)
        const bounds = mainWindow.getBounds()
        if (bounds.width !== attempt.originalBefore.width || bounds.height !== attempt.originalBefore.height) throw new Error('Native drag resized the window instead of preserving its dimensions')
        if (!predicate(bounds)) { previous = bounds; repeats = 0; return false }
        repeats = previous && same(previous, bounds) ? repeats + 1 : 0
        previous = bounds
        return repeats >= 3
      }, description, timeout), description, timeout)
      budget(description)
      return mainWindow.getBounds()
    }
    let inputFailure
    try {
      if (!fixedActive(attempt.windowStateBefore)) throw new Error('Native gesture requires the original fixed, active, nonfullscreen window')
      stage(`native drag: actual priming and measured travel for ${scope}`)
      attempt.point = await readOnly(() => dragPoint(scope), 'renderer drag point query')
      attempt.paint = await readOnly(flushPaint, 'renderer paint')
      if (!(attempt.paint.secondFrameTime > attempt.paint.firstFrameTime)) throw new Error('Native drag requires two real renderer frames')
      attempt.originalBefore = mainWindow.getBounds()
      attempt.nativeGeometry = await command(['getwindowgeometry', '--shell', xid])
      await command(['mousemove', '--sync', '--window', xid, String(attempt.point.x), String(attempt.point.y)])
      attempt.pointerBefore = await sample()
      try {
        await command(['mousedown', '1'])
        await pause()
        for (let index = 0; index < 2; index++) {
          await command(['mousemove_relative', '--sync', '10', '5'])
          await pause()
          attempt.priming.push({ step: index + 1, ...await sample() })
        }
        attempt.beforeTravel = await stable(bounds => bounds.x !== attempt.originalBefore.x || bounds.y !== attempt.originalBefore.y, `actual ${scope} drag must move and stabilize during priming`)
        attempt.pointerBeforeTravel = await sample()
        for (let index = 0; index < 4; index++) {
          await command(['mousemove_relative', '--sync', '10', '5'])
          await pause()
          attempt.travel.push({ step: index + 1, ...await sample() })
        }
        attempt.afterTravel = await stable(bounds => bounds.x - attempt.beforeTravel.x === 40 && bounds.y - attempt.beforeTravel.y === 20, `actual ${scope} measured window travel must be40x20`)
      } catch (error) {
        inputFailure = error
      } finally {
        try { await command(['mouseup', '1'], true) } catch (error) {
          observations.push({ kind: 'native-drag-release-failure', scope, message: String(error.stack || error) })
          inputFailure ||= error
        }
        try { attempt.afterRelease = await sample(true) } catch (error) {
          observations.push({ kind: 'native-drag-release-observation-failure', scope, message: String(error.stack || error) })
          inputFailure ||= error
        }
      }
      if (inputFailure) throw inputFailure
      await stable(bounds => same(bounds, attempt.afterTravel), 'actual measured window position stays stable after pointer release')
      attempt.totalWindowDelta = { x: attempt.afterTravel.x - attempt.originalBefore.x, y: attempt.afterTravel.y - attempt.originalBefore.y }
      attempt.inputBoundary = 'two10x5 priming steps plus four10x5 measured steps: total pointer motion60x30; only after-beforeTravel is asserted40x20; no programmatic movement before success'
      budget('restore original position')
      mainWindow.setPosition(attempt.originalBefore.x, attempt.originalBefore.y)
      budget('restore original position')
      attempt.restored = await stable(bounds => bounds.x === attempt.originalBefore.x && bounds.y === attempt.originalBefore.y, 'restore original position only after successful actual native travel and release')
      attempt.windowStateAfter = windowState()
      if (!fixedActive(attempt.windowStateAfter)) throw new Error('Native gesture changed the fixed active window state')
      budget('record native window state')
      attempt.elapsedMs = performance.now() - started
      results.push({ scope, windowStateBefore: attempt.windowStateBefore, windowStateAfter: attempt.windowStateAfter, originalBefore: attempt.originalBefore, beforeTravel: attempt.beforeTravel, afterTravel: attempt.afterTravel, restored: attempt.restored, totalWindowDelta: attempt.totalWindowDelta })
    } catch (error) {
      Object.assign(attempt, { failed: true, failure: String(error.stack || error), finalBounds: mainWindow.isDestroyed() ? null : mainWindow.getBounds(), elapsedMs: performance.now() - started })
      throw error
    }
  }
  checks.push({ kind: 'original-native-window-drag', results, scope: 'real XTest on original app regions; owned private WM identity and process cleanup verified by outer driver; Windows/macOS unverified' })
  await screenshot('window-native-drag.png', 'window-native-drag', { results })
}
