const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const projects = [
  ['main/tsconfig.json', 'typescript/bin/tsc'],
  ['renderer/tsconfig.json', 'vue-tsc/bin/vue-tsc.js'],
  ['renderer-lyric/tsconfig.json', 'vue-tsc/bin/vue-tsc.js'],
  ['common/tsconfig.json', 'typescript/bin/tsc'],
  ['lang/tsconfig.json', 'typescript/bin/tsc'],
  ['renderer/tsconfig.javascript.json', 'vue-tsc/bin/vue-tsc.js'],
  ['renderer-lyric/tsconfig.javascript.json', 'vue-tsc/bin/vue-tsc.js'],
]
let failed = false
for (const [project, compiler] of projects) {
  console.log(`\nTypecheck src/${project} with ${compiler}`)
  const result = spawnSync(process.execPath, [require.resolve(compiler), '--noEmit', '--pretty', 'false', '-p', `src/${project}`], { cwd: root, stdio: 'inherit' })
  if (result.error) console.error(result.error)
  if (result.status !== 0) failed = true
}
if (failed) process.exitCode = 1
