// Original desktop theme adapter. Palette facts follow the mobile design specification.
// Derived roles stay out of editable theme storage.
const DEFAULT_MAGAZINE_THEME_ID = 'lime'
const DEFAULT_MAGAZINE_DARK_THEME_ID = 'ink_night'
const MAGAZINE_THEME_IDS = Object.freeze(['lime', 'mist_blue', 'sakura', 'lavender', 'oat_milk', 'ink_night'])

const magazineThemes = Object.freeze({
  lime: Object.freeze({
    name: '黄绿',
    isDark: false,
    roles: Object.freeze({
      paper: '#eef0fb',
      paperRaised: '#ffffff',
      display: '#16181f',
      ink: '#111827',
      list: '#20242d',
      muted: '#767d89',
      eyebrow: '#838995',
      option: '#5f6572',
      faint: '#9ca3af',
      quiet: '#9aa1ae',
      rule: '#111827',
      hairline: '#e1e6ef',
      accent: '#c8e600',
      accentSoft: '#dbeb92',
      onAccent: '#111827',
      accentInk: '#58651b',
      onInk: '#ffffff',
      danger: '#ef4444',
      like: '#FA5252',
      placeholder: '#e8eaef',
      skeleton: '#e2e6ef',
      scrim: 'rgba(17, 24, 39, 0.32)',
    }),
  }),
  mist_blue: Object.freeze({
    name: '雾蓝',
    isDark: false,
    roles: Object.freeze({
      paper: '#eef3f9',
      paperRaised: '#ffffff',
      display: '#131c2f',
      ink: '#0f172a',
      list: '#1e293b',
      muted: '#556274',
      eyebrow: '#64748b',
      option: '#5b697d',
      faint: '#94a3b8',
      quiet: '#8393a8',
      rule: '#0f172a',
      hairline: '#d9e2ec',
      accent: '#2563eb',
      accentSoft: '#bfdbfe',
      onAccent: '#ffffff',
      accentInk: '#173473',
      onInk: '#ffffff',
      danger: '#ef4444',
      like: '#FA5252',
      placeholder: '#e4eaf2',
      skeleton: '#dfe6ef',
      scrim: 'rgba(15,23,42,0.32)',
    }),
  }),
  sakura: Object.freeze({
    name: '樱粉',
    isDark: false,
    roles: Object.freeze({
      paper: '#faf0f3',
      paperRaised: '#ffffff',
      display: '#21161a',
      ink: '#1c1216',
      list: '#2d1f25',
      muted: '#7a646e',
      eyebrow: '#8a747c',
      option: '#806a74',
      faint: '#a8929a',
      quiet: '#9e8890',
      rule: '#1c1216',
      hairline: '#eadde3',
      accent: '#db2777',
      accentSoft: '#f9c2d4',
      onAccent: '#ffffff',
      accentInk: '#651a3b',
      onInk: '#ffffff',
      danger: '#dc2626',
      like: '#e11d48',
      placeholder: '#eee4e8',
      skeleton: '#ece1e6',
      scrim: 'rgba(28,18,22,0.32)',
    }),
  }),
  lavender: Object.freeze({
    name: '薰衣草紫',
    isDark: false,
    roles: Object.freeze({
      paper: '#f3f0fb',
      paperRaised: '#ffffff',
      display: '#1a1725',
      ink: '#16131f',
      list: '#242033',
      muted: '#716a82',
      eyebrow: '#7d768f',
      option: '#766f87',
      faint: '#9a93a8',
      quiet: '#90899f',
      rule: '#16131f',
      hairline: '#ddd7eb',
      accent: '#7c5cbf',
      accentSoft: '#ddd0f5',
      onAccent: '#ffffff',
      accentInk: '#3d2f5c',
      onInk: '#ffffff',
      danger: '#ef4444',
      like: '#FA5252',
      placeholder: '#e9e5f2',
      skeleton: '#e4dfef',
      scrim: 'rgba(22,19,31,0.32)',
    }),
  }),
  oat_milk: Object.freeze({
    name: '暖米',
    isDark: false,
    roles: Object.freeze({
      paper: '#f6f1ea',
      paperRaised: '#ffffff',
      display: '#201a15',
      ink: '#1c1712',
      list: '#2a231c',
      muted: '#6f6458',
      eyebrow: '#867a6d',
      option: '#786d60',
      faint: '#a3988b',
      quiet: '#998e81',
      rule: '#1c1712',
      hairline: '#e2d8cb',
      accent: '#a65d28',
      accentSoft: '#f0d5b8',
      onAccent: '#ffffff',
      accentInk: '#50321a',
      onInk: '#ffffff',
      danger: '#dc2626',
      like: '#e11d48',
      placeholder: '#ebe4da',
      skeleton: '#e7dfd3',
      scrim: 'rgba(28,23,18,0.32)',
    }),
  }),
  ink_night: Object.freeze({
    name: '墨夜',
    isDark: true,
    roles: Object.freeze({
      paper: '#12141c',
      paperRaised: '#1c1f2a',
      display: '#eff0f5',
      ink: '#f3f4f8',
      list: '#e5e7ef',
      muted: '#a0a6b8',
      eyebrow: '#8b92a5',
      option: '#989eb0',
      faint: '#6b7285',
      quiet: '#767d90',
      rule: '#f3f4f8',
      hairline: '#2f3444',
      accent: '#c8e600',
      accentSoft: '#3d4a1a',
      onAccent: '#111827',
      accentInk: '#d1e932',
      onInk: '#12141c',
      danger: '#f87171',
      like: '#fb7185',
      placeholder: '#2a2e3c',
      skeleton: '#2c3140',
      scrim: 'rgba(0,0,0,0.62)',
    }),
  }),
})

const toRgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${value >> 16 & 255}, ${value >> 8 & 255}, ${value & 255})`
}

/** @param {(accent: string, ink: string, dark: boolean, darkFont: boolean) => LX.ThemeColors} createThemeColors
 * @returns {LX.Theme[]} */
const createMagazineThemes = (createThemeColors) => MAGAZINE_THEME_IDS.map((id) => {
  const palette = magazineThemes[id]
  const { roles } = palette
  return {
    id,
    name: palette.name,
    isDark: palette.isDark,
    isDarkFont: false,
    isCustom: false,
    config: {
      themeColors: {
        ...createThemeColors(toRgb(roles.accent), toRgb(roles.ink), palette.isDark, false),
        '--color-theme': roles.accent,
      },
      extInfo: {
        '--color-app-background': roles.paper,
        '--color-main-background': roles.paper,
        // In a future custom clone this should follow the edited primary color.
        // Builtin runtime overrides below use the exact accentInk instead.
        '--color-nav-font': 'var(--color-primary-dark-300)',
        '--background-image': 'none',
        '--background-image-position': 'center',
        '--background-image-size': 'cover',
        '--color-btn-hide': 'var(--color-primary)',
        '--color-btn-min': 'var(--color-primary)',
        '--color-btn-close': roles.danger,
        '--color-badge-primary': 'var(--color-primary)',
        '--color-badge-secondary': 'var(--color-primary-dark-200)',
        '--color-badge-tertiary': 'var(--color-primary-dark-400)',
      },
    },
  }
})

/** @param {LX.Theme} theme */
const getBuiltinMagazinePalette = (theme) => {
  if (!theme || theme.isCustom || !Object.prototype.hasOwnProperty.call(magazineThemes, theme.id)) return null
  return magazineThemes[theme.id]
}
/** @param {string} role */
const toCssName = (role) => `--lux-${role.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`

// Legacy and custom themes use only their live editable values / aliases.
// Keep their existing color-* rules intact. No palette is inferred from id/name.
const legacyRoles = Object.freeze({
  paper: 'var(--color-main-background)',
  paperRaised: 'var(--color-main-background)',
  display: 'var(--color-1000)',
  ink: 'var(--color-1000)',
  list: 'var(--color-font)',
  muted: 'var(--color-font-label)',
  eyebrow: 'var(--color-550)',
  option: 'var(--color-700)',
  faint: 'var(--color-400)',
  quiet: 'var(--color-500)',
  rule: 'var(--color-1000)',
  hairline: 'var(--color-200)',
  accent: 'var(--color-primary)',
  accentSoft: 'var(--color-primary-background)',
  // onAccent remains an approximation for arbitrary custom palettes. Real
  // contrast requires sample-based checking; do not claim universal contrast.
  onAccent: 'var(--color-1000)',
  accentInk: 'var(--color-primary-font)',
  onInk: 'var(--color-000)',
  placeholder: 'var(--color-content-background)',
  skeleton: 'var(--color-100)',
})

/** @param {LX.Theme} theme
 * @returns {Record<string, string>} */
const getMagazineColors = (theme) => {
  const palette = getBuiltinMagazinePalette(theme)
  const roles = palette ? palette.roles : {
    ...legacyRoles,
    danger: theme?.isDark ? '#f87171' : '#ef4444',
    like: theme?.isDark ? '#fb7185' : '#FA5252',
    scrim: theme?.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(17, 24, 39, 0.32)',
  }
  return Object.fromEntries(Object.entries(roles).map(([name, value]) => [toCssName(name), value]))
}

// For runtime composition after raw themeColors/extInfo; never save these.
// Only applies to the six builtin palettes. Legacy/custom rules stay unchanged.
/** @param {LX.Theme} theme
 * @returns {Record<string, string>} */
const getMagazineLegacyOverrides = (theme) => {
  const palette = getBuiltinMagazinePalette(theme)
  if (!palette) return {}
  const { roles } = palette
  return {
    '--color-font': roles.list,
    '--color-font-label': roles.muted,
    '--color-primary-font': roles.accentInk,
    '--color-primary-font-hover': roles.ink,
    '--color-primary-font-active': roles.ink,
    '--color-button-font': roles.accentInk,
    '--color-button-font-selected': roles.ink,
    '--color-nav-font': roles.accentInk,
    '--color-content-background': roles.paper,
    '--color-primary-background': roles.accentSoft,
    '--color-primary-background-hover': roles.accentSoft,
    '--color-primary-background-active': roles.accentSoft,
    '--color-button-background': 'transparent',
    '--color-button-background-selected': roles.accentSoft,
    '--color-button-background-hover': roles.accentSoft,
    '--color-button-background-active': roles.accentSoft,
  }
}

/** @param {LX.Theme} theme
 * @returns {Record<string, string>} */
const resolveThemeColors = (theme) => ({
  ...theme.config.themeColors,
  ...theme.config.extInfo,
  ...getMagazineColors(theme),
  ...getMagazineLegacyOverrides(theme),
  '--lux-color-scheme': theme.isDark ? 'dark' : 'light',
})

/** @param {string} id
 * @param {string} lightId
 * @param {string} darkId
 * @param {boolean} dark */
const getPreferredThemeId = (id, lightId, darkId, dark) => id === 'auto' ? (dark ? darkId : lightId) : id
/** @param {string} id
 * @param {boolean} dark */
const getFallbackThemeId = (id, dark) => id === 'auto' && dark ? DEFAULT_MAGAZINE_DARK_THEME_ID : DEFAULT_MAGAZINE_THEME_ID

module.exports = {
  resolveThemeColors,
  getPreferredThemeId,
  getFallbackThemeId,
  DEFAULT_MAGAZINE_THEME_ID,
  DEFAULT_MAGAZINE_DARK_THEME_ID,
  MAGAZINE_THEME_IDS,
  magazineThemes,
  createMagazineThemes,
  getBuiltinMagazinePalette,
  getMagazineColors,
  getMagazineLegacyOverrides,
}
