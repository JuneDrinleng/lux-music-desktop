const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { loadSource, forbiddenBoundary } = require('../helpers/load-source.cjs')
const specification = require('../fixtures/magazine-palettes.json')
const registry = require('../../src/common/theme/index.json')
const { createThemeColors } = require('../../src/common/theme/utils')
const {
  MAGAZINE_THEME_IDS,
  DEFAULT_MAGAZINE_THEME_ID,
  DEFAULT_MAGAZINE_DARK_THEME_ID,
  createMagazineThemes,
  magazineThemes,
  resolveThemeColors,
  getPreferredThemeId,
  getFallbackThemeId,
} = require('../../src/common/theme/magazine')

const legacyIds = ['green', 'blue', 'blue_plus', 'orange', 'red', 'pink', 'purple', 'grey', 'ming', 'blue2', 'black', 'mid_autumn', 'naruto', 'china_ink', 'happy_new_year']
const clone = value => JSON.parse(JSON.stringify(value))
const cssRole = role => '--lux-' + role.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())
const coreCssKeys = Object.keys(specification.roles).map(cssRole).sort()
const generated = createMagazineThemes(createThemeColors)
const paletteFor = id => generated.find(theme => theme.id === id)

// Resolve aliases only to inspect the custom editor's actual output. Unresolved
// variables/cycles fail instead of silently assuming a fixed palette color.
const cssValue = (colors, key, visited = new Set()) => {
  assert.ok(!visited.has(key), `CSS alias cycle at ${key}`)
  visited.add(key)
  const value = colors[key]
  assert.equal(typeof value, 'string', `Missing CSS value ${key}`)
  const alias = /^var\((--[\w-]+)\)$/.exec(value)
  return alias ? cssValue(colors, alias[1], visited) : value
}

