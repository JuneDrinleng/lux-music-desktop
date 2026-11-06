const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '../..')

// Execute the checked-in implementation without webpack/Electron. Only the
// unrelated I/O boundaries explicitly supplied by a test are replaced.
const loadSource = (relativePath, boundaries = {}) => {
  const cache = new Map()
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const nativeRequire = createRequire(file)
    const requireSource = specifier => {
      if (Object.hasOwn(boundaries, specifier)) return boundaries[specifier]
      let candidate
      if (specifier.startsWith('@common/')) candidate = path.join(root, 'src/common', specifier.slice(8))
      else if (specifier.startsWith('@renderer/')) candidate = path.join(root, 'src/renderer', specifier.slice(10))
      else if (specifier.startsWith('@main/')) candidate = path.join(root, 'src/main', specifier.slice(6))
      else if (specifier.startsWith('.')) candidate = path.resolve(path.dirname(file), specifier)
      if (!candidate) return nativeRequire(specifier)
      for (const name of [candidate, `${candidate}.ts`, `${candidate}.js`, path.join(candidate, 'index.ts'), path.join(candidate, 'index.js')]) {
        if (!fs.existsSync(name) || !fs.statSync(name).isFile()) continue
        return /\.(ts|js)$/.test(name) ? load(name) : nativeRequire(name)
      }
      return nativeRequire(specifier)
    }
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    })
    const errors = compiled.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error)
    if (errors.length) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: name => name,
        getNewLine: () => '\n',
      }))
    }
    const execute = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {\n${compiled.outputText}\n})`, { filename: file })
    execute(module.exports, requireSource, module, file, path.dirname(file))
    return module.exports
  }
  return load(path.join(root, relativePath))
}

const forbiddenBoundary = name => () => {
  throw new Error(`Offline unit test unexpectedly called ${name}`)
}

module.exports = { loadSource, forbiddenBoundary }
