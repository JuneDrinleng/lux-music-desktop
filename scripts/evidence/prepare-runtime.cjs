// Lifecycle scripts are disabled during npm ci. Only the reviewed Electron
// installer is run explicitly; SQLite's packaged Node-API binding is probed
// in that exact Electron runtime before any application evidence is captured.
const { spawnSync } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const output = path.join(root, 'artifacts', 'runtime')
mkdirSync(output, { recursive: true })
const installer = spawnSync(process.execPath, [require.resolve('electron/install.js')], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, electron_config_cache: path.join(os.tmpdir(), 'lux-desktop-electron-cache') },
  maxBuffer: 8 * 1024 * 1024,
})
writeFileSync(path.join(output, 'electron-install.log'), `${installer.stdout || ''}${installer.stderr || ''}`)
if (installer.status !== 0) {
  console.error(installer.error || installer.stderr || installer.stdout)
  process.exit(installer.status || 1)
}
const expectedVersion = require('electron/package.json').version
const probe = spawnSync(require('electron'), ['-e', `
  const assert = require('node:assert/strict')
  assert.equal(process.versions.electron, process.env.LUX_EXPECTED_ELECTRON)
  const Database = require(process.env.LUX_SQLITE_PACKAGE)
  const db = new Database(':memory:')
  db.exec('CREATE TABLE smoke (value TEXT NOT NULL)')
  db.prepare('INSERT INTO smoke VALUES (?)').run('lux-runtime-ready')
  assert.equal(db.prepare('SELECT value FROM smoke').get().value, 'lux-runtime-ready')
  db.close()
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), versions: process.versions, platform: process.platform, arch: process.arch, sqlite: 'create/insert/select/close passed using packaged binding' }))
`], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LUX_EXPECTED_ELECTRON: expectedVersion, LUX_SQLITE_PACKAGE: require.resolve('better-sqlite3') },
  maxBuffer: 8 * 1024 * 1024,
})
writeFileSync(path.join(output, 'sqlite-probe.log'), `${probe.stdout || ''}${probe.stderr || ''}`)
if (probe.status !== 0) {
  console.error(probe.error || probe.stderr || probe.stdout)
  process.exit(probe.status || 1)
}
writeFileSync(path.join(output, 'runtime.json'), probe.stdout.trim() + '\n')
console.log(`Electron ${expectedVersion}: SQLite runtime probe passed`)
