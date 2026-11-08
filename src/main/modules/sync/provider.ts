export type SyncProviderId = 'local' | 'lx' | 'lux'
export type SyncProviderError = 'start_failed' | 'stop_failed' | 'provider_failed'
export interface SyncProviderState {
  provider: SyncProviderId
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  error?: SyncProviderError
}
export interface SyncProviderContext {
  // Adapters must settle start on abort and cancel requests/retry timers.
  signal: AbortSignal
  reportError: () => void
}
export interface SyncProvider {
  start: (context: SyncProviderContext) => Promise<void>
  // Must also clean up partial starts; safe to retry after a failed stop.
  stop: () => Promise<void>
}
interface ActiveProvider {
  provider: SyncProviderId
  adapter: SyncProvider
  controller: AbortController
  failure?: SyncProviderError
}

// Main-only infrastructure. Transport, credentials and data-space transactions
// belong to future adapters; importing this module starts no I/O.
export class SyncProviderLifecycle {
  private state: SyncProviderState = { provider: 'local', status: 'stopped' }
  private active?: ActiveProvider
  private revision = 0
  private queue: Promise<void> = Promise.resolve()
  private desired: SyncProviderId | null = null
  private flight?: Promise<SyncProviderState>
  private readonly providers: Record<SyncProviderId, SyncProvider>

  constructor(providers: Record<'lx' | 'lux', SyncProvider>) {
    this.providers = { ...providers, local: { start: async() => {}, stop: async() => {} } }
  }

  snapshot(): SyncProviderState { return { ...this.state } }
  async start(): Promise<SyncProviderState> { return this.switchTo(this.desired ?? this.state.provider) }
  async switchTo(provider: SyncProviderId): Promise<SyncProviderState> { return this.request(provider) }
  async stop(): Promise<SyncProviderState> { return this.request(null) }

  private async request(target: SyncProviderId | null): Promise<SyncProviderState> {
    if (target === this.desired) {
      if (this.flight) return this.flight
      if (this.state.status === (target === null ? 'stopped' : 'running')) return Promise.resolve(this.snapshot())
    }
    this.desired = target
    const revision = ++this.revision
    this.active?.controller.abort()
    const result = this.queue.then(async() => {
      if (revision !== this.revision) return this.snapshot()
      if (!await this.cleanup()) return this.snapshot()
      if (revision !== this.revision) return this.snapshot()
      if (target === null) {
        this.state = { provider: this.state.provider, status: 'stopped' }
        return this.snapshot()
      }
      await this.activate(target, revision)
      return this.snapshot()
    })
    this.queue = result.then(() => {})
    this.flight = result
    void result.then(() => { if (this.flight === result) this.flight = undefined })
    return result
  }

  private async cleanup(failure?: SyncProviderError): Promise<boolean> {
    const active = this.active
    if (!active) return true
    active.controller.abort()
    this.state = { provider: active.provider, status: 'stopping' }
    try { await active.adapter.stop() } catch {
      // Retain ownership so a later stop/switch retries cleanup before starting.
      this.state = { provider: active.provider, status: 'error', error: 'stop_failed' }
      return false
    }
    this.active = undefined
    this.state = failure
      ? { provider: active.provider, status: 'error', error: failure }
      : { provider: active.provider, status: 'stopped' }
    return true
  }

  private async activate(provider: SyncProviderId, revision: number) {
    const active: ActiveProvider = { provider, adapter: this.providers[provider], controller: new AbortController() }
    this.active = active
    this.state = { provider, status: 'starting' }
    const reportError = () => {
      if (this.active !== active || revision !== this.revision || active.controller.signal.aborted) return
      active.failure = 'provider_failed'
      active.controller.abort()
      this.state = { provider, status: 'error', error: active.failure }
      // Serialize asynchronous transport failures with start/stop/switch.
      this.queue = this.queue.then(async() => { if (this.active === active) await this.cleanup(active.failure) })
    }
    try { await active.adapter.start({ signal: active.controller.signal, reportError }) } catch {
      if (!active.controller.signal.aborted) active.failure = 'start_failed'
    }
    if (active.failure !== undefined || active.controller.signal.aborted) {
      await this.cleanup(active.failure)
      return
    }
    this.state = { provider, status: 'running' }
  }
}
