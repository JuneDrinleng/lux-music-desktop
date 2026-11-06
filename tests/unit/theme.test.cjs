const assert = require('node:assert/strict')
const test = require('node:test')
const { createThemeColors } = require('../../src/common/theme/utils')

const channels = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
const color = 'rgb(64, 128, 192)'

test('light theme preserves the chosen accent and supplies readable default text colors', () => {
  const colors = createThemeColors(color, undefined, false, false)
  assert.equal(colors['--color-primary'], color)
  assert.equal(colors['--color-theme'], color)
  assert.equal(colors['--color-1000'], 'rgb(33, 33, 33)')
  assert.equal(colors['--color-000'], 'rgb(255,255,255)')
  assert.equal(colors['--color-primary-light-1000'], 'rgb(255,255,255)')
})

test('theme alpha tokens preserve accent channels and expose the requested opacity', () => {
  const colors = createThemeColors(color, undefined, false, false)
  assert.equal(colors['--color-primary-alpha-100'], 'rgba(64, 128, 192, 0.90)')
  assert.equal(colors['--color-primary-alpha-500'], 'rgba(64, 128, 192, 0.50)')
  assert.equal(colors['--color-primary-alpha-900'], 'rgba(64, 128, 192, 0.10)')
})

test('primary contrast shades move away from the accent in the correct theme direction', () => {
  for (const dark of [false, true]) {
    const colors = createThemeColors(color, undefined, dark, false)
    const base = channels(color)
    const shade = channels(colors['--color-primary-dark-100'])
    const tint = channels(colors['--color-primary-light-100'])
    for (let index = 0; index < 3; index++) {
      assert.equal(shade[index] > base[index], dark)
      assert.equal(tint[index] < base[index], dark)
    }
  }
})

test('dark theme uses a subdued theme accent and light default foreground', () => {
  const colors = createThemeColors(color, undefined, true, false)
  assert.equal(colors['--color-1000'], 'rgb(229, 229, 229)')
  assert.equal(colors['--color-theme'], colors['--color-primary-light-900'])
  assert.ok(channels(colors['--color-000']).every(channel => channel < 229))
})

test('custom foreground survives generation for light and dark themes', () => {
  for (const dark of [false, true]) {
    assert.equal(createThemeColors(color, 'rgb(201, 202, 203)', dark, false)['--color-1000'], 'rgb(201, 202, 203)')
  }
})

test('all theme shade/alpha/text tokens exist and contain finite valid CSS channels', () => {
  for (const dark of [false, true]) {
    const colors = createThemeColors(color, undefined, dark, false)
    for (const family of ['dark', 'light']) {
      for (let step = 100; step <= 1000; step += 100) {
        assert.ok(colors[`--color-primary-${family}-${step}`])
        for (let alpha = 100; alpha <= 900; alpha += 100) assert.ok(colors[`--color-primary-${family}-${step}-alpha-${alpha}`])
      }
    }
    for (let step = 0; step <= 1000; step += 50) assert.ok(colors[`--color-${String(step).padStart(3, '0')}`])
    for (const value of Object.values(colors)) {
      assert.match(value, /^rgba?\([\d.,\s]+\)$/)
      assert.ok(channels(value).every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255))
    }
  }
})
