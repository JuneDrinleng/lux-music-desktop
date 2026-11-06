const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')

const { filterMusicList, toNewMusicInfo, toOldMusicInfo, fixNewMusicInfoQuality, formatMusicName } = loadSource('src/common/utils/tools.ts')

test('music list keeps the first valid occurrence of each ID and its original order', () => {
  const first = { id: 'kw_1', name: 'One', singer: 'A' }
  const second = { id: 'tx_2', name: 'Two', singer: 'B' }
  const list = [first, { ...first, name: 'Duplicate' }, { id: '', name: 'No ID' }, { id: 'bad', name: '' }, second]
  assert.deepEqual(filterMusicList(list), [first, second])
  assert.equal(list.length, 5, 'cleaning does not splice the input list')
})

test('an invalid first occurrence does not hide a later valid song with the same ID', () => {
  const valid = { id: 'one', name: 'One', singer: '' }
  assert.deepEqual(filterMusicList([{ id: 'one', name: '', singer: 'A' }, valid]), [valid])
})

test('missing singers are normalized while already provided singers are retained', () => {
  const items = [
    { id: 'one', name: 'One', singer: null },
    { id: 'two', name: 'Two' },
    { id: 'three', name: 'Three', singer: '歌手' },
  ]
  assert.deepEqual(filterMusicList(items).map(item => item.singer), ['', '', '歌手'])
  assert.deepEqual(filterMusicList([]), [])
})

test('legacy local music migration preserves the path, filename extension, and display fields', () => {
  const old = { source: 'local', songmid: '/music/夜曲.flac', name: '夜曲', singer: '歌手', interval: '04:12', albumName: '专辑', img: '' }
  const current = toNewMusicInfo(old)
  assert.deepEqual(current, {
    id: 'local_/music/夜曲.flac',
    name: '夜曲',
    singer: '歌手',
    source: 'local',
    interval: '04:12',
    meta: { songId: '/music/夜曲.flac', albumName: '专辑', picUrl: '', filePath: '/music/夜曲.flac', ext: 'flac' },
  })
  const restored = toOldMusicInfo(current)
  for (const field of ['songmid', 'name', 'singer', 'source', 'interval', 'albumName']) assert.equal(restored[field], old[field])
  assert.equal(restored.filePath, old.songmid)
  assert.deepEqual(restored.types, [])
})

test('legacy Kugou IDs retain the hash that distinguishes song versions', () => {
  const current = toNewMusicInfo({
    source: 'kg',
    songmid: '123',
    name: 'Song',
    singer: 'Singer',
    interval: '03:00',
    albumName: 'Album',
    img: 'cover.jpg',
    types: [{ type: '320k' }],
    _types: { '320k': { size: '7 MB' } },
    hash: 'HASH',
    albumAudioId: 'a1',
  })
  assert.equal(current.id, '123_HASH')
  assert.equal(current.meta.hash, 'HASH')
  const restored = toOldMusicInfo(current)
  assert.equal(restored.songmid, '123')
  assert.equal(restored.hash, 'HASH')
  assert.equal(restored.albumAudioId, 'a1')
  assert.deepEqual(restored._types, { '320k': { size: '7 MB' } })
})

test('legacy Tencent migration retains media and album IDs needed for playback', () => {
  const old = {
    source: 'tx',
    songmid: 'mid',
    name: 'Song',
    singer: 'Singer',
    types: [],
    _types: {},
    strMediaMid: 'media-mid',
    songId: 42,
    albumMid: 'album-mid',
    albumId: 'album-id',
  }
  const restored = toOldMusicInfo(toNewMusicInfo(old))
  for (const field of ['strMediaMid', 'songId', 'albumMid', 'albumId']) assert.equal(restored[field], old[field])
})

test('old FLAC32 quality tags migrate to FLAC24 without losing size metadata', () => {
  const quality = { size: '30 MB' }
  const music = { source: 'kw', meta: { _qualitys: { flac32bit: quality }, qualitys: [{ type: 'flac32bit', size: '30 MB' }] } }
  assert.equal(fixNewMusicInfoQuality(music), music)
  assert.deepEqual(music.meta._qualitys, { flac24bit: quality })
  assert.deepEqual(music.meta.qualitys, [{ type: 'flac24bit', size: '30 MB' }])
  assert.equal(fixNewMusicInfoQuality(music), music, 'migration is idempotent')
})

test('local music quality repair does not access online-only metadata', () => {
  const music = { source: 'local', meta: { filePath: '/music/song.mp3' } }
  assert.equal(fixNewMusicInfoQuality(music), music)
})

test('download filenames substitute song and singer names including Unicode', () => {
  assert.equal(formatMusicName('歌手 - 歌名', '夜曲', '周杰伦'), '周杰伦 - 夜曲')
  assert.equal(formatMusicName('歌名', 'Song', ''), 'Song')
})
