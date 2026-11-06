const { ipcRenderer } = require('electron')
const installOfflineGuard = require('./offline.cjs')

installOfflineGuard(() => ipcRenderer.send('lux-evidence:network-blocked'))

// Runtime errors must remain visible even though the app has its own logger.
window.addEventListener('error', event => {
  ipcRenderer.send('lux-evidence:runtime-error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
  })
})
window.addEventListener('unhandledrejection', event => {
  if (event.reason?.code === 'EVIDENCE_OFFLINE') return
  ipcRenderer.send('lux-evidence:runtime-error', {
    message: String(event.reason?.stack ?? event.reason),
    source: 'unhandledrejection',
  })
})
