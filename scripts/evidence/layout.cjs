const createUiTools = require('./ui.cjs')

const ids = ['container', 'main-shell', 'left', 'right', 'toolbar', 'view', 'player']
const epsilon = 0.01 // Numerical tolerance in CSS px; a one-pixel crop must fail.
const rendererToolsSource = `(() => {
  const number = value => parseFloat(value) || 0;
  const rect = (left, top, right, bottom) => ({ x: left, y: top, right, bottom, width: right - left, height: bottom - top });
  const frame = element => {
    const r = element.getBoundingClientRect(); const s = getComputedStyle(element);
    const border = { left: number(s.borderLeftWidth), top: number(s.borderTopWidth), right: number(s.borderRightWidth), bottom: number(s.borderBottomWidth) };
    const padding = { left: number(s.paddingLeft), top: number(s.paddingTop), right: number(s.paddingRight), bottom: number(s.paddingBottom) };
    // CSSOM scrollbar metrics are integral. Keep the fractional BCR/borders intact.
    const gutterX = Math.max(0, element.offsetWidth - element.clientWidth - Math.round(border.left + border.right));
    const gutterY = Math.max(0, element.offsetHeight - element.clientHeight - Math.round(border.top + border.bottom));
    const gutterLeft = Math.min(gutterX, Math.max(0, element.clientLeft - Math.round(border.left)));
    const paddingBox = rect(r.left + border.left + gutterLeft, r.top + border.top,
      r.right - border.right - (gutterX - gutterLeft), r.bottom - border.bottom - gutterY);
    return { borderBox: rect(r.left, r.top, r.right, r.bottom), paddingBox,
      contentBox: rect(paddingBox.x + padding.left, paddingBox.y + padding.top, paddingBox.right - padding.right, paddingBox.bottom - padding.bottom),
      border, padding, scrollbar: { x: gutterX, y: gutterY, left: gutterLeft }, transform: s.transform };
  };
  const visibility = element => {
    const chain = []; let effectiveOpacity = 1;
    for (let el = element; el; el = el.parentElement) {
      const s = getComputedStyle(el); effectiveOpacity *= Number(s.opacity);
      chain.push({ tag: el.tagName, id: el.id, display: s.display, visibility: s.visibility, opacity: Number(s.opacity), contentVisibility: s.contentVisibility });
    }
    if (typeof element.checkVisibility !== 'function') throw new Error('Native checkVisibility is required for layout/focus evidence');
    const nativeVisible = element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    return { chain, effectiveOpacity, nativeVisible, visible: nativeVisible && effectiveOpacity > 0 &&
      chain.every(s => s.display !== 'none' && s.visibility === 'visible' && s.opacity > 0 && s.contentVisibility !== 'hidden') };
  };
  const crop = (box, clip, x = true, y = true) => ({ left: x ? Math.max(0, clip.x - box.x) : 0, top: y ? Math.max(0, clip.y - box.y) : 0,
    right: x ? Math.max(0, box.right - clip.right) : 0, bottom: y ? Math.max(0, box.bottom - clip.bottom) : 0 });
  const clipped = amount => Object.values(amount).some(value => value > ${epsilon});
  const clipping = (element, extent = 0) => {
    const r = element.getBoundingClientRect(); const ring = rect(r.left - extent, r.top - extent, r.right + extent, r.bottom + extent);
    const ancestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent); const f = frame(parent);
      const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowX);
      const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY);
      if (clipX || clipY) {
        if (f.transform !== 'none' || !['0px', 'padding-box', 'padding-box 0px'].includes(s.overflowClipMargin)) throw new Error('Transformed/expanded overflow clips need a dedicated consumer: ' + parent.id);
        const actualClipping = crop(ring, f.paddingBox, clipX, clipY);
        ancestors.push({ tag: parent.tagName, id: parent.id, overflowX: s.overflowX, overflowY: s.overflowY,
          clip: f.paddingBox, scrollbar: f.scrollbar, actualClipping, clipped: clipped(actualClipping) });
      }
    }
    const viewportClipping = crop(ring, rect(0, 0, innerWidth, innerHeight));
    return { ring, extent, ancestors, viewportClipping, outsideViewport: clipped(viewportClipping) };
  };
  const outlineAlpha = color => {
    if (!CSS.supports('color', color)) throw new Error('Cannot parse computed outline color: ' + color);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Detached canvas color parser unavailable');
    // Two sentinels detect silent Canvas fillStyle rejection of a CSS color.
    ctx.fillStyle = 'rgba(1, 2, 3, 0.25)'; ctx.fillStyle = color; const parsed = ctx.fillStyle;
    ctx.fillStyle = 'rgba(4, 5, 6, 0.75)'; ctx.fillStyle = color;
    if (ctx.fillStyle !== parsed) throw new Error('Canvas rejected computed outline color: ' + color);
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[3] / 255;
  };
  return { frame, visibility, clipping, outlineAlpha };
})()`
const inside = (box, width, height) => box && box.visibility.visible &&
  ['x', 'y', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(box[key])) &&
  box.width > 0 && box.height > 0 && box.x >= -epsilon && box.y >= -epsilon && box.right <= width + epsilon && box.bottom <= height + epsilon
