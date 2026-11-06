const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')

// Loading this browser module only needs its clock binding. The tested methods
// operate on the real class prototype, without constructing DOM or animations.
const previousWindow = globalThis.window
let FontPlayer
try {
  globalThis.window = { performance }
  FontPlayer = loadSource('src/common/utils/lyric-font-player/font-player.js').default
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}

test('changing playback speed before lyric fonts exist updates the rate without throwing', () => {
  const player = Object.assign(Object.create(FontPlayer.prototype), { fonts: [], isPlay: true, _rate: 1 })
  assert.doesNotThrow(() => player.setPlaybackRate(1.5))
  assert.equal(player._rate, 1.5)
})

test('changing active lyric playback speed resumes at the current lyric time', () => {
  const played = []
  const player = Object.assign(Object.create(FontPlayer.prototype), {
    fonts: [{}],
    isPlay: true,
    _rate: 1,
    _currentTime: () => 1234,
    play: time => played.push(time),
  })
  player.setPlaybackRate(2)
  assert.equal(player._rate, 2)
  assert.deepEqual(played, [1234])
})

test('changing paused lyric playback speed keeps playback paused', () => {
  const player = Object.assign(Object.create(FontPlayer.prototype), {
    fonts: [{}],
    isPlay: false,
    _rate: 1,
    play: () => assert.fail('a paused player must stay paused'),
  })
  player.setPlaybackRate(0.75)
  assert.equal(player._rate, 0.75)
})

test('pausing at the final lyric font stops timers and animation without searching past the end', () => {
  const fonts = [{ text: '夜' }, { text: '曲' }]
  const paused = []
  let cleared = 0
  const player = Object.assign(Object.create(FontPlayer.prototype), {
    fonts,
    isPlay: true,
    curFontNum: 1,
    maxFontNum: 1,
    timeoutTools: { clear: () => { cleared++ } },
    waitPlayTimeout: { clear: () => { cleared++ } },
    _handlePauseFont: font => paused.push(font),
    _findcurFontNum: () => assert.fail('the last font is already selected'),
  })
  player.pause()
  assert.equal(player.isPlay, false)
  assert.equal(cleared, 2)
  assert.deepEqual(paused, [fonts[1]])
})
