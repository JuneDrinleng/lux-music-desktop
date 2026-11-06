const test = require('node:test')
const assert = require('node:assert/strict')
const { loadSource } = require('../helpers/load-source.cjs')

for (const kind of ['list', 'dislike']) {
  const title = kind === 'list' ? 'List' : 'Dislike'
  const method = `on${title}SyncAction`
  const action = { action: 'fixture-action', data: [] }
  const fixture = () => {
    const events = []
    let finishManagerUpdate = async() => {}
    const manager = {
      async createSnapshot() { events.push('snapshot'); return 'snapshot-key' },
      async updateDeviceSnapshotKey(id, key) {
        assert.equal(id, 'origin-device')
        assert.equal(key, 'snapshot-key')
        await finishManagerUpdate()
        events.push('manager-updated')
      },
    }
    const handler = loadSource(`src/main/modules/sync/server/modules/${kind}/sync/handler.ts`, {
      '@main/modules/sync/server/user': { getUserSpace: () => ({ [`${kind}Manage`]: manager }) },
      [`@main/modules/sync/${kind}Event`]: {
        [`handleRemote${title}Action`]: async received => {
          assert.equal(received, action)
          events.push('applied')
        },
      },
    }).default
    const socket = {
      moduleReadys: { [kind]: true },
      userInfo: { name: 'fixture-account' },
      keyInfo: { clientId: 'origin-device' },
      broadcast() { events.push('broadcast') },
    }
    return { handler, socket, events, setManagerUpdate: fn => { finishManagerUpdate = fn } }
  }

  test(`${kind}: unready peer cannot mutate the library or snapshot`, async() => {
    const f = fixture()
    f.socket.moduleReadys[kind] = false
    await f.handler[method](f.socket, action)
    assert.deepEqual(f.events, [])
  })

  test(`${kind}: acknowledge and broadcast only after the snapshot manager completes`, async() => {
    const f = fixture()
    let release
    f.setManagerUpdate(() => new Promise(resolve => { release = resolve }))
    let acknowledged = false
    const pending = f.handler[method](f.socket, action).then(() => { acknowledged = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.events, ['applied', 'snapshot'])
    assert.equal(acknowledged, false)
    release()
    await pending
    assert.deepEqual(f.events, ['applied', 'snapshot', 'manager-updated', 'broadcast'])
  })

  test(`${kind}: manager rejection propagates through the RPC before broadcast`, async() => {
    const f = fixture()
    f.setManagerUpdate(async() => { throw new Error('snapshot manager failed') })
    await assert.rejects(f.handler[method](f.socket, action), /snapshot manager failed/)
    assert.deepEqual(f.events, ['applied', 'snapshot'])
  })
}
