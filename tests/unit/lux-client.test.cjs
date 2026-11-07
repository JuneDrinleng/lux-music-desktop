const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const fixture = require('../fixtures/lux-api.json')
const { LuxClient, serverURL } = loadSource('src/main/modules/lux/client.ts')
let server; let client; let responseStatus = 200
const seen = []

test.before(async() => {
  server = http.createServer(async(req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    seen.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined })
    res.writeHead(responseStatus, { 'Content-Type': 'application/json', Location: '/unexpected-redirect' })
    const path = req.url.replace('/deployment/', '')
    const body = responseStatus !== 200 ? { code: 'SECRET', message: 'fixture-sensitive-message' }
      : path === 'api/server-info' ? fixture.serverInfo
        : path === 'api/auth/refresh' ? fixture.credentials
          : ['api/auth/login', 'api/auth/register'].includes(path) ? { ...fixture.credentials, user: fixture.user }
              : path === 'api/auth/me' ? { user: fixture.user }
                : path === 'api/me/profile' ? { profile: fixture.profile }
                  : path === 'api/sync/key' ? fixture.syncKey : { ok: true }
    res.end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  client = new LuxClient(`http://127.0.0.1:${server.address().port}/deployment`)
})
test.after(async() => {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
})

test('deployment URL rejects credentials, query, fragments and insecure remote HTTP', () => {
  for (const url of ['https://user:password@example.org', 'https://example.org/?secret=x', 'https://example.org/#x', 'http://example.org', 'file:///tmp/x']) assert.throws(() => serverURL(url))
  assert.equal(serverURL('https://example.org/lux///'), 'https://example.org/lux/')
})
test('actual login/register/refresh fixtures retain session access credentials and discard legacy token', async() => {
  const input = { username: 'fixture', password: 'fixture-password', deviceId: 'fixture-device', deviceName: 'Fixture Desktop', platform: 'linux' }
  for (const value of [await client.login(input), await client.register({ ...input, inviteCode: 'fixture-invite' })]) {
    assert.equal(value.accessToken, fixture.credentials.accessToken)
    assert.equal(value.user.displayName, '')
    assert.equal(value.token, undefined)
  }
  await assert.rejects(client.register({ ...input, inviteCode: '' }))
  assert.equal((await client.refresh('fixture-refresh')).sessionId, fixture.credentials.sessionId)
  assert.equal(seen[0].authorization, undefined)
  assert.deepEqual(seen[0].body, input)
})
test('server info, me, logout, profile and sync key match actual route methods and preserve subpath', async() => {
  assert.deepEqual((await client.serverInfo()).features, fixture.serverInfo.features)
  assert.equal((await client.me('fixture-access')).id, fixture.user.id)
  assert.deepEqual(await client.profile('fixture-access'), fixture.profile)
  await client.updateProfile('fixture-access', { displayName: 'new name' })
  assert.equal(seen.at(-1).method, 'PATCH')
  assert.deepEqual(await client.syncKey('fixture-access', { deviceId: 'fixture-device', deviceName: 'Fixture Desktop', platform: 'linux' }), fixture.syncKey)
  assert.deepEqual(await client.logout('fixture-access'), { ok: true })
  assert.equal(seen.at(-1).authorization, 'Bearer fixture-access')
  assert.ok(seen.every(item => item.path.startsWith('/deployment/api/')))
})
test('HTTP errors discard server messages and never retry or follow redirects', async() => {
  for (const [status, kind] of [[401, 'unauthenticated'], [429, 'rate_limited'], [500, 'server'], [302, 'request']]) {
    responseStatus = status
    const before = seen.length
    await assert.rejects(client.me('fixture-access'), error => error.kind === kind && error.status === status && !String(error.stack).includes('fixture-sensitive'))
    assert.equal(seen.length, before + 1)
  }
  responseStatus = 200
})
test('malformed responses and transport exceptions cannot leak raw data', async() => {
  const { LuxClient: MockClient } = loadSource('src/main/modules/lux/client.ts', {
    undici: { request: async() => { throw new Error('fixture-sensitive-transport') } },
  })
  await assert.rejects(new MockClient('https://example.org').me('fixture-access'), error => error.kind === 'offline' && !error.stack.includes('fixture-sensitive'))
  const { parseLogin } = loadSource('src/main/modules/lux/contract.ts')
  for (const body of [{ token: 'legacy-only' }, { ...fixture.credentials, user: fixture.user, accessTokenExpiresAt: 'wrong' }]) assert.throws(() => parseLogin(body))
})