const assertEqual = (name, actual, expected, keys = ['x', 'y', 'right', 'bottom']) => {
  if (keys.some(key => !Number.isFinite(actual[key]) || !Number.isFinite(expected[key]) || Math.abs(actual[key] - expected[key]) > epsilon)) throw new Error(`${name}: ${JSON.stringify({ actual, expected })}`)
}
function assertPlannedAppGeometry(current, expected) {
  if (current.width !== expected.width || current.height !== expected.height || current.fontSize !== `${expected.fontSize}px`) throw new Error('Actual viewport/root font differs from explicit fixture')
  const { boxes: b, frames: f } = current
  for (const id of ids) {
    if (!inside(b[id], current.width, current.height)) throw new Error(`Required layout container clipped/hidden: ${id}: ${JSON.stringify(b[id])}`)
    if (b[id].clipping.outsideViewport || b[id].clipping.ancestors.some(parent => parent.clipped)) throw new Error(`Actual overflow clips layout container ${id}: ${JSON.stringify(b[id].clipping)}`)
  }
  for (const [id, frame] of Object.entries(f)) if (frame.transform !== 'none') throw new Error(`Planned-App frame transform is unsupported: ${id}`)
  assertEqual('HTML must fill viewport', f.html.borderBox, { x: 0, y: 0, right: current.width, bottom: current.height })
  assertEqual('Body must fill actual HTML content box', f.body.borderBox, f.html.contentBox)
  assertEqual('Root must fill actual body content box', f.root.borderBox, f.body.contentBox)
  assertEqual('Container must fill actual root content box', b.container, f.root.contentBox)
  // This is the planned App fixture's direct-parent/flex contract, not a universal layout rule.
  const parents = { 'main-shell': 'container', player: 'container', left: 'main-shell', right: 'main-shell', toolbar: 'right', view: 'right' }
  for (const [id, parentId] of Object.entries(parents)) if (b[id].parentId !== parentId) throw new Error(`Planned-App direct-parent contract: #${id} must be a child of #${parentId}`)
  const flex = (id, direction) => ['flex', 'inline-flex'].includes(b[id].display) && b[id].direction === direction
  if (!flex('container', 'column') || !flex('main-shell', 'row') || !flex('right', 'column')) throw new Error('Planned-App flex contract requires column/row/column')
  if (Object.keys(parents).some(id => ['absolute', 'fixed'].includes(b[id].position))) throw new Error('Planned-App child was removed from normal document flow')
  const container = b.container.frame.contentBox; const main = b['main-shell']; const right = b.right.frame.contentBox
  assertEqual('Main shell must fill container width/top', main, container, ['x', 'right', 'y'])
  assertEqual('Player must fill container width/bottom', b.player, container, ['x', 'right', 'bottom'])
  assertEqual('Main shell and player must meet in normal flow', main, { bottom: b.player.y }, ['bottom'])
  assertEqual('Sidebar must fill main shell left/height', b.left, main.frame.contentBox, ['x', 'y', 'bottom'])
  assertEqual('Content must fill main shell right/height', b.right, main.frame.contentBox, ['right', 'y', 'bottom'])
  assertEqual('Sidebar and content must meet', b.left, { right: b.right.x }, ['right'])
  assertEqual('Toolbar must fill right column width/top', b.toolbar, right, ['x', 'right', 'y'])
  assertEqual('View must fill right column width/bottom', b.view, right, ['x', 'right', 'bottom'])
  assertEqual('Toolbar and view must meet', b.toolbar, { bottom: b.view.y }, ['bottom'])
  if (current.documentOverflow || b.player.scrollWidth > b.player.clientWidth) throw new Error('App/player container has horizontal overflow')
}
function assertVisibleFocus(actual) {
  if (!actual.active || !actual.focusVisible || !actual.visibility.visible || !Number.isFinite(actual.outlineAlpha) || actual.outlineAlpha <= 0 ||
    ['none', 'hidden'].includes(actual.outlineStyle) || !Number.isFinite(parseFloat(actual.outlineWidth)) || parseFloat(actual.outlineWidth) < 2 || !Number.isFinite(actual.clipping.extent)) throw new Error(`Actual keyboard focus is not visibly painted: ${JSON.stringify(actual)}`)
  if (actual.clipping.outsideViewport || actual.clipping.ancestors.some(parent => parent.clipped)) throw new Error(`Actual keyboard outline is clipped: ${JSON.stringify(actual)}`)
}

