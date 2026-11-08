import type { LuxCommand, LuxProfile, LuxReplies, LuxResult, LuxState } from '@common/luxIpc'
import { LuxClient } from './client'
import { LuxDevices } from './devices'
import { LuxError } from './contract'
import type { LuxSession } from './session'

// Reject child frames, other windows and a main window navigated away from
// the application document. Query/hash are used by the existing app shell.
export const isLuxSender = (event: Electron.IpcMainInvokeEvent, contents: Electron.WebContents, documentURL: string) => {
  try {
    if (contents.isDestroyed() || event.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame) return false
    const actual = new URL(event.senderFrame.url)
    const expected = new URL(documentURL)
    return !actual.username && !actual.password && actual.protocol === expected.protocol && actual.origin === expected.origin && actual.pathname === expected.pathname
  } catch { return false }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LuxError('invalid_input')
  return value as Record<string, unknown>
}
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new LuxError('invalid_input')
}
const string = (value: unknown, max: number, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new LuxError('invalid_input')
  return value
}
const command = (input: unknown): LuxCommand => {
  const value = object(input)
  switch (value.action) {
    case 'state': case 'restore': case 'logout': case 'profile': case 'sessions': case 'devices': case 'revoke_others':
      keys(value, ['action']); return { action: value.action }
    case 'revoke_session': case 'revoke_device':
      keys(value, ['action', 'handle']); return { action: value.action, handle: string(value.handle, 128) }
    case 'server_info':
      keys(value, ['action', 'server']); return { action: value.action, server: string(value.server, 2048) }
    case 'login': case 'register': {
      keys(value, ['action', 'server', 'username', 'password', ...(value.action === 'register' ? ['inviteCode'] : [])])
      const login = { server: string(value.server, 2048), username: string(value.username, 256), password: string(value.password, 1024) }
      return value.action === 'register' ? { action: 'register', ...login, inviteCode: string(value.inviteCode, 512) } : { action: 'login', ...login }
    }
    case 'update_profile': {
      keys(value, ['action', 'profile'])
      const profile = object(value.profile)
      keys(profile, ['displayName', 'avatar', 'gender', 'signature'])
      const checked: Partial<Omit<LuxProfile, 'username'>> = {}
      for (const [field, limit] of [['displayName', 100], ['avatar', 200 * 1024], ['gender', 7], ['signature', 140]] as const) {
        if (Object.hasOwn(profile, field)) checked[field] = string(profile[field], limit, true)
      }
      if (checked.gender !== undefined && !['male', 'female', 'unknown'].includes(checked.gender)) throw new LuxError('invalid_input')
      return { action: 'update_profile', profile: checked }
    }
    default: throw new LuxError('invalid_input')
  }
}
const publicState = (session: LuxSession): LuxState => {
  const state = session.snapshot()
  return {
    status: state.status,
    verified: state.verified,
    persistence: { mode: state.persistence.mode, issue: state.persistence.issue },
    ...(state.server ? { server: state.server } : {}),
    ...(state.account ? { account: { username: state.account.username, displayName: state.account.displayName } } : {}),
  }
}
const publicProfile = (profile: LuxProfile): LuxProfile => ({ username: profile.username, displayName: profile.displayName, avatar: profile.avatar, gender: profile.gender, signature: profile.signature })

export const createLuxHandler = (session: LuxSession, trusted: (event: Electron.IpcMainInvokeEvent) => boolean) => {
  const devices = new LuxDevices(session)
  const mutation = { busy: false }
  return async(event: Electron.IpcMainInvokeEvent, input: unknown): Promise<LuxResult<LuxReplies[keyof LuxReplies]>> => {
    try { if (!trusted(event)) return { ok: false, error: { kind: 'forbidden', status: 0 } } } catch { return { ok: false, error: { kind: 'forbidden', status: 0 } } }
    let ownsMutation = false
    try {
      const data = command(input)
      if (['login', 'register', 'logout', 'restore', 'revoke_session', 'revoke_device', 'revoke_others'].includes(data.action)) {
        if (mutation.busy) return { ok: false, error: { kind: 'busy', status: 0 }, state: publicState(session) }
        mutation.busy = ownsMutation = true
      }
      let value: LuxReplies[keyof LuxReplies]
      switch (data.action) {
        case 'sessions': value = await devices.sessions(); break
        case 'devices': value = await devices.devices(); break
        case 'revoke_session': value = await devices.revokeSession(data.handle); break
        case 'revoke_device': value = await devices.revokeDevice(data.handle); break
        case 'revoke_others': value = await devices.revokeOthers(); break
        case 'state': value = publicState(session); break
        case 'login': case 'register':
          await session.login(data.server, data.username, data.password, data.action === 'register' ? data.inviteCode : undefined)
          value = publicState(session); break
        case 'restore': await session.restore(); value = publicState(session); break
        case 'logout': value = { remoteRevoked: (await session.logout()).remoteRevoked }; break
        case 'profile': value = publicProfile(await session.authorize(async(client, token, signal) => client.profile(token, signal))); break
        case 'update_profile': value = publicProfile(await session.authorize(async(client, token, signal) => client.updateProfile(token, data.profile, signal))); break
        case 'server_info': value = await new LuxClient(data.server).serverInfo(); break
      }
      return { ok: true, value, state: publicState(session) }
    } catch (error) {
      return { ok: false, error: error instanceof LuxError ? { kind: error.kind, status: error.status } : { kind: 'protocol', status: 0 }, state: publicState(session) }
    } finally { if (ownsMutation) mutation.busy = false }
  }
}
