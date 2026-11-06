import log from 'electron-log/node'
import { app } from 'electron'
import path from 'node:path'

log.transports.file.level = 'info'
// Honour the application's selected profile, including portable/isolated runs.
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log')
// log.initialize()