// Dormant until the planned App's #main-shell consumer has merged.
module.exports = function createLayoutEvidence(context) {
  const { execute, checks, screenshot, focusWithKeyboard, stage } = context
  const { target } = createUiTools(context)
  const snapshotGeometry = () => execute(`(() => {
    const tools = ${rendererToolsSource}; const boxes = {}; const frames = {};
    for (const [id, el] of Object.entries({ html: document.documentElement, body: document.body, root: document.getElementById('root') })) {
      if (!el) throw new Error('Required root frame missing: ' + id);
      frames[id] = tools.frame(el);
    }
    for (const id of ${JSON.stringify(ids)}) {
      const el = document.getElementById(id);
      if (!el) throw new Error('Required layout consumer missing: #' + id + '; enable geometry only after M2a');
      const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
      boxes[id] = { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
        parentId: el.parentElement?.id || null, display: style.display, direction: style.flexDirection, position: style.position,
        visibility: tools.visibility(el), clipping: tools.clipping(el), frame: tools.frame(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth };
    }
    return { width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize,
      hash: location.hash, boxes, frames, documentOverflow: document.documentElement.scrollWidth > innerWidth };
  })()`)
  const verifyGeometry = async(name, expected) => {
    if (!expected || ![expected.width, expected.height, expected.fontSize].every(value => Number.isFinite(value) && value > 0)) throw new Error('Geometry consumer must provide explicit expected width, height and root fontSize')
    stage(`layout: verify planned-App viewport/font/normal-flow geometry ${name}`)
    const current = await snapshotGeometry()
    assertPlannedAppGeometry(current, expected)
    checks.push({ kind: 'layout-geometry', name, expected, state: current })
    return current
  }
  const verifyFocus = async(selector, name) => {
    if (!/^[\w-]+$/.test(name)) throw new Error('Focus capture name must be a simple identifier')
    stage(`layout: original native keyboard Tab focus ${name}`)
    const nativeHit = await target(`document.querySelector(${JSON.stringify(selector)})`)
    const keyboard = await focusWithKeyboard(selector)
    if (!keyboard.focusVisible || !keyboard.insideWindow || keyboard.outlineStyle === 'none' || parseFloat(keyboard.outlineWidth) < 2) throw new Error(`Actual native keyboard focus missing or weak: ${JSON.stringify(keyboard)}`)
    const actual = await execute(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Original focus consumer disappeared');
      const tools = ${rendererToolsSource}; const style = getComputedStyle(el);
      const extent = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
      const color = style.outlineColor === 'currentcolor' ? style.color : style.outlineColor;
      return { active: document.activeElement === el, focusVisible: el.matches(':focus-visible'), visibility: tools.visibility(el),
        width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize,
        outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, outlineColor: color,
        outlineAlpha: tools.outlineAlpha(color), clipping: tools.clipping(el, extent) };
    })()`)
    assertVisibleFocus(actual)
    const proof = { name, selector, nativeHit, keyboard, actual }
    checks.push({ kind: 'layout-keyboard-focus', ...proof })
    await screenshot(`layout-focus-${name}.png`, 'layout-focus', { focus: proof })
    return proof
  }
  return { snapshotGeometry, verifyGeometry, verifyFocus }
}