const luminance = hex => {
  assert.match(hex, /^#[\da-f]{6}$/i)
  const channels = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('magazine registry has the six specified identities, names, modes and defaults', () => {
  assert.deepEqual(MAGAZINE_THEME_IDS, specification.ids)
  assert.equal(DEFAULT_MAGAZINE_THEME_ID, 'lime')
  assert.equal(DEFAULT_MAGAZINE_DARK_THEME_ID, 'ink_night')
  assert.deepEqual(generated.map(theme => theme.id), specification.ids)
  assert.deepEqual(generated.map(theme => theme.name), specification.names)
  assert.deepEqual(generated.map(theme => theme.isDark), specification.dark)
  assert.ok(generated.every(theme => theme.isCustom === false))
})

for (const [index, id] of specification.ids.entries()) {
  test(`${id} exposes all 22 exact mobile core roles and safe legacy text mappings`, () => {
    const theme = paletteFor(id)
    const colors = resolveThemeColors(theme)
    assert.deepEqual(Object.keys(magazineThemes[id].roles).sort(), Object.keys(specification.roles).sort())
    assert.deepEqual(Object.keys(colors).filter(key => key.startsWith('--lux-') && key !== '--lux-color-scheme').sort(), coreCssKeys)
    for (const [role, values] of Object.entries(specification.roles)) {
      assert.equal(colors[cssRole(role)], values[index], `${id}.${role}`)
    }
    assert.equal(colors['--lux-color-scheme'], specification.dark[index] ? 'dark' : 'light')
    assert.equal(colors['--color-font'], specification.roles.list[index])
    assert.equal(colors['--color-font-label'], specification.roles.muted[index])
    assert.equal(colors['--color-primary-font'], specification.roles.accentInk[index])
    assert.equal(colors['--color-nav-font'], specification.roles.accentInk[index])
    assert.equal(colors['--color-button-font'], specification.roles.accentInk[index])
    assert.equal(colors['--color-button-background-selected'], specification.roles.accentSoft[index])
  })

  test(`${id} body, accent text and button color pairs meet 4.5:1 normal text contrast`, () => {
    const colors = resolveThemeColors(paletteFor(id))
    const pairs = [
      ['--lux-ink', '--lux-paper'],
      ['--lux-display', '--lux-paper'],
      ['--lux-list', '--lux-paper'],
      ['--lux-ink', '--lux-paper-raised'],
      ['--lux-accent-ink', '--lux-paper'],
      ['--lux-accent-ink', '--lux-accent-soft'],
      ['--lux-on-accent', '--lux-accent'],
      ['--lux-on-ink', '--lux-ink'],
    ]
    for (const [foreground, background] of pairs) {
      const ratio = contrast(colors[foreground], colors[background])
      assert.ok(ratio >= 4.5, `${id}: ${foreground}/${background} = ${ratio.toFixed(3)}:1`)
    }
  })
}

test('checked-in generated registry keeps all 15 legacy themes and adds the six editable standard records', () => {
  assert.equal(registry.length, 21)
  assert.equal(new Set(registry.map(theme => theme.id)).size, registry.length)
  assert.deepEqual(registry.slice(0, 6), generated)
  assert.deepEqual(registry.slice(6).map(theme => theme.id), legacyIds)
  for (const theme of registry) {
    assert.deepEqual(clone(theme), theme)
    assert.ok(!Object.keys(theme.config.themeColors).some(key => key.startsWith('--lux-')))
    assert.ok(!Object.keys(theme.config.extInfo).some(key => key.startsWith('--lux-')))
  }
  for (const id of ['black', 'mid_autumn', 'naruto', 'china_ink', 'happy_new_year']) {
    assert.match(registry.find(theme => theme.id === id).config.extInfo['--background-image'], /^url\(.+\)$/)
  }
})

test('a custom clone follows edited primary, text, navigation and background without builtin locks', () => {
  const theme = clone(paletteFor('lime'))
  theme.id = 'user_theme_editor'
  theme.isCustom = true
  const before = resolveThemeColors(theme)
  theme.config.themeColors = createThemeColors('rgb(72, 83, 140)', 'rgb(42, 52, 62)', false, false)
  theme.config.extInfo['--color-main-background'] = 'rgba(241, 230, 218, 0.85)'
  theme.config.extInfo['--color-nav-font'] = 'rgb(31, 41, 51)'
  theme.config.extInfo['--background-image'] = 'custom wallpaper.png'
  const colors = resolveThemeColors(theme)
  assert.equal(cssValue(colors, '--lux-accent'), 'rgb(72, 83, 140)')
  assert.equal(cssValue(colors, '--lux-ink'), 'rgb(42, 52, 62)')
  assert.equal(cssValue(colors, '--lux-paper'), 'rgba(241, 230, 218, 0.85)')
  assert.equal(colors['--color-nav-font'], 'rgb(31, 41, 51)')
  assert.equal(colors['--background-image'], 'custom wallpaper.png')
  assert.notEqual(cssValue(before, '--lux-accent'), cssValue(colors, '--lux-accent'))
  assert.notEqual(cssValue(before, '--lux-ink'), cssValue(colors, '--lux-ink'))
  assert.ok(!Object.hasOwn(colors, '--color-font'), 'custom color-font must retain the existing CSS default')
  // A custom record retaining a builtin id must still honor its editor values.
  theme.id = 'lime'
  assert.equal(cssValue(resolveThemeColors(theme), '--lux-accent'), 'rgb(72, 83, 140)')
})

test('runtime resolution is fresh, does not mutate stored records and fully replaces dark semantic roles', () => {
  for (const theme of [...registry, { ...clone(paletteFor('ink_night')), id: 'user_theme_dark', isCustom: true }]) {
    const original = clone(theme)
    const colors = resolveThemeColors(theme)
    assert.deepEqual(theme, original)
    colors['--lux-paper'] = 'corrupted consumer value'
    assert.notEqual(resolveThemeColors(theme)['--lux-paper'], 'corrupted consumer value')
    assert.deepEqual(theme, original)
  }
  const applied = {}
  const sequence = ['ink_night', 'green', 'lime']
  for (const id of sequence) {
    const colors = resolveThemeColors(registry.find(theme => theme.id === id))
    assert.deepEqual(Object.keys(colors).filter(key => key.startsWith('--lux-') && key !== '--lux-color-scheme').sort(), coreCssKeys)
    Object.assign(applied, colors)
    for (const key of coreCssKeys) assert.equal(applied[key], colors[key], `${id} did not replace ${key}`)
    assert.equal(applied['--lux-color-scheme'], id === 'ink_night' ? 'dark' : 'light')
    if (id === 'green') {
      assert.equal(applied['--lux-paper'], 'var(--color-main-background)')
      assert.equal(applied['--lux-scrim'], 'rgba(17, 24, 39, 0.32)')
    }
  }
})

test('preferred and missing selections keep fixed ids stable and choose auto fallbacks by OS mode', () => {
  for (const dark of [false, true]) {
    for (const id of [...specification.ids, ...legacyIds, 'user_theme_custom']) {
      assert.equal(getPreferredThemeId(id, 'green', 'black', dark), id)
      assert.equal(getFallbackThemeId(id, dark), 'lime')
    }
    assert.equal(getPreferredThemeId('auto', 'sakura', 'ink_night', dark), dark ? 'ink_night' : 'sakura')
    assert.equal(getFallbackThemeId('auto', dark), dark ? 'ink_night' : 'lime')
    assert.equal(getFallbackThemeId('unknown', dark), 'lime')
  }
})

const createApplicationBoundaries = (themeList = []) => {
  let storedSetting
  const themeStore = {
    get: key => {
      assert.equal(key, 'themes')
      return themeList
    },
    set: forbiddenBoundary('unexpected theme persistence'),
  }
  const appStore = { override: value => { storedSetting = value.setting } }
  const nativeTheme = { shouldUseDarkColors: false }
  const boundaries = {
    'electron-log/node': {},
    electron: { nativeTheme, powerSaveBlocker: {} },
    '@main/utils/store': name => {
      if (name === 'theme') return themeStore
      assert.equal(name, 'config_v2')
      return appStore
    },
    './migrate': {
      migrateDataJson: forbiddenBoundary('data migration'),
      migrateHotKey: forbiddenBoundary('hotkey migration'),
      migrateUserApi: forbiddenBoundary('API migration'),
      parseDataFile: forbiddenBoundary('filesystem settings read'),
    },
  }
  return { boundaries, nativeTheme, storedSetting: () => storedSetting }
}

test('a new profile defaults to lime in every month, including January; old saved selections remain intact', () => {
  const OriginalDate = global.Date
  const originalEnv = global.envParams
  global.envParams = { cmdParams: {} }
  try {
    for (let month = 0; month < 12; month++) {
      global.Date = class extends OriginalDate { getMonth() { return month } }
      const { boundaries, storedSetting } = createApplicationBoundaries()
      const app = loadSource('src/main/utils/index.ts', boundaries)
      const fresh = app.updateSetting({}, true).setting
      assert.equal(fresh['theme.id'], 'lime', `new profile month ${month + 1}`)
      assert.equal(fresh['theme.lightId'], 'lime')
      assert.equal(fresh['theme.darkId'], 'ink_night')
      assert.deepEqual(storedSetting(), fresh)
      for (const id of ['green', 'black', 'happy_new_year', 'user_theme_wallpaper', 'auto']) {
        const saved = { version: '2.1.0', 'theme.id': id, 'theme.lightId': 'mid_autumn', 'theme.darkId': 'black' }
        const actual = app.updateSetting(saved, true).setting
        assert.equal(actual['theme.id'], id)
        assert.equal(actual['theme.lightId'], 'mid_autumn')
        assert.equal(actual['theme.darkId'], 'black')
        assert.deepEqual(saved, { version: '2.1.0', 'theme.id': id, 'theme.lightId': 'mid_autumn', 'theme.darkId': 'black' })
      }
    }
  } finally {
    global.Date = OriginalDate
    global.envParams = originalEnv
  }
})

test('numeric v1 theme migration retains the historical green and black choices', () => {
  const { boundaries } = createApplicationBoundaries()
  const app = loadSource('src/main/utils/index.ts', boundaries)
  const originalEnv = global.envParams
  global.envParams = { cmdParams: {} }
  try {
    const migrated = app.updateSetting({ version: '1.22.3', theme: { id: 0, lightId: 0, darkId: 13 } }, true).setting
    assert.equal(migrated['theme.id'], 'green')
    assert.equal(migrated['theme.lightId'], 'green')
    assert.equal(migrated['theme.darkId'], 'black')
  } finally {
    global.envParams = originalEnv
  }
})

test('main startup and renderer switching resolve the same fixed, auto, unknown and custom-background selections', () => {
  const custom = clone(paletteFor('lime'))
  custom.id = 'user_theme_custom'
  custom.isCustom = true
  custom.config.themeColors = createThemeColors('rgb(44, 55, 66)', 'rgb(11, 22, 33)', false, false)
  custom.config.extInfo['--background-image'] = 'user image.png'
  const remote = clone(custom)
  remote.id = 'user_theme_remote'
  remote.config.extInfo['--background-image'] = 'https://example.invalid/art%20cover.png?theme=1'
  const { boundaries, nativeTheme } = createApplicationBoundaries([custom, remote])
  const app = loadSource('src/main/utils/index.ts', boundaries)
  const themeInfo = { themes: registry, userThemes: [custom, remote], dataPath: path.join('/profile', 'theme_images') }
  const darkMode = { value: false }
  const renderer = loadSource('src/renderer/store/utils.ts', {
    'electron-log/node': {},
    '@renderer/utils/ipc': { getThemes: forbiddenBoundary('cached theme IPC fetch') },
    './index': { qualityList: { value: {} }, themeInfo, themeShouldUseDarkColors: darkMode },
  })
  const oldLx = global.lx
  const oldDataPath = global.lxDataPath
  const oldWindow = global.window
  let applied
  global.window = { setTheme: colors => { applied = colors } }
  global.lxDataPath = '/profile'
  const customBefore = clone(custom)
  const remoteBefore = clone(remote)
  try {
    for (const dark of [false, true]) {
      darkMode.value = nativeTheme.shouldUseDarkColors = dark
      const scenarios = [
        ...registry.map(theme => ({ id: theme.id, lightId: 'green', darkId: 'black', expected: theme.id })),
        { id: custom.id, lightId: 'green', darkId: 'black', expected: custom.id },
        { id: remote.id, lightId: 'green', darkId: 'black', expected: remote.id },
        { id: 'auto', lightId: 'sakura', darkId: 'black', expected: dark ? 'black' : 'sakura' },
        { id: 'auto', lightId: 'absent', darkId: 'absent', expected: dark ? 'ink_night' : 'lime' },
        { id: 'unknown', lightId: 'green', darkId: 'black', expected: 'lime' },
      ]
      for (const { id, lightId, darkId, expected } of scenarios) {
        global.lx = { appSetting: { 'theme.id': id, 'theme.lightId': lightId, 'theme.darkId': darkId } }
        const main = app.getTheme()
        renderer.applyTheme(id, lightId, darkId, themeInfo.dataPath)
        assert.equal(main.theme.id, id)
        assert.equal(main.theme.resolvedId, expected, `${id}, dark=${dark}`)
        assert.equal(main.shouldUseDarkColors, dark)
        assert.deepEqual(applied, main.theme.colors, `${id}, dark=${dark}`)
        if (id === custom.id) assert.match(applied['--background-image'], /^url\(file:.*\/theme_images\/user%20image\.png\)$/)
        if (id === remote.id) assert.equal(applied['--background-image'], 'url(https://example.invalid/art%20cover.png?theme=1)')
      }
    }
    assert.match(app.getAllThemes().userThemes[0].config.extInfo['--background-image'], /^user image\.png$/)
    assert.deepEqual(custom, customBefore)
    assert.deepEqual(remote, remoteBefore)
  } finally {
    global.lx = oldLx
    global.lxDataPath = oldDataPath
    global.window = oldWindow
  }
})

test('theme IPC applies authoritative fixed colors and refreshes an edited theme with the same id', () => {
  const selected = { value: 'lime' }
  const darkMode = { value: false }
  let themeChanged
  let unmount
  const ignoreRegistration = () => () => {}
  const listener = loadSource('src/renderer/core/useApp/useEventListener.ts', {
    '@renderer/utils': { getFontSizeWithScreen: forbiddenBoundary('unrelated fullscreen sizing') },
    '@renderer/utils/ipc': {
      onFocus: ignoreRegistration,
      onSettingChanged: ignoreRegistration,
      onThemeChange: handler => {
        themeChanged = handler
        return () => {}
      },
      minWindow: forbiddenBoundary('window minimize'),
      openDevTools: forbiddenBoundary('devtools'),
      quitApp: forbiddenBoundary('quit'),
      setFullScreen: forbiddenBoundary('fullscreen'),
      showHideWindowToggle: forbiddenBoundary('window visibility'),
    },
    '@renderer/store': { themeId: selected, themeShouldUseDarkColors: darkMode, isFullscreen: { value: false } },
    '@renderer/store/setting': { appSetting: {}, isShowAnimation: { value: true }, mergeSetting: forbiddenBoundary('unrelated setting update') },
    '@common/utils/vueTools': { watch: () => {}, onBeforeUnmount: callback => { unmount = callback } },
    '@common/utils/electron': { openUrl: forbiddenBoundary('external link') },
    '@renderer/event': { clearDownKeys: forbiddenBoundary('unrelated focus event') },
  }).default
  const oldWindow = global.window
  const oldDocument = global.document
  const applied = []
  global.window = {
    setTheme: colors => { applied.push(colors) },
    key_event: { on: () => {}, off: () => {} },
    app_event: { on: () => {}, off: () => {} },
  }
  global.document = { body: { addEventListener: () => {}, removeEventListener: () => {} } }
  try {
    listener()
    const lightColors = resolveThemeColors(paletteFor('lime'))
    themeChanged({ params: { shouldUseDarkColors: true, theme: { id: 'lime', resolvedId: 'lime', colors: lightColors } } })
    assert.equal(selected.value, 'lime')
    assert.equal(darkMode.value, true)
    assert.equal(global.window.shouldUseDarkColors, true)
    assert.equal(applied[0], lightColors, 'fixed light selection must not be re-resolved as auto/dark')
    const edited = clone(paletteFor('lime'))
    edited.id = 'user_theme_custom'
    edited.isCustom = true
    for (const primary of ['rgb(14, 24, 34)', 'rgb(74, 84, 94)']) {
      edited.config.themeColors = createThemeColors(primary, undefined, false, false)
      const colors = resolveThemeColors(edited)
      themeChanged({ params: { shouldUseDarkColors: true, theme: { id: edited.id, resolvedId: edited.id, colors } } })
      assert.equal(selected.value, edited.id)
      assert.equal(applied.at(-1), colors)
      assert.equal(cssValue(applied.at(-1), '--lux-accent'), primary)
    }
    assert.equal(applied.length, 3, 'same-id edits must still update applied CSS')
    unmount()
  } finally {
    global.window = oldWindow
    global.document = oldDocument
  }
})
