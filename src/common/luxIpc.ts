// Renderer-facing contract. No credential, user ID or device ID is returned.
export const LUX_ACCOUNT_CHANNEL = 'lux:account'
export interface LuxState {
  status: 'signed_in' | 'signed_out'
  verified: boolean
  persistence: { mode: 'encrypted' | 'memory', issue?: 'unavailable' | 'unreadable' | 'write_failed' }
  server?: string
  account?: { username: string, displayName: string }
}
export interface LuxProfile { username: string, displayName: string, avatar: string, gender: string, signature: string }
export interface LuxSessionView { handle: string, current: boolean, deviceName: string, platform: string, createdAt: number, lastActiveAt: number }
export interface LuxDeviceView { handle: string, deviceName: string, isMobile: boolean, lastSeen?: number, lastConnectDate?: number }
export interface LuxReplies {
  sessions: LuxSessionView[]
  devices: LuxDeviceView[]
  revoke_session: { ok: true }
  revoke_device: { ok: true }
  revoke_others: { ok: true, revoked: number }
  state: LuxState
  login: LuxState
  register: LuxState
  restore: LuxState
  logout: { remoteRevoked: boolean }
  server_info: { name: string, version: string, features: string[], registration: { inviteOnly: boolean, enabled: boolean } }
  profile: LuxProfile
  update_profile: LuxProfile
}
export type LuxCommand =
  | { action: 'state' | 'restore' | 'logout' | 'profile' | 'sessions' | 'devices' | 'revoke_others' }
  | { action: 'revoke_session' | 'revoke_device', handle: string }
  | { action: 'server_info', server: string }
  | { action: 'login', server: string, username: string, password: string }
  | { action: 'register', server: string, username: string, password: string, inviteCode: string }
  | { action: 'update_profile', profile: Partial<Omit<LuxProfile, 'username'>> }
export type LuxErrorKind = 'invalid_input' | 'protocol' | 'offline' | 'unauthenticated' | 'rate_limited' | 'server' | 'request' | 'storage' | 'cancelled' | 'forbidden' | 'busy'
export type LuxResult<T> =
  | { ok: true, value: T, state: LuxState }
  | { ok: false, error: { kind: LuxErrorKind, status: number }, state?: LuxState }
