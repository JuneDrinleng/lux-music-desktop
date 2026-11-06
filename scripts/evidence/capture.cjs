const { createHash } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const output = path.resolve(root, process.env.LUX_EVIDENCE_DIR ?? 'docs/screenshots/m0')
const sizes = (process.env.LUX_EVIDENCE_SIZES ?? '1280x800,1024x700').split(',').map(value => {
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) throw new Error(`Invalid LUX_EVIDENCE_SIZES entry: ${value}`)
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < 800 || height < 500 || width > 3840 || height > 2160) throw new Error(`Unsupported evidence size: ${value}`)
  return { width, height }
})
const sha256 = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
const git = args => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

async function run() {
  // Hash the complete build before capture, not only its entry points.
  const buildFiles = fs.readdirSync(path.join(root, 'dist'), { recursive: true })
    .filter(name => fs.statSync(path.join(root, 'dist', name)).isFile())
    .sort()
  for (const entry of ['main.js', 'index.html', 'renderer.js']) {
    if (!buildFiles.includes(entry)) throw new Error(`Missing dist/${entry}; build main and renderer first`)
  }
  const build = Object.fromEntries(buildFiles.map(name => [name, sha256(path.join(root, 'dist', name))]))
  const harnessFiles = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs')).sort()
  const source = {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    pullRequestHeadSha: process.env.LUX_PR_HEAD_SHA ?? null,
    pullRequestBaseSha: process.env.LUX_PR_BASE_SHA ?? null,
    dirty: git(['status', '--porcelain']) !== '',
    buildSha256: build,
    harnessSha256: Object.fromEntries(harnessFiles.map(name => [name, sha256(path.join(__dirname, name))])),
  }
  // Electron 42's JS entry downloads the executable when it is missing. Read the
  // installed marker directly so a capture never starts an implicit installer.
  const electronPackage = path.dirname(require.resolve('electron/package.json'))
  const marker = path.join(electronPackage, 'path.txt')
  const executable = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null
  const electron = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executable ?? 'electron')
    : executable ? path.join(electronPackage, 'dist', executable) : null
  if (!electron || !fs.existsSync(electron)) throw new Error('Electron binary unavailable; run the reviewed runtime preparation first')
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-electron-evidence-'))
  fs.mkdirSync(output, { recursive: true })
  const configPath = path.join(scratch, 'capture-config.json')
  fs.writeFileSync(configPath, JSON.stringify({ root, output, sizes, source, scratch, command: 'npm run evidence', driverNode: process.version }, null, 2))
  const args = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1', path.join(__dirname, 'electron-main.cjs'), '-dha', '-dt']
  const env = { ...process.env, LUX_EVIDENCE_CONFIG: configPath }
  delete env.ELECTRON_RUN_AS_NODE
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN', 'BT_TOKEN']) delete env[name]
  let command = electron
  let commandArgs = args
  let displayAvailable = Boolean(process.env.DISPLAY)
  if (process.platform === 'linux' && displayAvailable) {
    try {
      execFileSync('xdpyinfo', ['-display', process.env.DISPLAY], { stdio: 'ignore', timeout: 3000 })
    } catch {
      displayAvailable = false
    }
  }
  if (process.platform === 'linux' && !displayAvailable) {
    command = 'xvfb-run'
    commandArgs = ['--auto-servernum', '--server-args=-screen 0 1920x1200x24', electron, ...args]
  }
  const log = fs.createWriteStream(path.join(output, 'electron.log'))
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', data => { process.stdout.write(data); log.write(data) })
      child.stderr.on('data', data => { process.stderr.write(data); log.write(data) })
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    })
    if (code !== 0) throw new Error(`Electron evidence failed with exit code ${code}; inspect ${output}/electron.log`)
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'))
    if (manifest.status !== 'passed' || manifest.captures.length !== sizes.length * 6) throw new Error('Evidence manifest is incomplete')
    for (const item of [...manifest.captures, ...(manifest.observations ?? [])]) {
      if (sha256(path.join(output, item.file)) !== item.sha256) throw new Error(`Screenshot digest mismatch: ${item.file}`)
    }
    console.log(`Verified ${manifest.captures.length} real Electron screenshots: ${path.relative(root, output)}/manifest.json`)
  } finally {
    await new Promise(resolve => log.end(resolve))
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

run().catch(error => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
