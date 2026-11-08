import { app } from 'electron'
import { join } from 'node:path'
import { SessionVault } from './vault'
import { LuxSession } from './session'

let session: LuxSession | undefined
export const getLuxSession = () => {
  if (!session) {
    session = new LuxSession(new SessionVault(join(app.getPath('userData'), 'LuxSession', 'session.bin')))
    app.once('before-quit', () => { session?.cancelRequests() })
  }
  return session
}
