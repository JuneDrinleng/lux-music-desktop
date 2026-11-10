const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('../helpers/load-source.cjs')

const setup = t => {
  const listeners = new Map()
  const previous = global.document
  global.document = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type),
  }
  const keyBind = loadSource('src/renderer/utils/keyBind.ts', { '@common/utils': { isMac: false } }).default
  t.after(() => { keyBind.unbindKey(); global.document = previous })
  const calls = []
  keyBind.bindKey((...args) => calls.push(args))
  const dispatch = (type, tagName = 'BUTTON', key = ' ', code = 'Space') => {
    const event = {
      key,
      code,
      target: { tagName, classList: { contains: () => false } },
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
    }
    listeners.get(type)(event)
    return event
  }
  return { keyBind, calls, dispatch }
}

test('native button Space keeps its keyup default and clears the held key', t => {
  const { keyBind, calls, dispatch } = setup(t)
  dispatch('keydown')
  const released = dispatch('keyup')
  assert.equal(released.defaultPrevented, false, 'Space keyup must be able to generate the native button click')
  assert.deepEqual(calls.map(([key, , type]) => [key, type]), [['space', 'down'], ['space', 'up']])
  assert.equal(calls[1][3], released, 'the original event still reaches the shortcut hub')
  keyBind.clearDownKeys()
  assert.equal(calls.length, 2, 'released Space must not remain held')
})

test('Space on other targets and non-Space button keyups retain existing cancellation', t => {
  const { dispatch } = setup(t)
  for (const tagName of ['DIV', 'INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(dispatch('keyup', tagName).defaultPrevented, true, tagName)
  }
  assert.equal(dispatch('keyup', 'BUTTON', 'Enter', 'Enter').defaultPrevented, true)
  assert.equal(dispatch('keyup', 'BUTTON', 'Escape', 'Escape').defaultPrevented, true)
})

test('a shortcut handler can still claim button Space events', t => {
  const { keyBind, dispatch } = setup(t)
  const calls = []
  keyBind.bindKey((key, eventKey, type, event) => {
    calls.push([key, type])
    event.preventDefault()
  })
  assert.equal(dispatch('keydown').defaultPrevented, true)
  assert.equal(dispatch('keyup').defaultPrevented, true)
  assert.deepEqual(calls, [['space', 'down'], ['space', 'up']])
})
