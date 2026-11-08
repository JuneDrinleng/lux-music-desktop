const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const fixture = require('../fixtures/lux-api.json')
const contract = loadSource('src/main/modules/lux/contract.ts')
const { LuxSession } = loadSource('src/main/modules/lux/session.ts', { './contract': contract })
const { LuxError, parseLogin } = contract
const deferred = () => { let resolve, reject; const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject }); return { promise, resolve, reject } }
const login = () => parseLogin({ ...fixture.credentials, user: fixture.user })
const create = (saved = null) => {
  const io = { saved, writes: 0, clears: 0, refreshes: 0, logins: [] }
  const vault = {
    persistence: { mode: 'encrypted' },
    load: () => io.saved,
    save: value => { io.saved = structuredClone({ server: value.server, deviceId: value.deviceId, credentials: value.credentials, user: value.user }); io.writes++ },
    clear: () => { io.saved = null; io.clears++ },
  }
  const client = {
    server: 'https://example.org/lux/',
    login: async input => { io.logins.push(input); return login() },
    register: async input => { io.logins.push(input); return login() },
    refresh: async() => { io.refreshes++; return { ...fixture.credentials, accessToken: 'fixture-access-rotated', refreshToken: 'fixture-refresh-rotated' } },
    me: async() => login().user,
    logout: async() => ({ ok: true }),
  }
  const session = new LuxSession(vault, () => client, () => 1000)
  return { session, client, vault, io }
}
const signIn = context => context.session.login('https://example.org/lux/', 'fixture', 'fixture-password')
const saved = () => ({ server: 'https://example.org/lux/', deviceId: 'fixture-device', credentials: login(), user: login().user })

