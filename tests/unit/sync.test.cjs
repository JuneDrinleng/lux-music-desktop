const assert = require('node:assert/strict')
const test = require('node:test')
const { gzipSync, gunzipSync } = require('node:zlib')
const { loadSource, forbiddenBoundary } = require('../helpers/load-source.cjs')

const { encodeData, decodeData, aesEncrypt, aesDecrypt } = loadSource('src/main/modules/sync/utils.ts')
const { parseUrl } = loadSource('src/main/modules/sync/client/utils.ts', {
  '@main/utils/request': { httpFetch: forbiddenBoundary('network request') },
})

test('HTTPS sync addresses use WSS and preserve reverse proxy prefixes and ports', () => {
  assert.deepEqual(parseUrl('https://music.example:8443/sync/'), {
    wsProtocol: 'wss:', httpProtocol: 'https:', hostPath: 'music.example:8443/sync', href: 'https://music.example:8443/sync',
  })
})

test('HTTP sync addresses use WS and remove the root trailing slash', () => {
  assert.deepEqual(parseUrl('http://127.0.0.1:9527'), {
    wsProtocol: 'ws:', httpProtocol: 'http:', hostPath: '127.0.0.1:9527', href: 'http://127.0.0.1:9527',
  })
})

test('sync addresses preserve IPv6 literals and percent-encoded reverse proxy paths', () => {
  assert.deepEqual(parseUrl('https://[::1]:9527/sync%20music/'), {
    wsProtocol: 'wss:', httpProtocol: 'https:', hostPath: '[::1]:9527/sync%20music', href: 'https://[::1]:9527/sync%20music',
  })
})

test('invalid sync addresses fail before attempting a network request', () => {
  for (const address of ['', 'example.com', 'http://[invalid']) assert.throws(() => parseUrl(address), TypeError)
})

test('small sync payloads remain plain text through the inclusive 1024-character boundary', async() => {
  for (const payload of ['', 'hello', 'a'.repeat(1024)]) {
    assert.equal(await encodeData(payload), payload)
    assert.equal(await decodeData(payload), payload)
  }
})

test('large sync payloads are gzip/base64 frames readable by an independent gzip consumer', async() => {
  const payload = JSON.stringify({ songs: ['夜曲🎵'.repeat(400)] })
  const encoded = await encodeData(payload)
  assert.ok(encoded.startsWith('cg_'))
  assert.equal(gunzipSync(Buffer.from(encoded.slice(3), 'base64')).toString('utf8'), payload)
  assert.equal(await decodeData(encoded), payload)
  assert.ok((await encodeData('a'.repeat(1025))).startsWith('cg_'))
})

test('sync decoder accepts gzip frames generated independently of the app encoder', async() => {
  const payload = '{"listId":"love","songs":["一","二"]}'
  assert.equal(await decodeData(`cg_${gzipSync(payload).toString('base64')}`), payload)
})

test('malformed compressed sync frames reject instead of silently corrupting data', async() => {
  await assert.rejects(decodeData('cg_not-a-gzip-payload'))
})

test('sync AES encryption preserves UTF-8 text and uses a base64 encoded 128-bit key', () => {
  const key = Buffer.from('0123456789abcdef').toString('base64')
  const plaintext = '同步内容 🎵 / music list'
  const encrypted = aesEncrypt(plaintext, key)
  assert.match(encrypted, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.notEqual(encrypted, plaintext)
  assert.equal(Buffer.from(encrypted, 'base64').length % 16, 0)
  assert.equal(aesDecrypt(encrypted, key), plaintext)
  assert.equal(aesDecrypt(aesEncrypt('', key), key), '')
})

test('sync AES rejects malformed key lengths and truncated encrypted data', () => {
  assert.throws(() => aesEncrypt('data', Buffer.from('short').toString('base64')))
  assert.throws(() => aesDecrypt('AA==', Buffer.from('0123456789abcdef').toString('base64')))
})
