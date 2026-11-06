const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource, forbiddenBoundary } = require('../helpers/load-source.cjs')

const loadSongList = httpFetch => loadSource('src/renderer/utils/musicSdk/kw/songList.js', {
  '../../request': { httpFetch },
  '../../index': {
    formatPlayTime: forbiddenBoundary('formatPlayTime'),
    decodeName: forbiddenBoundary('decodeName'),
  },
  './util': {
    formatSinger: forbiddenBoundary('formatSinger'),
    objStr2JSON: forbiddenBoundary('objStr2JSON'),
  },
  './album': {},
}).default

for (const [description, method, args, endpoint] of [
  ['playlist metadata', 'getListDetailMusicListByBDListInfo', ['123', 'BD'], '/api/service/playlist/info/123?'],
  ['user collection metadata', 'getListDetailMusicListByBDUserPub', ['456'], '/api/ucenter/users/pub/456?'],
]) {
  test(`Kuwo ${description} returns null when the metadata request fails`, async() => {
    const requested = []
    const songList = loadSongList(url => {
      requested.push(url)
      return { promise: Promise.reject(new Error('offline metadata request')) }
    })
    assert.equal(await songList[method](...args), null)
    assert.equal(requested.length, 1)
    assert.ok(requested[0].includes(endpoint))
  })

  test(`Kuwo ${description} returns null for an unsuccessful API response`, async() => {
    const songList = loadSongList(() => ({ promise: Promise.resolve({ body: { code: 500 } }) }))
    assert.equal(await songList[method](...args), null)
  })
}

test('Kuwo playlist metadata preserves the successful response fields', async() => {
  const songList = loadSongList(() => ({
    promise: Promise.resolve({
      body: {
        code: 200,
        data: { name: 'Local playlist', pic: 'cover.jpg', description: 'Saved songs', creatorName: 'June', playNum: 42 },
      },
    }),
  }))
  assert.deepEqual(await songList.getListDetailMusicListByBDListInfo('123', 'BD'), {
    name: 'Local playlist', img: 'cover.jpg', desc: 'Saved songs', author: 'June', play_count: 42,
  })
})

test('Kuwo user collection metadata preserves the successful response fields', async() => {
  const songList = loadSongList(() => ({
    promise: Promise.resolve({ body: { code: 200, data: { userInfo: { nickname: 'June', headImg: 'avatar.jpg' } } } }),
  }))
  assert.deepEqual(await songList.getListDetailMusicListByBDUserPub('456'), {
    name: 'June喜欢的音乐', img: 'avatar.jpg', desc: '', author: 'June', play_count: '',
  })
})
