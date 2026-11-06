const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource, forbiddenBoundary } = require('../helpers/load-source.cjs')

const { filterMusicList, sortListMusicInfo, filterDuplicateMusic, searchListMusic, createSortedList } = loadSource('src/renderer/worker/main/list.ts', {
  '@common/utils/nodejs': {
    joinPath: forbiddenBoundary('filesystem path export'),
    saveStrToFile: forbiddenBoundary('filesystem export'),
  },
  '@renderer/utils/music': { createLocalMusicInfo: forbiddenBoundary('file metadata read') },
})

const music = (id, fields = {}) => ({ id, name: id, singer: 'Singer', source: 'kw', interval: '03:00', meta: {}, ...fields })
const ids = list => list.map(item => item.id)
const noDislikes = () => ({ musicNames: new Set(), singerNames: new Set(), names: new Set() })

test('playlist duration sorting uses elapsed time rather than lexical string order', async() => {
  const list = [music('hour', { interval: '01:00:00' }), music('short', { interval: '2:05' }), music('ten', { interval: '10:00' }), music('missing', { interval: undefined })]
  assert.equal(await sortListMusicInfo(list, 'up', 'interval', 'en'), list)
  assert.deepEqual(ids(list), ['missing', 'short', 'ten', 'hour'])
  assert.deepEqual(ids(await sortListMusicInfo(list, 'down', 'interval', 'en')), ['hour', 'ten', 'short', 'missing'])
})

test('playlist name sorting supports both directions and preserves equal-title order', async() => {
  const list = [music('z', { name: 'Zulu' }), music('a1', { name: 'Alpha' }), music('a2', { name: 'Alpha' })]
  assert.deepEqual(ids(await sortListMusicInfo(list, 'up', 'name', 'en')), ['a1', 'a2', 'z'])
  assert.deepEqual(ids(await sortListMusicInfo(list, 'down', 'name', 'en')), ['z', 'a1', 'a2'])
})

test('playlist album sorting reads nested metadata and handles missing album names', async() => {
  const list = [music('b', { meta: { albumName: 'Beta' } }), music('none'), music('a', { meta: { albumName: 'Alpha' } })]
  assert.deepEqual(ids(await sortListMusicInfo(list, 'up', 'albumName', 'en')), ['none', 'a', 'b'])
  assert.deepEqual(ids(await sortListMusicInfo(list, 'down', 'albumName', 'en')), ['b', 'a', 'none'])
})

test('random playlist ordering retains every original song exactly once', async() => {
  const list = Array.from({ length: 100 }, (_, index) => music(String(index)))
  const originals = new Set(list)
  assert.equal(await sortListMusicInfo(list, 'random', 'name', 'en'), list)
  assert.equal(list.length, originals.size)
  assert.deepEqual(new Set(list), originals)
})

test('duplicate detection groups live/explicit variants without including unique songs', async() => {
  const list = [music('one', { name: 'Song (Live)' }), music('unique', { name: 'Another' }), music('two', { name: 'song' }), music('three', { name: 'Song（Explicit）' })]
  const result = await filterDuplicateMusic(list)
  assert.deepEqual(result.map(({ id, index }) => ({ id, index })), [{ id: 'one', index: 0 }, { id: 'two', index: 2 }, { id: 'three', index: 3 }])
  assert.equal(result[0].musicInfo, list[0], 'duplicate review retains original song metadata')
  assert.equal(list.length, 4, 'reviewing duplicates does not delete songs')
})

test('disabling variant filtering keeps live versions distinct while matching case/outer spaces', async() => {
  const list = [music('live', { name: 'Song (Live)' }), music('studio', { name: 'song' }), music('copy', { name: ' SONG ' })]
  assert.deepEqual((await filterDuplicateMusic(list, false)).map(item => item.id), ['studio', 'copy'])
})

