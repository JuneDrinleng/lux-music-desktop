const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource, forbiddenBoundary } = require('../helpers/load-source.cjs')

const { mapHttpTask } = loadSource('src/renderer/utils/request.js', {
  needle: { request: forbiddenBoundary('Needle transport') },
  './env': { debugRequest: false },
  './message': { requestMsg: { cancelRequest: 'fixture cancellation' } },
  './musicSdk/options': { bHh: 'fixture-header' },
  '@renderer/store': { proxy: {} },
  tunnel: { httpOverHttp: forbiddenBoundary('HTTP proxy'), httpsOverHttp: forbiddenBoundary('HTTPS proxy') },
})

test('HTTP payload mapping retains the original handle and live cancellation state', async() => {
  let cancelled = 0
  const task = {
    isCancelled: false,
    requestObj: { fixture: true },
    promise: Promise.resolve({ body: 'lyric payload' }),
    cancelHttp() { task.isCancelled = true; cancelled++ },
  }
  const originalRequest = task.requestObj
  const mapped = mapHttpTask(task, response => response.body.toUpperCase())
  assert.equal(mapped, task)
  assert.equal(mapped.requestObj, originalRequest)
  assert.equal(await mapped.promise, 'LYRIC PAYLOAD')
  mapped.cancelHttp()
  assert.equal(task.isCancelled, true)
  assert.equal(cancelled, 1)
})

test('Kugou lyric download retries the download endpoint with the same lyric ID, key, and format', async() => {
  const urls = []
  const lyricText = '[00:00.00]Offline lyric fixture'
  const lyric = loadSource('src/renderer/utils/musicSdk/kg/lyric.js', {
    '../../request': {
      mapHttpTask,
      httpFetch(url) {
        urls.push(new URL(url))
        return {
          promise: Promise.resolve({
            statusCode: urls.length < 3 ? 503 : 200,
            body: { fmt: 'lrc', content: Buffer.from(lyricText).toString('base64') },
          }),
          cancelHttp() {},
        }
      },
    },
    '@common/utils/lyricUtils/kg': { decodeKrc: forbiddenBoundary('KRC decoder for LRC fixture') },
  }).default
  const result = await lyric.getLyricDownload('fixture-id', 'fixture-key', 'lrc').promise
  assert.equal(result.lyric, lyricText)
  assert.equal(urls.length, 3)
  for (const url of urls) {
    assert.equal(url.pathname, '/download')
    assert.equal(url.searchParams.get('id'), 'fixture-id')
    assert.equal(url.searchParams.get('accesskey'), 'fixture-key')
    assert.equal(url.searchParams.get('fmt'), 'lrc')
  }
})

test('Kugou lyric download stops after bounded failed retries', async() => {
  let attempts = 0
  const lyric = loadSource('src/renderer/utils/musicSdk/kg/lyric.js', {
    '../../request': {
      mapHttpTask,
      httpFetch() {
        attempts++
        return { promise: Promise.resolve({ statusCode: 503 }), cancelHttp() {} }
      },
    },
    '@common/utils/lyricUtils/kg': { decodeKrc: forbiddenBoundary('KRC decoder on failed response') },
  }).default
  await assert.rejects(lyric.getLyricDownload('fixture-id', 'fixture-key', 'lrc').promise, /歌词获取失败/)
  assert.equal(attempts, 7)
})

test('Migu bulk lookup awaits all ID batches and preserves song order across the 100-ID boundary', async() => {
  const batches = []
  const { getMusicInfos, getMusicInfo } = loadSource('src/renderer/utils/musicSdk/mg/musicInfo.js', {
    '../../index': { sizeFormate: forbiddenBoundary('quality formatting for no-quality fixture'), formatPlayTime: forbiddenBoundary('V5 time formatting') },
    './utils': {
      async createHttpFetch(_url, options) {
        const ids = options.form.resourceId.split('|')
        batches.push(ids)
        return {
          resource: ids.map(id => ({ songId: id, copyrightId: id, songName: `Song ${id}`, artists: [{ name: 'Fixture artist' }], album: 'Fixture album', albumId: 'fixture-album', length: '03:30' })),
        }
      },
    },
    '../utils': { formatSingerName: artists => artists.map(artist => artist.name).join('、') },
  })
  const ids = Array.from({ length: 101 }, (_, index) => String(index + 1))
  const songs = await getMusicInfos(ids)
  assert.deepEqual(batches.map(batch => batch.length), [100, 1])
  assert.deepEqual(songs.map(song => song.copyrightId), ids)
  assert.equal(songs[100].name, 'Song 101')
  assert.equal(songs[100].singer, 'Fixture artist')
  assert.equal(songs[100].interval, '03:30')
  const one = await getMusicInfo('one')
  assert.equal(one.copyrightId, 'one')
})
