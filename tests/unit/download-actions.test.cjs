const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const vue = require('vue')

// Exercise the original download hooks; replace only router/player/OS I/O.
test('download single/bulk actions, file guard, search and source detail preserve their payloads', async() => {
  const calls = []
  const list = vue.ref([0, 1].map(id => ({ id: `task-${id}`, metadata: { filePath: `/fixture/${id}.wav`, musicInfo: { name: `song-${id}`, singer: 'singer', source: 'kw' } } })))
  const selectedList = vue.ref([...list.value])
  const clear = () => { calls.push(['clear']); selectedList.value = [] }
  const actions = loadSource('src/renderer/views/Download/useTaskActions.js', {
    '@common/utils/vueRouter': { useRouter: () => ({ push: value => calls.push(['route', value]) }) },
    '@renderer/utils/musicSdk': { kw: { getMusicDetailPageUrl: info => `https://fixture.invalid/${info.name}` } },
    '@common/utils/electron': { openUrl: url => calls.push(['url', url]) },
    '@common/utils/nodejs': { checkPath: file => file === '/fixture/0.wav' },
    '@renderer/utils/index': { toOldMusicInfo: value => value },
    '@renderer/utils/ipc': { openDirInExplorer: file => calls.push(['file', file]) },
    '@renderer/store/download/action': Object.fromEntries(['start', 'pause', 'remove'].map(action => [`${action}DownloadTasks`, items => calls.push([action, items.map(item => typeof item === 'string' ? item : item.id)])])),
  }).default({ list, selectedList, removeAllSelect: clear })
  for (const action of ['Start', 'Pause', 'Remove']) {
    selectedList.value = [...list.value]
    await actions[`handle${action}Task`](1, true)
    assert.deepEqual(calls.pop(), [action.toLowerCase(), ['task-1']])
    assert.equal(selectedList.value.length, 2)
    await actions[`handle${action}Task`](0)
    assert.deepEqual(calls.splice(0), [[action.toLowerCase(), ['task-0', 'task-1']], ['clear']])
    assert.equal(selectedList.value.length, 0)
  }
  await actions.handleOpenFile(1)
  assert.equal(calls.length, 0, 'missing file does not reach the shell')
  await actions.handleOpenFile(0)
  actions.handleSearch(1)
  actions.handleOpenMusicDetail(0)
  assert.deepEqual(calls, [['file', '/fixture/0.wav'], ['route', { path: '/search', query: { text: 'song-1 singer' } }], ['url', 'https://fixture.invalid/song-0']])
})

test('download play maps filtered rows to full list; play-later and add-to retain single/bulk behavior', async() => {
  const calls = []
  const first = { id: 'first', metadata: { musicInfo: { id: 'music-first' } } }
  const second = { id: 'second', metadata: { musicInfo: { id: 'music-second' } } }
  const list = vue.ref([second])
  const listAll = vue.ref([first, second])
  const selectedList = vue.ref([first, second])
  const removeAllSelect = () => { selectedList.value = [] }
  const player = loadSource('src/renderer/views/Download/usePlay.js', {
    '@renderer/store/player/action': { addTempPlayList: items => calls.push(items) },
    '@renderer/core/player': { playList: (...args) => calls.push(args) },
    '@common/constants': { LIST_IDS: { DOWNLOAD: 'download' } },
  }).default({ selectedList, list, listAll, removeAllSelect })
  player.handlePlayMusic(0)
  assert.deepEqual(calls.pop(), ['download', 1])
  player.handlePlayMusicLater(0, true)
  assert.equal(calls.pop()[0].musicInfo.id, 'second')
  assert.equal(selectedList.value.length, 2)
  player.handlePlayMusicLater(0)
  assert.deepEqual(calls.pop().map(item => [item.listId, item.musicInfo.id]), [['download', 'first'], ['download', 'second']])
  assert.equal(selectedList.value.length, 0)
  const add = loadSource('src/renderer/views/Download/useMusicAdd.js', { '@common/utils/vueTools': vue }).default({ selectedList, list })
  add.handleShowMusicAddModal(0)
  await vue.nextTick()
  assert.equal(add.isShowListAdd.value, true)
  assert.equal(add.selectedAddMusicInfo.value.id, 'music-second')
  selectedList.value = [first, second]
  add.handleShowMusicAddModal(0)
  assert.equal(add.isShowListAddMultiple.value, true)
})

test('all nine download context menu actions dispatch to the original hooks', async() => {
  const calls = []
  const handlers = ['StartTask', 'PauseTask', 'RemoveTask', 'OpenFile', 'PlayMusic', 'PlayMusicLater', 'ShowMusicAddModal', 'Search', 'OpenMusicDetail']
  const menu = loadSource('src/renderer/views/Download/useMenu.js', {
    '@common/utils/vueTools': vue,
    '@renderer/utils/musicSdk': { kw: { getMusicDetailPageUrl: () => '' } },
    '@renderer/plugins/i18n': { useI18n: () => key => key },
  }).default(Object.fromEntries(handlers.map(name => [`handle${name}`, index => calls.push([name, index])])))
  const expected = { start: 'StartTask', pause: 'PauseTask', remove: 'RemoveTask', file: 'OpenFile', play: 'PlayMusic', playLater: 'PlayMusicLater', addTo: 'ShowMusicAddModal', search: 'Search', sourceDetail: 'OpenMusicDetail' }
  for (const [action, handler] of Object.entries(expected)) {
    menu.menuClick({ action }, 2)
    assert.deepEqual(calls.pop(), [handler, 2])
  }
  for (const [status, isComplate, shown] of [['error', false, 'start'], ['pause', false, 'start'], ['run', false, 'pause'], ['waiting', false, 'pause'], ['completed', true, 'play']]) {
    menu.showMenu({ pageX: 10, pageY: 20 }, { status, isComplate, metadata: { musicInfo: { source: 'kw' } } })
    await vue.nextTick()
    assert.equal(menu.menus.value.find(item => item.action === shown).hide, false)
    assert.equal(menu.menus.value.find(item => item.action === (shown === 'start' ? 'pause' : 'start')).hide, true)
    menu.menuClick(null, 0)
    assert.equal(menu.isShowItemMenu.value, false)
  }
})
