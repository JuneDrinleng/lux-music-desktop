import { randomUUID } from 'node:crypto'
import type { LuxDeviceView, LuxSessionView } from '@common/luxIpc'
import { LuxError, record, text, number, parseOk } from './contract'
import type { LuxSession } from './session'

type Kind = 'session' | 'device'
interface Reference { id: string, kind: Kind, current: boolean }
const optionalText = (value: unknown) => value === undefined || value === '' ? '' : text(value)
const optionalNumber = (value: unknown) => value === undefined ? undefined : number(value)
const boolean = (value: unknown) => {
  if (typeof value !== 'boolean') throw new LuxError('protocol')
  return value
}
const array = (value: unknown) => {
  if (!Array.isArray(value)) throw new LuxError('protocol')
  return value as unknown[]
}

// Raw server identifiers stay in this bounded, main-only ledger. Stable opaque
// handles survive concurrent list requests; a lifecycle change invalidates all.
export class LuxDevices {
  private epoch = -1
  private readonly references = new Map<string, Reference>()
  private readonly handles = new Map<string, string>()
  constructor(private readonly session: LuxSession) {}
  private sync() {
    if (this.epoch === this.session.generation) return
    this.epoch = this.session.generation
    this.references.clear()
    this.handles.clear()
  }

  private check(epoch: number) {
    if (epoch !== this.session.generation) throw new LuxError('cancelled')
  }

  private reference(kind: Kind, id: string, current = false) {
    this.sync()
    const key = `${kind}:${id}`
    let handle = this.handles.get(key)
    if (!handle) {
      if (this.references.size >= 4096) this.remove(this.references.keys().next().value!)
      handle = randomUUID()
      this.handles.set(key, handle)
    }
    this.references.set(handle, { id, kind, current })
    return handle
  }

  private remove(handle: string) {
    const ref = this.references.get(handle)
    if (ref) this.handles.delete(`${ref.kind}:${ref.id}`)
    this.references.delete(handle)
  }

  private get(handle: string, kind: Kind) {
    this.sync()
    const ref = this.references.get(handle)
    if (!ref || ref.kind !== kind) throw new LuxError('invalid_input')
    return ref
  }

  async sessions(): Promise<LuxSessionView[]> {
    const epoch = this.session.generation
    const data = record(await this.session.authorize(async(client, token, signal) => client.call('api/me/sessions', 'GET', undefined, token, signal)))
    this.check(epoch)
    const items = array(data.sessions).map(value => {
      const item = record(value)
      const current = boolean(item.current)
      return {
        id: text(item.id),
        current,
        deviceName: optionalText(item.deviceName),
        platform: optionalText(item.platform),
        createdAt: number(item.createdAt),
        lastActiveAt: number(item.lastActiveAt),
      }
    })
    return items.map(({ id, ...item }) => ({ ...item, handle: this.reference('session', id, item.current) }))
  }

  async devices(): Promise<LuxDeviceView[]> {
    const epoch = this.session.generation
    const data = record(await this.session.authorize(async(client, token, signal) => client.call('api/me/devices', 'GET', undefined, token, signal)))
    this.check(epoch)
    const items = array(data.devices).map(value => {
      const item = record(value)
      return {
        id: text(item.clientId),
        deviceName: optionalText(item.deviceName),
        isMobile: item.isMobile === undefined ? false : boolean(item.isMobile),
        lastSeen: optionalNumber(item.lastSeen),
        lastConnectDate: optionalNumber(item.lastConnectDate),
      }
    })
    return items.map(({ id, ...item }) => ({ ...item, handle: this.reference('device', id) }))
  }

  private async revoke(handle: string, kind: Kind) {
    const ref = this.get(handle, kind)
    const epoch = this.session.generation
    const route = kind === 'session' ? 'sessions' : 'devices'
    const result = parseOk(await this.session.authorize(async(client, token, signal) => client.call(`api/me/${route}/${encodeURIComponent(ref.id)}`, 'DELETE', undefined, token, signal)))
    this.check(epoch)
    if (kind === 'session' && ref.current) this.session.forget()
    this.remove(handle)
    return result
  }

  async revokeSession(handle: string) { return this.revoke(handle, 'session') }
  async revokeDevice(handle: string) { return this.revoke(handle, 'device') }
  async revokeOthers() {
    const epoch = this.session.generation
    const data = record(await this.session.authorize(async(client, token, signal) => client.call('api/me/sessions/revoke-others', 'POST', {}, token, signal)))
    this.check(epoch)
    parseOk(data)
    const revoked = number(data.revoked)
    if (!Number.isInteger(revoked) || revoked < 0) throw new LuxError('protocol')
    for (const [handle, ref] of this.references) if (ref.kind === 'session' && !ref.current) this.remove(handle)
    return { ok: true as const, revoked }
  }
}