test('search ranks title, artist, album, then fuzzy matches without duplicate results', () => {
  const list = [
    music('fuzzy', { name: 'coat' }),
    music('artist', { name: 'Other', singer: 'CAT artist' }),
    music('album', { name: 'Different', meta: { albumName: 'Cat album' } }),
    music('title', { name: 'Cat song', singer: 'Cat artist' }),
    music('unrelated', { name: 'Dog' }),
  ]
  assert.deepEqual(ids(searchListMusic(list, 'cat')), ['title', 'artist', 'album', 'fuzzy'])
})

test('playlist search treats regular expression characters as literal text', () => {
  const list = [music('literal', { name: 'A[1].*' }), music('other', { name: 'Anything' })]
  assert.deepEqual(ids(searchListMusic(list, '[1].*')), ['literal'])
  assert.deepEqual(searchListMusic(list, 'not found'), [])
})

test('moving songs preserves the requested selection order and leaves the input list intact', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map(id => music(id))
  assert.deepEqual(ids(createSortedList(list, 1, ['d', 'b'])), ['a', 'd', 'b', 'c', 'e'])
  assert.deepEqual(ids(list), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(ids(createSortedList(list, 100, ['a', 'b'])), ['c', 'd', 'e', 'a', 'b'])
})

test('play queue ignores history from other lists and temporary playback entries', async() => {
  const list = ['a', 'b', 'c', 'd'].map(id => music(id))
  const result = await filterMusicList({
    listId: 'current',
    list,
    playerMusicInfo: list[1],
    dislikeInfo: noDislikes(),
    isNext: true,
    playedList: [
      { listId: 'current', musicInfo: list[0], isTempPlay: false },
      { listId: 'other', musicInfo: list[1], isTempPlay: false },
      { listId: 'current', musicInfo: list[2], isTempPlay: true },
    ],
  })
  assert.deepEqual(ids(result.filteredList), ['b', 'c', 'd'])
  assert.deepEqual(ids(result.canPlayList), ['a', 'b', 'c', 'd'])
  assert.equal(result.playerIndex, 0)
})

test('play queue excludes disliked names/artists/pairs after normalizing case and spaces', async() => {
  const list = [music('name', { name: ' BANNED ' }), music('artist', { singer: ' BANNED ARTIST ' }), music('pair', { name: 'Song', singer: 'Artist' }), music('keep')]
  const result = await filterMusicList({
    listId: 'current',
    list,
    playedList: [],
    isNext: true,
    dislikeInfo: { musicNames: new Set(['banned']), singerNames: new Set(['banned artist']), names: new Set(['song@artist']) },
  })
  assert.deepEqual(ids(result.filteredList), ['keep'])
  assert.deepEqual(ids(result.canPlayList), ['keep'])
})

test('play queue admits only completed downloads', async() => {
  const incomplete = { ...music('pending'), progress: 0.5, isComplate: false }
  const completed = { ...music('done'), progress: 1, isComplate: true }
  const result = await filterMusicList({ listId: 'current', list: [incomplete, completed], playedList: [], dislikeInfo: noDislikes(), isNext: true })
  assert.deepEqual(ids(result.filteredList), ['done'])
})

test('exhausted play history retains the full playable list and current song index', async() => {
  const list = ['a', 'b'].map(id => music(id))
  const result = await filterMusicList({
    listId: 'current',
    list,
    playerMusicInfo: list[1],
    dislikeInfo: noDislikes(),
    isNext: true,
    playedList: list.map(musicInfo => ({ listId: 'current', musicInfo, isTempPlay: false })),
  })
  assert.deepEqual(result.filteredList, [])
  assert.deepEqual(ids(result.canPlayList), ['a', 'b'])
  assert.equal(result.playerIndex, 1)
})

test('disliking the current song removes it without skipping the next available song', async() => {
  const list = ['a', 'b', 'c'].map(id => music(id))
  const dislikeInfo = noDislikes()
  dislikeInfo.musicNames.add('b')
  const result = await filterMusicList({ listId: 'current', list, playerMusicInfo: list[1], playedList: [], dislikeInfo, isNext: true })
  assert.deepEqual(ids(result.filteredList), ['a', 'c'])
  assert.equal(result.playerIndex, 0, 'the player increments this index to select c')
})
