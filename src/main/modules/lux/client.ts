import { request } from 'undici'
import { LuxError, record, text, parseLogin, parseRefresh, parseUser, parseProfile, parseOk, type LoginInput, type LuxProfile } from './contract'

export const serverURL = (input: string) => {
  try {
    const url = new URL(input)
    if (url.username || url.password || url.search || url.hash) throw new Error()
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error()
    url.pathname = url.pathname.replace(/\/+$/, '') + '/'
    return url.href
  } catch { throw new LuxError('invalid_input') }
}

// Bound to one canonical deployment URL. Neither redirects nor response URLs
// can move a Bearer credential to another server or deployment subpath.
export class LuxClient {
  readonly server: string
  constructor(server: string) { this.server = serverURL(server) }

  async call(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: object, accessToken?: string, signal?: AbortSignal): Promise<unknown> {
    if (!/^api\/[a-z0-9/._~%-]+$/i.test(path) || path.split('/').includes('..')) throw new LuxError('invalid_input')
    try {
      const response = await request(new URL(path, this.server), {
        method,
        signal,
        maxRedirections: 0,
        headersTimeout: 15000,
        bodyTimeout: 15000,
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      // Discarding an error/oversized body aborts the stream; consume its
      // local error event without exposing transport details to global logs.
      response.body.on('error', () => {})
      const status = response.statusCode
      if (status < 200 || status >= 300) {
        response.body.destroy()
        throw new LuxError(status === 401 ? 'unauthenticated' : status === 429 ? 'rate_limited' : status >= 500 ? 'server' : 'request', status)
      }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 1024 * 1024) { response.body.destroy(); throw new LuxError('protocol') }
        chunks.push(Buffer.from(chunk))
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new LuxError('protocol') }
    } catch (error) {
      // Never propagate URL, server message, body, headers or transport cause.
      if (error instanceof LuxError) throw error
      throw new LuxError('offline')
    }
  }

  async serverInfo(signal?: AbortSignal) {
    const data = record(await this.call('api/server-info', 'GET', undefined, undefined, signal))
    const registration = record(data.registration)
    if (registration.inviteOnly !== true || typeof registration.enabled !== 'boolean' || !Array.isArray(data.features) || !data.features.every(item => typeof item === 'string')) throw new LuxError('protocol')
    return { name: text(data.name), version: text(data.version), features: data.features, registration: { inviteOnly: true, enabled: registration.enabled } }
  }

  async login(input: LoginInput, signal?: AbortSignal) { return parseLogin(await this.call('api/auth/login', 'POST', input, undefined, signal)) }
  async register(input: LoginInput & { inviteCode: string, displayName?: string }, signal?: AbortSignal) {
    if (!input.inviteCode.trim()) throw new LuxError('invalid_input')
    return parseLogin(await this.call('api/auth/register', 'POST', input, undefined, signal))
  }

  async refresh(refreshToken: string, signal?: AbortSignal) { return parseRefresh(await this.call('api/auth/refresh', 'POST', { refreshToken }, undefined, signal)) }
  async me(accessToken: string, signal?: AbortSignal) { return parseUser(record(await this.call('api/auth/me', 'GET', undefined, accessToken, signal)).user) }
  async logout(accessToken: string, signal?: AbortSignal) { return parseOk(await this.call('api/auth/logout', 'POST', {}, accessToken, signal)) }
  async profile(accessToken: string, signal?: AbortSignal) { return parseProfile(await this.call('api/me/profile', 'GET', undefined, accessToken, signal)) }
  async updateProfile(accessToken: string, input: Partial<Omit<LuxProfile, 'username'>>, signal?: AbortSignal) {
    return parseProfile(await this.call('api/me/profile', 'PATCH', input, accessToken, signal))
  }

  async syncKey(accessToken: string, input: { deviceId: string, clientId?: string, deviceName: string, platform: string }, signal?: AbortSignal) {
    const data = record(await this.call('api/sync/key', 'POST', input, accessToken, signal))
    return { clientId: text(data.clientId), key: text(data.key), serverName: text(data.serverName), deviceName: text(data.deviceName) }
  }
}
