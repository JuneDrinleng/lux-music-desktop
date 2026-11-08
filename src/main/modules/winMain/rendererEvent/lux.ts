import { ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LUX_ACCOUNT_CHANNEL } from '@common/luxIpc'
import { getLuxSession } from '@main/modules/lux'
import { createLuxHandler, isLuxSender } from '@main/modules/lux/ipc'
import { getWebContents } from '../main'

export default () => {
  const session = getLuxSession()
  const documentURL = process.env.NODE_ENV === 'production' ? pathToFileURL(join(__dirname, 'index.html')).href : 'http://localhost:9080/'
  ipcMain.handle(LUX_ACCOUNT_CHANNEL, createLuxHandler(session, event => isLuxSender(event, getWebContents(), documentURL)))
  // Restoration failure remains a safe unverified state; explicit restore IPC
  // reports a typed error and allows retry without logging native exceptions.
  void session.restore().catch(() => {})
}
