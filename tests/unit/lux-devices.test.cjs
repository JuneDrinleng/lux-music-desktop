const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const fixture = require('../fixtures/lux-api.json')
const contract = loadSource('src/main/modules/lux/contract.ts')
const { LuxDevices } = loadSource('src/main/modules/lux/devices.ts', { './contract': contract })
const { createLuxHandler } = loadSource('src/main/modules/lux/ipc.ts', { './contract': contract })
const create = () => {
  const calls = []
  let forgotten = 0
  const client = {
    call: async(path, method, body, token) => {
      calls.push({ path, method, body, token })
      return path === 'api/me/sessions' ? { sessions: fixture.sessions }
        : path === 'api/me/devices' ? { devices: fixture.devices }
          : path.endsWith('revoke-others') ? { ok: true, revoked: 1 } : { ok: true }
    },
  }
  const session = {
    generation: 0,
    authorize: operation => operation(client, 'fixture-access', new AbortController().signal),
    forget: () => { forgotten++; session.generation++ },
    snapshot: () => ({ status: 'signed_in', verified: true, persistence: { mode: 'encrypted' } }),
  }
  return { session, client, calls, api: new LuxDevices(session), forgotten: () => forgotten }
}
const safe = value => {
  const serialized = JSON.stringify(value)
  for (const secret of ['fixture-session', 'fixture-other-session', 'fixture-device', 'fixture-client', 'fixture-access', 'fixture-refresh-hash', 'fixture-sync-key']) assert.equal(serialized.includes(secret), false)
}

test('actual session/device listings keep useful metadata and replace all raw identifiers with stable opaque handles', async() => {
  const c = create()
  const sessions = await c.api.sessions()
  const devices = await c.api.devices()
  safe({ sessions, devices })
  assert.equal(sessions[0].current, true)
  assert.equal(sessions[0].lastActiveAt, 2000)
  assert.equal(sessions[1].platform, '')
  assert.equal(devices[0].isMobile, false)
  assert.equal((await c.api.sessions())[0].handle, sessions[0].handle)
  const concurrent = await Promise.all([c.api.devices(), c.api.devices()])
  assert.equal(concurrent[0][0].handle, concurrent[1][0].handle)
  assert.equal(c.calls[0].token, 'fixture-access')
})
test('revocation uses encoded main IDs; revoking current session clears local identity but removing a sync device does not', async() => {
  const c = create()
  const sessions = await c.api.sessions()
  const device = (await c.api.devices())[0]
  await c.api.revokeDevice(device.handle)
  assert.equal(c.forgotten(), 0)
  assert.equal(c.calls.at(-1).path, 'api/me/devices/fixture-client')
  await c.api.revokeSession(sessions[0].handle)
  assert.equal(c.forgotten(), 1)
  assert.equal(c.calls.at(-1).path, 'api/me/sessions/fixture-session')
  assert.equal(c.calls.at(-1).method, 'DELETE')
  const encoded = create()
  encoded.client.call = async(path) => path === 'api/me/devices' ? { devices: [{ ...fixture.devices[0], clientId: 'id/with ?#' }] } : (assert.equal(path, 'api/me/devices/id%2Fwith%20%3F%23'), { ok: true })
  await encoded.api.revokeDevice((await encoded.api.devices())[0].handle)
})
test('revoke-others preserves current session and invalidates revoked handles', async() => {
  const c = create()
  const sessions = await c.api.sessions()
  assert.deepEqual(await c.api.revokeOthers(), { ok: true, revoked: 1 })
  assert.equal(c.calls.at(-1).method, 'POST')
  assert.equal(c.forgotten(), 0)
  await assert.rejects(c.api.revokeSession(sessions[1].handle), error => error.kind === 'invalid_input')
  await c.api.revokeSession(sessions[0].handle)
})
test('raw, wrong-kind and stale handles never make a request; late revoke cannot clear a new account', async() => {
  const c = create()
  const old = (await c.api.sessions())[0].handle
  const device = (await c.api.devices())[0].handle
  const count = c.calls.length
  await assert.rejects(c.api.revokeSession('fixture-session'))
  await assert.rejects(c.api.revokeSession(device))
  c.session.generation++
  await assert.rejects(c.api.revokeSession(old))
  assert.equal(c.calls.length, count)
  const current = (await c.api.sessions())[0].handle
  let finish
  c.client.call = () => new Promise(resolve => { finish = resolve })
  const pending = c.api.revokeSession(current)
  c.session.generation++
  finish({ ok: true })
  await assert.rejects(pending, error => error.kind === 'cancelled')
  assert.equal(c.forgotten(), 0)
})
test('errors preserve identity and IPC never exposes credentials or IDs even if server adds sensitive fields', async() => {
  const c = create()
  c.client.call = async() => ({ sessions: fixture.sessions.map(value => ({ ...value, refreshTokenHash: 'fixture-refresh-hash', key: 'fixture-sync-key' })) })
  const handler = createLuxHandler(c.session, () => true)
  const listing = await handler({}, { action: 'sessions' })
  assert.equal(listing.ok, true)
  safe(listing)
  c.client.call = async() => { throw new contract.LuxError('rate_limited', 429) }
  const result = await handler({}, { action: 'revoke_session', handle: listing.value[0].handle })
  assert.equal(result.error.status, 429)
  assert.equal(c.forgotten(), 0)
  safe(result)
  c.client.call = async() => ({ sessions: [{ ...fixture.sessions[0], current: 'yes' }] })
  await assert.rejects(c.api.sessions(), error => error.kind === 'protocol')
  c.client.call = async() => ({ ok: true, revoked: -1 })
  await assert.rejects(c.api.revokeOthers(), error => error.kind === 'protocol')
})
test('a malformed listing cannot partially reclassify an existing current-session handle', async() => {
  const c = create()
  const handle = (await c.api.sessions())[0].handle
  c.client.call = async() => ({ sessions: [{ ...fixture.sessions[0], current: false, createdAt: 'invalid' }] })
  await assert.rejects(c.api.sessions(), error => error.kind === 'protocol')
  c.client.call = async() => ({ ok: true })
  await c.api.revokeSession(handle)
  assert.equal(c.forgotten(), 1)
})
