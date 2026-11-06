const net = require('node:net')

// The application uses Node HTTP clients as well as Chromium requests. Refusing
// TCP connections here keeps the evidence run independent of public services.
// Unix sockets / named pipes remain available to Electron itself.
module.exports = function installOfflineGuard(onBlocked = () => {}) {
  const originalConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function(...args) {
    const target = Array.isArray(args[0]) ? args[0][0] : args[0]
    const tcp = typeof target === 'number' ||
      (typeof target === 'string' && /^\d+$/.test(target)) ||
      (target && typeof target === 'object' && target.port !== undefined)
    if (!tcp) return originalConnect.apply(this, args)
    onBlocked()
    const error = new Error('Public network disabled for offline Electron evidence')
    error.code = 'EVIDENCE_OFFLINE'
    queueMicrotask(() => this.destroy(error))
    return this
  }
}
