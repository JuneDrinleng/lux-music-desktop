const assert = require('node:assert/strict')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const { SyncProviderLifecycle } = loadSource('src/main/modules/sync/provider.ts')
const deferred = () => { let resolve, reject; const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject }); return { promise, resolve, reject } }
const tick = () => new Promise(resolve => setImmediate(resolve))
const create = () => {
  const events = []
  const contexts = { lx: [], lux: [] }
  const adapters = Object.fromEntries(['lx', 'lux'].map(id => [id, {
    start: async context => { events.push(`${id}:start`); contexts[id].push(context) },
    stop: async() => { events.push(`${id}:stop`) },
  }]))
  return { lifecycle: new SyncProviderLifecycle(adapters), adapters, events, contexts }
}

test('local starts and stops offline without invoking either transport', async() => {
  const c = create()
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'local', status: 'stopped' })
  assert.equal((await c.lifecycle.start()).status, 'running')
  await c.lifecycle.start(); await c.lifecycle.stop(); await c.lifecycle.stop()
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'local', status: 'stopped' })
  assert.deepEqual(c.events, [])
})
for (const from of ['local', 'lx', 'lux']) {
  for (const to of ['local', 'lx', 'lux']) {
    test(`switch ${from} → ${to} cleans the previous lifecycle before starting the next`, async() => {
      const c = create()
      await c.lifecycle.switchTo(from)
      c.events.length = 0
      const state = await c.lifecycle.switchTo(to)
      assert.deepEqual(state, { provider: to, status: 'running' })
      const expected = from === to ? [] : [...(from === 'local' ? [] : [`${from}:stop`]), ...(to === 'local' ? [] : [`${to}:start`])]
      assert.deepEqual(c.events, expected)
      if (from !== 'local') assert.equal(c.contexts[from][0].signal.aborted, from !== to)
    })
  }
}
test('start/stop expose pending states and duplicate requests share work', async() => {
  const c = create(); const starting = deferred(); const stopping = deferred()
  c.adapters.lx.start = async context => { c.contexts.lx.push(context); await starting.promise }
  c.adapters.lx.stop = () => { c.events.push('lx:stop'); return stopping.promise }
  const first = c.lifecycle.switchTo('lx')
  const duplicateStart = c.lifecycle.start()
  await tick()
  assert.equal(c.lifecycle.snapshot().status, 'starting')
  assert.equal(c.contexts.lx.length, 1)
  starting.resolve(); assert.deepEqual(await duplicateStart, await first)
  const stopped = c.lifecycle.stop()
  const duplicateStop = c.lifecycle.stop()
  assert.equal(c.contexts.lx[0].signal.aborted, true)
  await tick()
  assert.equal(c.lifecycle.snapshot().status, 'stopping')
  stopping.resolve()
  assert.equal((await stopped).status, 'stopped')
  assert.deepEqual(await duplicateStop, await stopped)
  assert.deepEqual(c.events, ['lx:stop'])
})
test('stop cancels a pending start and late success cannot publish running', async() => {
  const c = create(); const pending = deferred()
  c.adapters.lux.start = async context => { c.contexts.lux.push(context); await pending.promise }
  const started = c.lifecycle.switchTo('lux'); await tick()
  const stopped = c.lifecycle.stop()
  assert.equal(c.contexts.lux[0].signal.aborted, true)
  pending.resolve(); await started; await stopped
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'lux', status: 'stopped' })
  assert.deepEqual(c.events, ['lux:stop'])
})
test('rapid switching skips superseded targets and rejects stale failures from the same adapter', async() => {
  const c = create(); const pending = deferred()
  c.adapters.lx.start = async context => { c.contexts.lx.push(context); if (c.contexts.lx.length === 1) await pending.promise }
  const old = c.lifecycle.switchTo('lx'); await tick()
  const skipped = c.lifecycle.switchTo('lux')
  const latest = c.lifecycle.switchTo('lx')
  assert.equal(c.contexts.lx[0].signal.aborted, true)
  c.contexts.lx[0].reportError()
  pending.reject(new Error('cancelled transport detail'))
  await Promise.all([old, skipped, latest])
  c.contexts.lx[0].reportError(); await tick()
  assert.equal(c.contexts.lx.length, 2)
  assert.deepEqual(c.events, ['lx:stop'])
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'lx', status: 'running' })
})
test('start errors clean partial resources, redact raw errors and allow retry', async() => {
  const c = create()
  c.adapters.lux.start = async() => { throw new Error('private transport detail') }
  assert.deepEqual(await c.lifecycle.switchTo('lux'), { provider: 'lux', status: 'error', error: 'start_failed' })
  assert.deepEqual(c.events, ['lux:stop'])
  assert.equal(JSON.stringify(c.lifecycle.snapshot()).includes('private'), false)
  c.adapters.lux.start = async() => {}
  assert.equal((await c.lifecycle.start()).status, 'running')
})
test('runtime failures abort and clean resources; duplicate reports do not overwrite a new provider', async() => {
  const c = create(); await c.lifecycle.switchTo('lux')
  const context = c.contexts.lux[0]
  context.reportError(); context.reportError()
  assert.equal(context.signal.aborted, true)
  await tick()
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'lux', status: 'error', error: 'provider_failed' })
  assert.deepEqual(c.events, ['lux:start', 'lux:stop'])
  assert.equal((await c.lifecycle.stop()).status, 'stopped')
  await c.lifecycle.switchTo('lx')
  context.reportError(); await tick()
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'lx', status: 'running' })
})
test('an error reported during start cannot be replaced by late start success', async() => {
  const c = create()
  c.adapters.lx.start = async context => { context.reportError() }
  assert.equal((await c.lifecycle.switchTo('lx')).error, 'provider_failed')
  await tick()
  assert.deepEqual(c.events, ['lx:stop'])
  assert.equal(c.lifecycle.snapshot().error, 'provider_failed')
})
test('failed stop blocks a new provider and retains ownership for a cleanup retry', async() => {
  const c = create(); await c.lifecycle.switchTo('lx')
  c.adapters.lx.stop = async() => { throw new Error('private cleanup detail') }
  assert.deepEqual(await c.lifecycle.switchTo('lux'), { provider: 'lx', status: 'error', error: 'stop_failed' })
  assert.equal(c.contexts.lux.length, 0)
  c.adapters.lx.stop = async() => { c.events.push('lx:retry-stop') }
  assert.equal((await c.lifecycle.switchTo('lux')).status, 'running')
  assert.deepEqual(c.events, ['lx:start', 'lx:retry-stop', 'lux:start'])
})
test('failed cleanup after a start failure can be retried by stop', async() => {
  const c = create()
  c.adapters.lux.start = async() => { throw new Error('start') }
  c.adapters.lux.stop = async() => { throw new Error('stop') }
  assert.equal((await c.lifecycle.switchTo('lux')).error, 'stop_failed')
  c.adapters.lux.stop = async() => {}
  assert.deepEqual(await c.lifecycle.stop(), { provider: 'lux', status: 'stopped' })
})
test('switch waits for cleanup and only the latest queued target starts', async() => {
  const c = create(); const pending = deferred(); await c.lifecycle.switchTo('lx')
  c.adapters.lx.stop = () => pending.promise
  const lux = c.lifecycle.switchTo('lux'); await tick()
  const local = c.lifecycle.switchTo('local')
  pending.resolve(); await Promise.all([lux, local])
  assert.equal(c.contexts.lux.length, 0)
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'local', status: 'running' })
})
test('snapshot mutation cannot change lifecycle state', async() => {
  const c = create(); await c.lifecycle.start()
  const snapshot = c.lifecycle.snapshot(); snapshot.status = 'error'; snapshot.provider = 'lux'
  assert.deepEqual(c.lifecycle.snapshot(), { provider: 'local', status: 'running' })
})
