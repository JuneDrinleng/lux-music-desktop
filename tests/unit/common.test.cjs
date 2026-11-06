const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { fileURLToPath } = require('node:url')
const { loadSource } = require('../helpers/load-source.cjs')

const { sortInsert, arrPush, arrUnshift, arrPushByPosition, similar, filterFileName, formatPlayTime, formatPlayTime2, encodePath } = loadSource('src/common/utils/common.ts')

test('sorted insertion handles empty lists, endpoints, and inserts before equal scores', () => {
  const list = []
  for (const [num, data] of [[3, 'three'], [1, 'one'], [2, 'older two'], [2, 'newer two'], [4, 'four'], [0, 'zero']]) sortInsert(list, { num, data })
  assert.deepEqual(list.map(item => item.num), [0, 1, 2, 2, 3, 4])
  assert.deepEqual(list.filter(item => item.num === 2).map(item => item.data), ['newer two', 'older two'])
})

test('bulk append preserves all songs across chunk boundaries', () => {
  const original = ['start']
  const incoming = Array.from({ length: 5001 }, (_, index) => index)
  assert.equal(arrPush(original, incoming), original)
  assert.deepEqual(original, ['start', ...incoming])
  assert.equal(incoming.length, 5001)
})

test('bulk prepend and positional insert preserve ordering across chunk boundaries', () => {
  const incoming = Array.from({ length: 2501 }, (_, index) => index)
  const prepended = ['end']
  assert.equal(arrUnshift(prepended, incoming), prepended)
  assert.deepEqual(prepended, [...incoming, 'end'])
  const inserted = ['start', 'end']
  assert.equal(arrPushByPosition(inserted, incoming, 1), inserted)
  assert.deepEqual(inserted, ['start', ...incoming, 'end'])
})

test('song similarity distinguishes exact, approximate, unrelated, and empty text', () => {
  assert.equal(similar('夜曲', '夜曲'), 1)
  assert.equal(similar('', 'song'), 0)
  assert.equal(similar('abc', 'xyz'), 0)
  assert.ok(similar('song', 'songs') > similar('song', 'wrong'))
  assert.equal(similar('song', 'songs'), similar('songs', 'song'))
})

test('filename filtering removes invalid filesystem separators while retaining Unicode', () => {
  assert.equal(filterFileName('夜曲 / 周杰伦\\:*?#"<>|.flac'), '夜曲  周杰伦.flac')
})

test('player time displays distinguish unavailable durations from an elapsed zero', () => {
  assert.equal(formatPlayTime(0), '--/--')
  assert.equal(formatPlayTime2(0), '00:00')
  assert.equal(formatPlayTime(125.9), '02:05')
  assert.equal(formatPlayTime2(3661), '61:01')
})

test('local music file URLs percent-encode reserved characters and preserve path hierarchy', () => {
  const filePath = path.join(os.tmpdir(), 'music', '夜曲 #1.flac')
  const url = encodePath(filePath)
  assert.match(url, /^file:\/\/\//)
  assert.ok(url.endsWith('/music/%E5%A4%9C%E6%9B%B2%20%231.flac'))
  assert.equal(fileURLToPath(url), filePath)
})
