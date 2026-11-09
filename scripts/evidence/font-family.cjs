const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const createUiTools = require('./ui.cjs')

// One owned Linux fixture only: an original empty primary and no secondary.
module.exports = async function verifyFontFamily(context) {
  const { execute, waitFor, readSetting, flushPaint, checks, observations, stage } = context
  const { click, i18nControl } = createUiTools(context)
  const hash = text => createHash('sha256').update(text).digest('hex')
  const row = "document.querySelector('#basic_font + div')"
  const primary = `${row}.children[0]`
  const menu = `${primary}.querySelector(':scope > .selection-list')`
  const inputs = []
  const input = async(name, expression) => { inputs.push({ name, point: await click(expression) }) }
  const snapshot = async() => ({
    ...await execute(`(() => {
      const family = selector => {
        const el = document.querySelector(selector); if (!el) throw new Error('Required font consumer missing: ' + selector);
        const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        if (!(r.width > 0 && r.height > 0) || s.display === 'none' || s.visibility !== 'visible') throw new Error('Hidden font consumer: ' + selector);
        return s.fontFamily;
      };
      const row = ${row}; if (!row) throw new Error('Original Basic font selection row is not mounted');
      return { renderer: window.lxData.appSetting['common.font'], defaultLabel: window.i18n.t('setting__desktop_lyric_font_default'),
        families: { html: family('html'), container: family('#container'), navigation: family('#left nav a[href="#/search"] > span') },
        selectionLabels: Array.from(row.children, el => {
          const label = el.querySelector('.label-content > .label'); if (!label) throw new Error('Original font label missing'); return label.textContent.trim();
        }) };
    })()`),
    main: global.lx.appSetting['common.font'],
    disk: readSetting()['common.font'],
  })
  const matches = (state, value) => ['renderer', 'main', 'disk'].every(key => state[key] === value)
  const inherits = state => state.families.container === state.families.html && state.families.navigation === state.families.html
  const painted = async() => { await execute('document.fonts.ready.then(() => true)'); await flushPaint() }
  const basic = async() => {
    await input('settings-route', 'document.querySelector(\'#left a[href="#/setting"]\')')
    await waitFor(() => execute('location.hash.split("?")[0] === "#/setting"'), 'original settings route')
    await input('basic-tab', i18nControl('#view [role=tab]', 'setting__basic'))
    await waitFor(() => execute(`Boolean(${row}) && !document.querySelector('#view .selection-list')`), 'original Basic font row and closed menus')
  }
  const open = async() => {
    await input('primary-open', `${primary}.querySelector(':scope > .label-content')`)
    await waitFor(() => execute(`(() => { const el = ${menu}; if (!el) return false; const s = getComputedStyle(el); return el.getBoundingClientRect().height > 0 && Number(s.opacity) >= .999 && Math.abs(new DOMMatrixReadOnly(s.transform).d - 1) < .001; })()`), 'original font menu fully expanded')
    await flushPaint()
  }
  const choose = async(label, name) => {
    const expression = `Array.from(${menu}.children).filter(el => el.getAttribute('aria-label') === ${JSON.stringify(label)})`
    if (!await execute(`${expression}.length === 1`)) throw new Error('Original font menu item is missing or ambiguous: ' + label)
    await input(name, `${expression}[0]`)
    await waitFor(() => execute(`!${menu}`), 'original font menu closes after native selection')
  }
  stage('M2a original installed font selection and inherited text')
  await basic(); await painted()
  const original = await snapshot()
  if (process.platform !== 'linux' || !matches(original, '') || !inherits(original) || original.selectionLabels.length !== 1 || original.selectionLabels[0] !== original.defaultLabel) throw new Error('Font probe requires owned empty Linux font fixture: ' + JSON.stringify(original))
  const started = performance.now()
  const args = ['-f', '%{family[0]}\n']
  const result = spawnSync('fc-list', args, { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 })
  const fontQuery = { executable: 'fc-list', args, timeoutMs: 2000, pid: result.pid, status: result.status, signal: result.signal, elapsedMs: performance.now() - started, error: result.error?.message, stderr: result.stderr, stdoutSha256: hash(result.stdout || '') }
  observations.push({ kind: 'font-family-os-query', ...fontQuery })
  if (result.error || result.status !== 0 || result.signal) throw new Error('Installed font enumeration failed: ' + JSON.stringify(fontQuery))
  const installed = new Set(result.stdout.split('\n').map(value => value.trim()).filter(Boolean))
  fontQuery.familyCount = installed.size
  const initialFamilies = original.families.html.split(',').map(value => value.trim().replace(/^["']|["']$/g, ''))
  let selected; let restored; let chosen; let failure
  const restore = async() => {
    await basic(); await open(); await choose(original.defaultLabel, 'restore-primary-default')
    await waitFor(async() => matches(await snapshot(), ''), 'original empty font restored in renderer/main/disk')
    await painted(); restored = await snapshot()
    if (!matches(restored, '') || JSON.stringify(restored.families) !== JSON.stringify(original.families) || JSON.stringify(restored.selectionLabels) !== JSON.stringify(original.selectionLabels)) throw new Error('Original empty primary/absent secondary or inherited font was not restored: ' + JSON.stringify(restored))
  }
  try {
    await open()
    await waitFor(() => execute(`${menu}.children.length > 1`), 'original IPC font-list options loaded')
    const labels = await execute(`Array.from(${menu}.children, el => el.getAttribute('aria-label'))`)
    chosen = labels.find(label => installed.has(label) && !initialFamilies.includes(label) && !/[,'"\\]/.test(label))
    if (!chosen) throw new Error('No distinct installed font exists in original menu')
    const value = /[\s()+]/.test(chosen) ? `"${chosen}"` : chosen
    await choose(chosen, 'installed-primary-select')
    await waitFor(async() => matches(await snapshot(), value), 'selected font renderer/main/disk agree')
    await painted(); selected = await snapshot()
    const first = selected.families.html.split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (!matches(selected, value) || !inherits(selected) || first !== chosen || selected.families.html === original.families.html || selected.selectionLabels.length !== 2 || selected.selectionLabels[0] !== chosen || selected.selectionLabels[1] !== original.defaultLabel) throw new Error('Original font selection did not inherit: ' + JSON.stringify(selected))
    fontQuery.selectedFamily = chosen
    fontQuery.menuLabelsSha256 = hash(JSON.stringify(labels))
  } catch (error) { failure = error } finally {
    try {
      await restore()
    } catch (error) {
      observations.push({ kind: 'font-family-cleanup-failure', message: String(error.stack || error) })
      failure ||= error
    }
  }
  if (failure) throw failure
  checks.push({ kind: 'shell-original-font-family', original, selected, restored, chosen, fontQuery, inputs })
}
