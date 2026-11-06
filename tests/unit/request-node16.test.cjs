const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')

// Both variants execute the unchanged production module with a real installed
// HTTP implementation. Separate real Agents keep the versions' redirect APIs
// isolated even though Undici shares a process-wide global dispatcher symbol.
const clients = ['undici', 'undici-legacy'].map(packageName => {
  const undici = require(packageName)
  const previousDispatcher = undici.getGlobalDispatcher()
  const dispatcher = new undici.Agent()
  undici.setGlobalDispatcher(dispatcher)
  try {
    const { request } = loadSource('src/common/utils/request_node16.ts', { undici })
    return { request, dispatcher, version: require(`${packageName}/package.json`).version }
  } finally {
    undici.setGlobalDispatcher(previousDispatcher)
  }
})
let server
let address

test.before(async() => {
  server = http.createServer(async(incoming, response) => {
    const url = new URL(incoming.url, 'http://127.0.0.1')
    const chain = /^\/chain\/(\d+)$/.exec(url.pathname)
    if (url.pathname === '/redirect' || (chain && Number(chain[1]) > 0)) {
      response.writeHead(302, { Location: chain ? `/chain/${Number(chain[1]) - 1}` : '/target' })
      response.end('redirect')
      return
    }
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/echo') {
      const chunks = []
      for await (const chunk of incoming) chunks.push(chunk)
      response.end(JSON.stringify({
        method: incoming.method,
        query: Object.fromEntries(url.searchParams),
        contentType: incoming.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      }))
      return
    }
    response.end(JSON.stringify({ ok: true, name: '夜曲' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  address = `http://127.0.0.1:${server.address().port}`
})

test.after(async() => {
  await Promise.all(clients.map(({ dispatcher }) => dispatcher.close()))
  if (!server) return
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
})

for (const { request, version } of clients) {
  test(`legacy HTTP requests follow redirects by default (Undici ${version})`, async() => {
    const result = await request(`${address}/redirect`)
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, { ok: true, name: '夜曲' })
  })

  test(`legacy HTTP requests preserve the 302 response when redirects are disabled (Undici ${version})`, async() => {
    const result = await request(`${address}/redirect`, { maxRedirect: 0 })
    assert.equal(result.statusCode, 302)
    assert.equal(result.headers.location, '/target')
    assert.equal(result.body, 'redirect')
  })

  test(`legacy HTTP redirect chains stop when the configured redirect budget is exhausted (Undici ${version})`, async() => {
    const result = await request(`${address}/chain/4`, { maxRedirect: 2 })
    assert.equal(result.statusCode, 302)
    assert.equal(result.headers.location, '/chain/1')
  })

  test(`legacy HTTP redirect chains reach the target when the configured budget is sufficient (Undici ${version})`, async() => {
    const result = await request(`${address}/chain/4`, { maxRedirect: 4 })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body, { ok: true, name: '夜曲' })
  })

  test(`legacy HTTP requests preserve Unicode query parameters without splitting reserved characters (Undici ${version})`, async() => {
    const result = await request(`${address}/echo`, { query: { q: '夜曲 & x', page: 2 } })
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.method, 'GET')
    assert.deepEqual(result.body.query, { q: '夜曲 & x', page: '2' })
  })

  test(`legacy HTTP JSON requests preserve method, content type, and serialized payload (Undici ${version})`, async() => {
    const json = { listId: 'love', songs: ['夜曲'], enabled: true }
    const result = await request(`${address}/echo`, { method: 'POST', json })
    assert.equal(result.body.method, 'POST')
    assert.equal(result.body.contentType, 'application/json')
    assert.deepEqual(JSON.parse(result.body.body), json)
  })

  test(`legacy HTTP raw responses preserve bytes without JSON conversion (Undici ${version})`, async() => {
    const result = await request(`${address}/target`, { needRaw: true })
    assert.equal(result.statusCode, 200)
    assert.ok(result.raw instanceof Uint8Array)
    assert.equal(Buffer.from(result.raw).toString('utf8'), JSON.stringify({ ok: true, name: '夜曲' }))
    assert.equal(result.body, undefined)
  })
}
