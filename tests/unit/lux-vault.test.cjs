const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto')
const test = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')
const fixture = require('../fixtures/lux-api.json')
const { SessionVault } = loadSource('src/main/modules/lux/vault.ts', { electron: { safeStorage: {} } })
const key = randomBytes(32)
const encrypted = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: value => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), bytes])
  },
  decryptString: bytes => {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
  },
}
const saved = { server: 'https://example.org/lux', deviceId: 'fixture-device', credentials: fixture.credentials, user: fixture.user, password: 'fixture-password' }
let directory, file

test.beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), 'lux-vault-test-')); file = path.join(directory, 'session.bin') })
test.afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

test('encrypted atomic roundtrip persists only whitelisted data with owner-only permissions', () => {
  const vault = new SessionVault(file, encrypted, 'linux')
  vault.save(saved)
  const bytes = readFileSync(file)
  for (const secret of [saved.deviceId, fixture.credentials.accessToken, fixture.credentials.refreshToken, saved.password]) assert.equal(bytes.includes(Buffer.from(secret)), false)
  const restored = vault.load()
  assert.equal(restored.server, 'https://example.org/lux/')
  assert.equal(restored.credentials.token, undefined)
  assert.equal(restored.password, undefined)
  assert.equal(restored.user.id, fixture.user.id)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(readdirSync(directory), ['session.bin'])
  assert.equal(vault.persistence.mode, 'encrypted')
  vault.clear()
  assert.equal(vault.load(), null)
})
test('unavailable/weak Linux backends never read or write plaintext and new login forgets old identity', () => {
  for (const backend of ['basic_text', 'unknown', 'unavailable']) {
    new SessionVault(file, encrypted).save(saved)
    const weak = { ...encrypted, isEncryptionAvailable: () => backend !== 'unavailable', getSelectedStorageBackend: () => backend, encryptString: () => { throw new Error('must not encrypt') }, decryptString: () => { throw new Error('must not decrypt') } }
    const vault = new SessionVault(file, weak, 'linux')
    assert.equal(vault.load(), null)
    assert.equal(statSync(file).isFile(), true)
    vault.save(saved)
    assert.deepEqual(vault.persistence, { mode: 'memory', issue: 'unavailable' })
    assert.deepEqual(readdirSync(directory), [])
  }
})
test('Windows/macOS use native encryption without consulting the Linux backend', () => {
  for (const platform of ['win32', 'darwin']) {
    const vault = new SessionVault(file, { ...encrypted, getSelectedStorageBackend: () => { throw new Error('linux only') } }, platform)
    vault.save(saved)
    assert.equal(vault.load().user.id, fixture.user.id)
  }
})
test('unreadable or wrong-version encrypted files remain intact and report a safe issue', () => {
  for (const bytes of [Buffer.from('corrupt fixture'), encrypted.encryptString(JSON.stringify({ version: 99 }))]) {
    writeFileSync(file, bytes)
    const vault = new SessionVault(file, encrypted)
    assert.equal(vault.load(), null)
    assert.equal(vault.persistence.issue, 'unreadable')
    assert.deepEqual(readFileSync(file), bytes)
  }
})
test('native encryption and filesystem failures yield fixed errors and preserve the previous ciphertext', () => {
  new SessionVault(file, encrypted).save(saved)
  const before = readFileSync(file)
  const broken = new SessionVault(file, { ...encrypted, encryptString: () => { throw new Error('fixture-native-sensitive-error') } })
  assert.throws(() => broken.save(saved), error => error.kind === 'storage' && !error.stack.includes('fixture-native-sensitive'))
  assert.deepEqual(readFileSync(file), before)
  assert.deepEqual(readdirSync(directory), ['session.bin'])
  assert.throws(() => new SessionVault(path.join(file, 'child'), encrypted).save(saved), error => error.kind === 'storage')
})
