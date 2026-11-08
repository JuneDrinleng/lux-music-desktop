import { randomUUID } from 'node:crypto'
import { LuxClient } from './client'
import { LuxError, type LuxUser } from './contract'
import type { Persistence, SavedSession, SessionVault } from './vault'

type Vault = Pick<SessionVault, 'load' | 'save' | 'clear' | 'persistence'>
type Active = SavedSession & { client: LuxClient, verified: boolean }
type Operation<T> = (client: LuxClient, accessToken: string, signal: AbortSignal) => Promise<T>

export class LuxSession {
  private current: Active | null = null
  private controller = new AbortController()
  private revision = 0
  private loaded = false
  private persistenceIssue = false
  private flight?: { session: Active, revision: number, promise: Promise<void> }
  constructor(private readonly vault: Vault, private readonly createClient = (server: string) => new LuxClient(server), private readonly now = Date.now) {}

  get generation() { return this.revision }
  snapshot() {
    const session = this.current
    const persistence: Persistence | { mode: 'memory', issue: 'write_failed' } = this.persistenceIssue ? { mode: 'memory', issue: 'write_failed' } : this.vault.persistence
    return {
      status: session ? 'signed_in' as const : 'signed_out' as const,
      verified: session?.verified ?? false,
      persistence: { ...persistence },
      ...(session ? { server: session.server, account: { username: session.user.username, displayName: session.user.displayName ?? '' } } : {}),
    }
  }

  // M4b calls this when disabling/changing provider. No delayed response from
  // the previous lifecycle may refresh, persist or publish an identity.
  cancelRequests() {
    this.controller.abort()
    this.controller = new AbortController()
    this.revision++
    this.flight = undefined
  }

  private check(session: Active, revision: number) {
    if (session !== this.current || revision !== this.revision) throw new LuxError('cancelled')
  }

  forget() {
    this.vault.clear()
    this.current = null
    this.loaded = true
    this.persistenceIssue = false
    this.cancelRequests()
  }

  private save(session: Active) {
    try { this.vault.save(session); this.persistenceIssue = false } catch (error) {
      // The rotated credential is already live. Retain it in memory and try to
      // remove the spent refresh token from disk; never retry that spent token.
      this.persistenceIssue = true
      try { this.vault.clear() } catch {}
      throw error
    }
  }

  async login(server: string, username: string, password: string, inviteCode?: string) {
    const client = this.createClient(server)
    this.cancelRequests()
    const revision = this.revision
    const input = { username, password, deviceId: randomUUID(), deviceName: 'Lux Music Desktop', platform: process.platform }
    const credentials = inviteCode === undefined
      ? await client.login(input, this.controller.signal)
      : await client.register({ ...input, inviteCode }, this.controller.signal)
    if (revision !== this.revision) throw new LuxError('cancelled')
    const session: Active = { server: client.server, deviceId: input.deviceId, credentials, user: credentials.user, client, verified: true }
    this.vault.save(session)
    this.current = session
    this.loaded = true
    this.persistenceIssue = false
    return this.snapshot()
  }

  async restore() {
    if (!this.loaded) {
      this.loaded = true
      const saved = this.vault.load()
      if (saved) this.current = { ...saved, client: this.createClient(saved.server), verified: false }
    }
    const session = this.current
    if (!session) return this.snapshot()
    const revision = this.revision
    const user = await this.authorize(async(client, token, signal) => client.me(token, signal))
    this.check(session, revision)
    if (user.id !== session.user.id) { this.forget(); throw new LuxError('protocol') }
    session.user = user
    session.verified = true
    this.save(session)
    return this.snapshot()
  }

  private async refresh(session: Active, revision: number, rejectedToken?: string) {
    this.check(session, revision)
    if (rejectedToken && session.credentials.accessToken !== rejectedToken) return
    if (this.flight?.session === session && this.flight.revision === revision) return this.flight.promise
    const flight = { session, revision, promise: Promise.resolve() }
    flight.promise = (async() => {
      try {
        const credentials = await session.client.refresh(session.credentials.refreshToken, this.controller.signal)
        this.check(session, revision)
        if (credentials.sessionId !== session.credentials.sessionId) throw new LuxError('protocol')
        session.credentials = credentials
        this.save(session)
      } catch (error) {
        this.check(session, revision)
        if (error instanceof LuxError && error.status === 401) this.forget()
        throw error
      }
    })().finally(() => { if (this.flight === flight) this.flight = undefined })
    this.flight = flight
    return flight.promise
  }

  async authorize<T>(operation: Operation<T>): Promise<T> {
    const session = this.current
    if (!session) throw new LuxError('unauthenticated', 401)
    const revision = this.revision
    if (session.credentials.accessTokenExpiresAt <= this.now()) await this.refresh(session, revision)
    this.check(session, revision)
    const token = session.credentials.accessToken
    try {
      const result = await operation(session.client, token, this.controller.signal)
      this.check(session, revision)
      return result
    } catch (error) {
      this.check(session, revision)
      if (!(error instanceof LuxError) || error.status !== 401) throw error
      await this.refresh(session, revision, token)
      this.check(session, revision)
      try {
        const result = await operation(session.client, session.credentials.accessToken, this.controller.signal)
        this.check(session, revision)
        return result
      } catch (retryError) {
        this.check(session, revision)
        if (retryError instanceof LuxError && retryError.status === 401) this.forget()
        throw retryError
      }
    }
  }

  // Main-only provider seam: the renderer cannot choose a device identity or
  // obtain the returned sync key. Every issuance stays bound to this account.
  async requestSyncKey() {
    const session = this.current
    if (!session) throw new LuxError('unauthenticated', 401)
    return this.authorize(async(client, token, signal) => client.syncKey(token, {
      deviceId: session.deviceId, deviceName: 'Lux Music Desktop', platform: process.platform,
    }, signal))
  }

  async logout() {
    const session = this.current
    this.forget()
    if (!session) return { remoteRevoked: true }
    try { await session.client.logout(session.credentials.accessToken); return { remoteRevoked: true } } catch (error) {
      return { remoteRevoked: error instanceof LuxError && error.status === 401 }
    }
  }
}

export type SessionSnapshot = ReturnType<LuxSession['snapshot']>
export type { LuxUser }
