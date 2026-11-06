// Evidence configuration only. These are never application defaults.
const preferences = {
  'common.langId': 'zh-cn',
  'common.isAgreePact': true,
  'common.showChangeLog': false,
  'common.tryAutoUpdate': false,
  'common.transparentWindow': false,
  'common.isShowAnimation': false,
  'common.randomAnimate': false,
  'search.isShowHotSearch': false,
  'search.isShowHistorySearch': false,
  'download.enable': true,
  'sync.enable': false,
  'openAPI.enable': false,
  'desktopLyric.enable': false,
  'tray.enable': false,
}

// Independent reference values from mobile docs/theme-tokens.md, audited for M1.
// These verify the CSS emitted by the real app, not a copy of its resolver.
const palettes = {
  lime: { paper: '#eef0fb', ink: '#111827', list: '#20242d', accent: '#c8e600', onAccent: '#111827' },
  mist_blue: { paper: '#eef3f9', ink: '#0f172a', list: '#1e293b', accent: '#2563eb', onAccent: '#ffffff' },
  sakura: { paper: '#faf0f3', ink: '#1c1216', list: '#2d1f25', accent: '#db2777', onAccent: '#ffffff' },
  lavender: { paper: '#f3f0fb', ink: '#16131f', list: '#242033', accent: '#7c5cbf', onAccent: '#ffffff' },
  oat_milk: { paper: '#f6f1ea', ink: '#1c1712', list: '#2a231c', accent: '#a65d28', onAccent: '#ffffff' },
  ink_night: { paper: '#12141c', ink: '#f3f4f8', list: '#e5e7ef', accent: '#c8e600', onAccent: '#111827' },
}
const legacyIds = ['green', 'blue', 'blue_plus', 'orange', 'red', 'pink', 'purple', 'grey', 'ming', 'blue2', 'black', 'mid_autumn', 'naruto', 'china_ink', 'happy_new_year']
const customThemeId = 'user_theme_evidence'

module.exports = { preferences, palettes, legacyIds, customThemeId }
