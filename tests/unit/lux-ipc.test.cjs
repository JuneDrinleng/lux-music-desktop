const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const contract = loadSource('src/main/modules/lux/contract.ts')
const ipc = loadSource('src/main/modules/lux/ipc.ts', { './contract': contract })
const { createLuxHandler, isLuxSender } = ipc
const secrets = ['fixture-password', 'fixture-access', 'fixture-refresh', 'fixture-device-id', 'fixture-user-id', 'fixture-sync-key']
const state = {
  status: 'signed_in',
  verified: true,
  server: 'https://example.org/lux/',
  account: { username: 'fixture', displayName: 'Fixture', id: secrets[4], password: secrets[0] },
  persistence: { mode: 'encrypted', refreshToken: secrets[2] },
  accessToken: secrets[1],
  deviceId: secrets[3],
  key: secrets[5],
}
const profile = { username: 'fixture', displayName: 'Fixture', avatar: '', gender: 'unknown', signature: '', password: secrets[0] }
const create = () => {
  const calls = []
  const session = {
    snapshot: () => structuredClone(state),
    login: async(...args) => { calls.push(args); return state },
    restore: async() => state,
    logout: async() => ({ remoteRevoked: false, token: secrets[1] }),
    authorize: operation => operation({ profile: async() => profile, updateProfile: async(_token, input) => ({ ...profile, ...input }) }, secrets[1], new AbortController().signal),
  }
  return { session, calls, handler: createLuxHandler(session, () => true) }
}
const event = {}
const assertSafe = value => { const serialized = JSON.stringify(value); for (const secret of secrets) assert.equal(serialized.includes(secret), false) }

test('IPC projects only public state/profile on success and sends fixed errors with no logs', async() => {
  const c = create()
  const logs = []
  const original = Object.fromEntries(['log', 'info', 'debug', 'warn', 'error'].map(name => [name, console[name]]))
  for (const name of Object.keys(original)) console[name] = (...args) => { logs.push(args) }
  try {
    for (const command of [{ action: 'state' }, { action: 'login', server: state.server, username: 'fixture', password: secrets[0] }, { action: 'register', server: state.server, username: 'fixture', password: secrets[0], inviteCode: 'fixture-invite' }, { action: 'restore' }, { action: 'profile' }, { action: 'update_profile', profile: { displayName: 'New' } }, { action: 'logout' }]) {
      const result = await c.handler(event, command)
      assert.equal(result.ok, true)
      assertSafe(result)
    }
    assert.equal(c.calls[0][2], secrets[0])
    assert.equal(c.calls[1][3], 'fixture-invite')
    c.session.login = async() => { throw new Error(secrets.join(' ')) }
    const failed = await c.handler(event, { action: 'login', server: state.server, username: 'fixture', password: secrets[0] })
    assert.deepEqual(failed.error, { kind: 'protocol', status: 0 })
    assertSafe(failed)
    assert.deepEqual(logs, [])
  } finally { Object.assign(console, original) }
})
test('unknown or malformed requests cannot pass credentials, identifiers, routes or readonly profile fields', async() => {
  const { handler, calls } = create()
  for (const input of [null, [], {}, { action: 'refresh', refreshToken: secrets[2] }, { action: 'sync_key' }, { action: 'state', accessToken: secrets[1] }, { action: 'login', server: state.server, username: 'fixture', password: secrets[0], deviceId: secrets[3] }, { action: 'register', server: state.server, username: 'fixture', password: secrets[0] }, { action: 'update_profile', profile: { username: 'other' } }, { action: 'update_profile', profile: { gender: 'other' } }, { action: 'update_profile', profile: { displayName: 'x'.repeat(101) } }]) {
    const result = await handler(event, input)
    assert.equal(result.error.kind, 'invalid_input')
    assertSafe(result)
  }
  assert.equal(calls.length, 0)
})
test('untrusted senders receive no account state and native exceptions cannot escape', async() => {
  const c = create()
  for (const trusted of [() => false, () => { throw new Error(secrets[1]) }]) {
    const result = await createLuxHandler(c.session, trusted)(event, { action: 'state' })
    assert.deepEqual(result, { ok: false, error: { kind: 'forbidden', status: 0 } })
  }
  c.session.restore = async() => { throw new contract.LuxError('rate_limited', 429) }
  assert.deepEqual((await c.handler(event, { action: 'restore' })).error, { kind: 'rate_limited', status: 429 })
})
test('only the owned application main frame may invoke the channel', () => {
  const frame = { url: 'file:///app/index.html?theme=fixture#/account' }
  const contents = { mainFrame: frame, isDestroyed: () => false }
  const owned = { sender: contents, senderFrame: frame }
  assert.equal(isLuxSender(owned, contents, 'file:///app/index.html'), true)
  assert.equal(isLuxSender({ ...owned, senderFrame: { ...frame } }, contents, 'file:///app/index.html'), false)
  assert.equal(isLuxSender({ ...owned, sender: {} }, contents, 'file:///app/index.html'), false)
  for (const url of ['https://example.org/index.html', 'file:///app/other.html', 'about:blank']) {
    frame.url = url
    assert.equal(isLuxSender(owned, contents, 'file:///app/index.html'), false)
  }
  frame.url = 'http://localhost:9080/?fixture=true#/'
  assert.equal(isLuxSender(owned, contents, 'http://localhost:9080/'), true)
})
test('account mutations cannot overlap; registration is wired into the real main channel', async() => {
  const c = create()
  let finish
  c.session.login = () => new Promise(resolve => { finish = resolve })
  const pending = c.handler(event, { action: 'login', server: state.server, username: 'fixture', password: secrets[0] })
  assert.equal((await c.handler(event, { action: 'logout' })).error.kind, 'busy')
  assert.equal((await c.handler(event, { action: 'state' })).ok, true)
  finish()
  await pending
  assert.equal((await c.handler(event, { action: 'logout' })).ok, true)
  const frame = { url: 'http://localhost:9080/' }
  const contents = { mainFrame: frame, isDestroyed: () => false }
  let channel, registered
  loadSource('src/main/modules/winMain/rendererEvent/lux.ts', {
    electron: { ipcMain: { handle: (name, handler) => { channel = name; registered = handler } } },
    '@main/modules/lux': { getLuxSession: () => c.session },
    '@main/modules/lux/ipc': ipc,
    '../main': { getWebContents: () => contents },
  }).default()
  assert.equal(channel, 'lux:account')
  assertSafe(await registered({ sender: contents, senderFrame: frame }, { action: 'state' }))
})
