// Deterministic raw HTTP responses only. Production Needle/SDK/store/router/IPC
// still parse, cache, paginate, persist and render them; no app state is patched.
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const attempts = new Map()
window.__searchFixture = { requests: [], expectedFailures: 0, runtimeErrors: [] }
window.addEventListener('error', event => {
  window.__searchFixture.runtimeErrors.push({ message: event.message, stack: event.error?.stack, elapsedMs: performance.now() })
})
window.addEventListener('unhandledrejection', event => {
  if (event.reason?.code !== 'EVIDENCE_SEARCH_FAILURE') return
  window.__searchFixture.expectedFailures++
  event.stopImmediatePropagation() // Known injected failure; every other error remains fatal.
})
for (const protocol of ['http', 'https']) {
  const client = require(`node:${protocol}`)
  const original = client.request
  client.request = function(options, callback) {
    const host = options.hostname || options.host
    if (!['search.kuwo.cn', 'tips.kuwo.cn', 'hotword.kuwo.cn'].includes(host)) return original.apply(this, arguments)
    const url = new URL(`${protocol}://${host}${options.path}`)
    const text = url.searchParams.get('all') || url.searchParams.get('w') || ''
    const page = Number(url.searchParams.get('pn') || 0) + 1
    const limit = Number(url.searchParams.get('rn') || 30)
    const type = url.searchParams.get('ft')
    const key = `${type}:${text}:${page}`
    attempts.set(key, (attempts.get(key) || 0) + 1)
    const fail = host === 'search.kuwo.cn' && text === 'fixture-retry' && attempts.get(key) === 1
    const total = text === 'fixture-empty' ? 0 : 90
    const cover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#dbeb92"/><text x="15" y="100" font-family="sans-serif" font-weight="800" font-size="34">FIXTURE</text></svg>')
    let body
    if (host === 'tips.kuwo.cn') body = { WORDITEMS: [{ RELWORD: 'fixture-collection' }, { RELWORD: 'fixture-empty' }] }
    else if (host === 'hotword.kuwo.cn') body = { status: 'ok', tagvalue: [{ key: 'fixture-collection' }, { key: 'fixture-empty' }] }
    else {
      body = {
        TOTAL: String(total),
        SHOW: '1',
        abslist: Array.from({ length: total ? limit : 0 }, (_, i) => {
          const id = (page - 1) * limit + i + 1
          return type === 'playlist'
            ? { playlistid: id, name: `FIXTURE · 夜间选集 ${id}`, nickname: '离线歌单 fixture', songnum: 24, playcnt: 1200, pic: cover, intro: 'Deterministic evidence only' }
            : { MUSICRID: `MUSIC_${id}`, SONGNAME: `FIXTURE · 夜航 ${String(id).padStart(2, '0')}`, ARTIST: '离线演出者', ALBUM: '纸上声音 · fixture', ALBUMID: '1', DURATION: '213', N_MINFO: 'level:exhigh,bitrate:320,format:mp3,size:8m' }
        }),
      }
    }
    window.__searchFixture.requests.push({ host, type, text, page, limit, fail })
    const request = new EventEmitter()
    let timer
    request.write = () => true
    request.abort = () => { clearTimeout(timer); request.emit('abort') }
    request.end = () => {
      timer = setTimeout(() => {
        if (fail) return request.emit('error', Object.assign(new Error('Injected offline search failure'), { code: 'EVIDENCE_SEARCH_FAILURE' }))
        const response = new PassThrough()
        response.statusCode = 200
        response.headers = { 'content-type': `${type === 'playlist' ? 'text/plain' : 'application/json'}; charset=utf-8` }
        callback(response)
        // The playlist SDK deliberately parses the upstream single-quoted text.
        const raw = JSON.stringify(body)
        response.end(type === 'playlist' ? raw.replace(/"/g, "'") : raw)
      }, 350)
    }
    return request
  }
}
