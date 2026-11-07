// Contract audited against lux-music-server src/server/api (2026-11-07).
// Credentials deliberately live outside common/renderer types.
export class LuxError extends Error {
  constructor(public readonly kind: 'storage' | 'invalid_input' | 'protocol' | 'offline' | 'unauthenticated' | 'rate_limited' | 'server' | 'request', public readonly status = 0) {
    super(`Lux ${kind}`)
    this.name = 'LuxError'
  }
}
export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LuxError('protocol')
  return value as Record<string, unknown>
}
export const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new LuxError('protocol')
  return value
}
export const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new LuxError('protocol')
  return value
}
const optionalText = (value: unknown) => {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new LuxError('protocol')
  return value
}
export const parseUser = (value: unknown) => {
  const user = record(value)
  if (!['admin', 'user'].includes(String(user.role)) || user.source !== 'managed' || user.status !== 'active') throw new LuxError('protocol')
  return { id: text(user.id), username: text(user.username), displayName: optionalText(user.displayName), role: user.role as 'admin' | 'user' }
}
export type LuxUser = ReturnType<typeof parseUser>
export const parseRefresh = (value: unknown) => {
  const data = record(value)
  return {
    accessToken: text(data.accessToken),
    accessTokenExpiresAt: number(data.accessTokenExpiresAt),
    refreshToken: text(data.refreshToken),
    sessionId: text(data.sessionId),
  }
}
export type LuxCredentials = ReturnType<typeof parseRefresh>
export const parseLogin = (value: unknown) => ({ ...parseRefresh(value), user: parseUser(record(value).user) })
export interface LoginInput { username: string, password: string, deviceId: string, deviceName: string, platform: string }
export const parseProfile = (value: unknown) => {
  const profile = record(record(value).profile)
  const result = { username: '', displayName: '', avatar: '', gender: '', signature: '' }
  for (const field of Object.keys(result) as Array<keyof typeof result>) {
    if (typeof profile[field] !== 'string') throw new LuxError('protocol')
    result[field] = profile[field]
  }
  if (!['male', 'female', 'unknown'].includes(result.gender)) throw new LuxError('protocol')
  return result
}
export type LuxProfile = ReturnType<typeof parseProfile>
export const parseOk = (value: unknown) => {
  if (record(value).ok !== true) throw new LuxError('protocol')
  return { ok: true as const }
}