test('login/register use main-generated device identity and state never includes credentials or IDs', async() => {
  const c = create()
  await signIn(c)
  assert.equal(c.session.snapshot().status, 'signed_in')
  const serialized = JSON.stringify(c.session.snapshot())
  for (const value of [fixture.credentials.accessToken, fixture.credentials.refreshToken, fixture.credentials.sessionId, fixture.user.id, c.io.logins[0].deviceId, 'fixture-password']) assert.equal(serialized.includes(value), false)
  await c.session.login('https://example.org', 'fixture', 'fixture-password', 'fixture-invite')
  assert.equal(c.io.logins[1].inviteCode, 'fixture-invite')
  assert.notEqual(c.io.logins[0].deviceId, c.io.logins[1].deviceId)
})
test('restoring validates account identity and retains offline/429/5xx sessions for retry', async() => {
  for (const error of [new LuxError('offline'), new LuxError('rate_limited', 429), new LuxError('server', 503)]) {
    const c = create(saved())
    c.client.me = async() => { throw error }
    await assert.rejects(c.session.restore(), error)
    assert.equal(c.session.snapshot().status, 'signed_in')
    assert.equal(c.session.snapshot().verified, false)
    assert.equal(c.io.clears, 0)
    c.client.me = async() => login().user
    assert.equal((await c.session.restore()).verified, true)
  }
  const c = create(saved())
  c.client.me = async() => ({ ...login().user, id: 'other-account' })
  await assert.rejects(c.session.restore(), error => error.kind === 'protocol')
  assert.equal(c.session.snapshot().status, 'signed_out')
})
test('expired concurrent requests share one refresh and persist rotation before using it', async() => {
  const initial = saved(); initial.credentials.accessTokenExpiresAt = 1
  const c = create(initial)
  const pending = deferred()
  c.client.refresh = async() => { c.io.refreshes++; return pending.promise }
  const restore = c.session.restore()
  const requests = Array.from({ length: 12 }, () => c.session.authorize(async(_client, token) => {
    assert.equal(c.io.saved.credentials.accessToken, token)
    return token
  }))
  assert.equal(c.io.refreshes, 1)
  pending.resolve({ ...fixture.credentials, accessToken: 'fixture-rotated', refreshToken: 'fixture-rotated-refresh' })
  await Promise.all([restore, ...requests])
  assert.equal(c.io.refreshes, 1)
})
test('concurrent and delayed 401 responses reuse an already rotated token', async() => {
  const c = create(); await signIn(c)
  const delayed = deferred()
  const old = c.session.authorize(async(_client, token) => {
    if (token === 'fixture-access') { await delayed.promise; throw new LuxError('unauthenticated', 401) }
    return token
  })
  const now = c.session.authorize(async(_client, token) => {
    if (token === 'fixture-access') throw new LuxError('unauthenticated', 401)
    return token
  })
  await now; delayed.resolve(); await old
  assert.equal(c.io.refreshes, 1)
})
test('a request retries only once after 401; a second 401 clears the revoked session', async() => {
  const c = create(); await signIn(c)
  let calls = 0
  await assert.rejects(c.session.authorize(async() => { calls++; throw new LuxError('unauthenticated', 401) }))
  assert.equal(calls, 2)
  assert.equal(c.io.refreshes, 1)
  assert.equal(c.session.snapshot().status, 'signed_out')
})
test('refresh 401 clears a revoked session; refresh offline/429/5xx preserve it', async() => {
  for (const status of [0, 401, 429, 503]) {
    const c = create(); await signIn(c)
    c.client.refresh = async() => { throw new LuxError(status === 401 ? 'unauthenticated' : status === 429 ? 'rate_limited' : status ? 'server' : 'offline', status) }
    await assert.rejects(c.session.authorize(async() => { throw new LuxError('unauthenticated', 401) }))
    assert.equal(c.session.snapshot().status, status === 401 ? 'signed_out' : 'signed_in')
  }
})
test('ordinary offline/429/5xx never refresh or clear the valid session', async() => {
  const c = create(); await signIn(c)
  for (const status of [0, 429, 500]) await assert.rejects(c.session.authorize(async() => { throw new LuxError(status ? 'server' : 'offline', status) }))
  assert.equal(c.io.refreshes, 0)
  assert.equal(c.io.clears, 0)
})
test('logout cancels requests and late refresh cannot restore a forgotten identity', async() => {
  const c = create(); await signIn(c)
  const pending = deferred()
  c.client.refresh = () => pending.promise
  const request = c.session.authorize(async() => { throw new LuxError('unauthenticated', 401) })
  await Promise.resolve()
  c.client.logout = async() => { throw new LuxError('offline') }
  assert.equal((await c.session.logout()).remoteRevoked, false)
  const writes = c.io.writes
  pending.resolve({ ...fixture.credentials, accessToken: 'late-token' })
  await assert.rejects(request, error => error.kind === 'cancelled')
  assert.equal(c.io.writes, writes)
  assert.equal(c.io.saved, null)
})
test('failed login retains the previous identity; switching cancels pending old requests', async() => {
  const c = create(); await signIn(c)
  const pending = deferred()
  const request = c.session.authorize(async(_client, _token, signal) => { await pending.promise; assert.equal(signal.aborted, true); return 'late' })
  c.client.login = async() => { throw new LuxError('offline') }
  await assert.rejects(signIn(c))
  pending.resolve()
  await assert.rejects(request, error => error.kind === 'cancelled')
  assert.equal(c.session.snapshot().status, 'signed_in')
})
test('rotation write failure retains fresh credentials in memory and removes spent disk credentials', async() => {
  const c = create(); await signIn(c)
  c.vault.save = () => { throw new LuxError('storage') }
  await assert.rejects(c.session.authorize(async(_client, token) => { if (token === 'fixture-access') throw new LuxError('unauthenticated', 401); return token }), error => error.kind === 'storage')
  assert.equal(c.io.saved, null)
  assert.equal(c.session.snapshot().persistence.issue, 'write_failed')
  assert.equal(await c.session.authorize(async(_client, token) => token), 'fixture-access-rotated')
})
test('main-only sync key issuance uses the active account installation identity', async() => {
  const c = create()
  await assert.rejects(c.session.requestSyncKey())
  await signIn(c)
  c.client.syncKey = async(token, input) => {
    assert.equal(token, fixture.credentials.accessToken)
    assert.equal(input.deviceId, c.io.saved.deviceId)
    return { ...fixture.syncKey }
  }
  assert.deepEqual(await c.session.requestSyncKey(), fixture.syncKey)
  assert.equal(JSON.stringify(c.session.snapshot()).includes(fixture.syncKey.key), false)
})
