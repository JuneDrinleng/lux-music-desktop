import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { LuxError, parseRefresh, parseUser, record, text } from './contract'
import { serverURL } from './client'

export interface SavedSession {
  server: string
  deviceId: string
  credentials: ReturnType<typeof parseRefresh>
  user: ReturnType<typeof parseUser>
}
export interface Persistence {
  mode: 'encrypted' | 'memory'
  issue?: 'unavailable' | 'unreadable'
}
type Encryption = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'getSelectedStorageBackend' | 'encryptString' | 'decryptString'>

const parseSaved = (input: unknown): SavedSession => {
  const data = record(input)
  const user = record(data.user)
  return {
    server: serverURL(text(data.server)),
    deviceId: text(data.deviceId),
    credentials: parseRefresh(data.credentials),
    user: parseUser({ ...user, source: 'managed', status: 'active' }),
  }
}

// Synchronous, small atomic writes avoid an older async write winning a logout
// or account switch. Only encrypted bytes reach this dedicated file.
export class SessionVault {
  private issue?: Persistence['issue']
  constructor(private readonly file: string, private readonly encryption: Encryption = safeStorage, private readonly platform: string = process.platform) {}

  private available() {
    try {
      return this.encryption.isEncryptionAvailable() && (this.platform !== 'linux' || !['basic_text', 'unknown'].includes(this.encryption.getSelectedStorageBackend()))
    } catch { return false }
  }

  get persistence(): Persistence {
    return { mode: this.available() ? 'encrypted' : 'memory', issue: this.issue ?? (this.available() ? undefined : 'unavailable') }
  }

  load(): SavedSession | null {
    if (!this.available()) { this.issue = 'unavailable'; return null }
    try {
      if (statSync(this.file).size > 1024 * 1024) throw new Error()
      const envelope = record(JSON.parse(this.encryption.decryptString(readFileSync(this.file))))
      if (envelope.version !== 1) throw new Error()
      const saved = parseSaved(envelope.session)
      this.issue = undefined
      return saved
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.issue = 'unreadable'
      // Do not delete an unreadable file or leak the native exception.
      return null
    }
  }

  save(input: SavedSession) {
    const saved = parseSaved(input)
    if (!this.available()) {
      // Explicit new login replaces an old identity even in memory-only mode;
      // a later restart must not resurrect a previous account from disk.
      this.clear()
      this.issue = 'unavailable'
      return
    }
    const temporary = `${this.file}.${randomUUID()}.tmp`
    try {
      const encrypted = this.encryption.encryptString(JSON.stringify({ version: 1, session: saved }))
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
      writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, this.file)
      this.issue = undefined
    } catch {
      throw new LuxError('storage')
    } finally {
      try { rmSync(temporary, { force: true }) } catch {}
    }
  }

  clear() {
    try { rmSync(this.file, { force: true }); this.issue = undefined } catch { throw new LuxError('storage') }
  }
}
