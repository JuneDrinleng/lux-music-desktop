// Shared native input helpers. The production DOM supplies all coordinates.
module.exports = function createUiTools({ execute, mainWindow }) {
  const target = async(expression, ratio = 0.5) => execute(`(() => {
    const el = (${expression}); if (!el || el.disabled) throw new Error('Original media control missing or disabled');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(); const x = Math.round(r.x + r.width * ${ratio}); const y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (r.width <= 0 || r.height <= 0 || x < 0 || x >= innerWidth || y < 0 || y >= innerHeight || !hit || !(hit === el || el.contains(hit))) throw new Error('Original media control center is clipped or covered');
    return { x, y, width: r.width, height: r.height, label: el.getAttribute('aria-label'), text: el.innerText };
  })()`)
  const click = async(expression, { button = 'left', count = 1, ratio = 0.5 } = {}) => {
    const point = await target(expression, ratio)
    mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button, clickCount: count })
    mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button, clickCount: count })
    return point
  }
  const i18nControl = (scope, key, prefix = false) => `Array.from(document.querySelectorAll(${JSON.stringify(scope)})).find(el => ${prefix ? `(el.getAttribute('aria-label') || '').startsWith(window.i18n.t(${JSON.stringify(key)}))` : `el.getAttribute('aria-label') === window.i18n.t(${JSON.stringify(key)})`})`
  return { target, click, i18nControl }
}
