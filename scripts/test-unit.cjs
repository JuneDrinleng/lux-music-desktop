const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const directory = path.join(root, 'tests/unit')
const files = fs.readdirSync(directory)
  .filter(name => name.endsWith('.test.cjs'))
  .sort()
  .map(name => path.join(directory, name))

if (!files.length) throw new Error('No unit tests found')
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {
  cwd: root,
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
