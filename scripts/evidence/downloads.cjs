const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { shell } = require('electron')
const createUiTools = require('./ui.cjs')

// Only the transport worker and external shell are fixtures. The production
// Vue page, action handlers, scheduler, IPC and SQLite remain unchanged.
module.exports = async function downloads(context) {
  const { config, mainWindow, execute, waitFor, screenshot, navigate, checks, stage, delay } = context
  const { click, i18nControl } = createUiTools({ execute, mainWindow })
  const results = []
  const folderCalls = []
  const originalFolder = shell.showItemInFolder
  const filePath = path.join(config.scratch, 'explicit-download-fixture.wav')
  const wave = Buffer.alloc(44 + 16000 * 2 * 20)
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8)
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28)
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34)
  wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40)
  fs.writeFileSync(filePath, wave)
  const fixtures = ['pause', 'pause', 'pause', 'error', 'completed'].map((status, index) => ({
    id: `download-fixture-${index}`,
    status,
    isComplate: status === 'completed',
    statusText: { pause: '暂停下载', error: '任务出错 · fixture 离线失败，可重试', completed: '下载完成' }[status],
    progress: [37, 0, 64, 12, 100][index],
    speed: '',
    downloaded: 0,
    total: wave.length,
    writeQueue: 0,
    metadata: {
      url: 'https://fixture.invalid/explicit-download.wav',
      quality: index === 4 ? 'wav' : 'flac',
      ext: 'wav',
      fileName: path.basename(filePath),
      filePath,
      musicInfo: { id: `fixture-music-${index}`, name: `[fixture] ${['纸上旅行', '等待下一首', '长标题用于检查省略与操作区边界的下载任务', '失败后重试', '本地完成音频'][index]}`, singer: '离线取证', source: 'kw', interval: '00:20', meta: { songId: String(index), albumName: '明确标注的测试数据', picUrl: '', qualitys: {}, _qualitys: {} } },
    },
  }))
  const row = index => `document.querySelector('[data-task-id="download-fixture-${index}"]')`
  const button = (index, key) => i18nControl(`[data-task-id="download-fixture-${index}"] button`, key)
  const tab = key => i18nControl('[data-page=downloads] [role=tab]', key)
  const menu = key => i18nControl('#root ul[aria-hidden=false] > li', key)
  const db = () => global.lx.worker.dbService.getDownloadList()
  const state = async(index, status) => {
    await waitFor(async() => (await db()).find(item => item.id === fixtures[index].id)?.status === status && await execute(`${row(index)}?.dataset.status === ${JSON.stringify(status)}`), `UI and SQLite ${index}/${status}`)
  }
  const contextAction = async(index, key) => {
    await click(row(index), { button: 'right', ratio: 0.15 })
    await waitFor(() => execute(`Boolean(${menu(key)})`), `original menu ${key}`)
    await click(menu(key))
  }
  const selectTheme = async id => {
    await navigate('/setting')
    await click('document.querySelector("[data-action=show-themes]")')
    await waitFor(() => execute(`Boolean(document.querySelector('[data-theme-id="${id}"]'))`), `original theme option ${id}`)
    await click(`document.querySelector('[data-theme-id="${id}"]')`)
    await waitFor(() => Promise.resolve(global.lx.theme.theme.resolvedId === id), `actual theme ${id}`)
    await navigate('/download')
  }
  const verifyColumns = async(width, height, fontSize) => {
    const geometry = await execute(`(() => {
      const page = document.querySelector('[data-page=downloads]');
      const headers = Array.from(page.querySelectorAll('th'));
      const rows = Array.from(page.querySelectorAll('.list-item'), row => Array.from(row.querySelectorAll('.list-item-cell')));
      const bounds = element => { const { left, right } = element.getBoundingClientRect(); return { left, right } };
      return {
        width: innerWidth, height: innerHeight, fontSize: getComputedStyle(document.documentElement).fontSize,
        rowCellCounts: rows.map(row => row.length),
        columns: headers.map((header, index) => {
          const range = document.createRange(); range.selectNodeContents(header);
          const label = range.getBoundingClientRect();
          return { title: header.textContent, header: bounds(header), labelCenter: (label.left + label.right) / 2,
            rows: rows.map(row => row[index] ? bounds(row[index]) : null) };
        })
      };
    })()`)
    // Persist measurements before asserting so failures retain the actual layout.
    fs.writeFileSync(path.join(config.output, `column-alignment-${width}x${height}-font${fontSize}.json`), JSON.stringify(geometry, null, 2) + '\n')
    assert.deepEqual([geometry.width, geometry.height, geometry.fontSize], [width, height, `${fontSize}px`])
    assert.equal(geometry.columns.length, 6)
    assert.ok(geometry.rowCellCounts.length > 0 && geometry.rowCellCounts.every(count => count === 6), 'six cells in every visible download row')
    for (const column of geometry.columns) {
      for (const cell of column.rows) {
        assert.ok(cell && Math.abs(column.header.left - cell.left) <= 1 && Math.abs(column.header.right - cell.right) <= 1,
          `Download column boundaries differ: ${JSON.stringify(column)}`)
        assert.ok(column.labelCenter >= cell.left && column.labelCenter <= cell.right,
          `Download heading is outside its data column: ${JSON.stringify(column)}`)
      }
    }
    checks.push({ kind: 'download-column-alignment', toleranceCssPx: 1, ...geometry })
  }
  const key = (type, keyCode) => mainWindow.webContents.sendInputEvent({ type, keyCode })
  const select = async(indices) => {
    key('keyDown', 'Control')
    for (const index of indices) await click(row(index), { ratio: 0.15 })
    key('keyUp', 'Control')
    await waitFor(() => execute(`document.querySelectorAll('[data-page=downloads] .list-item.active').length === ${indices.length}`), 'native modifier multi-selection')
  }
  try {
    stage('downloads: seed labelled tasks through real database worker')
    assert.equal((await db()).length, 0)
    await global.lx.worker.dbService.downloadInfoSave(fixtures, 'bottom')
    shell.showItemInFolder = requested => { folderCalls.push(requested) }
    await execute(`(() => {
      const evidence = window.__downloadEvidence = { calls: [], callbacks: {}, external: [] };
      evidence.originalWorker = window.lx.worker.download;
      evidence.originalExternal = require('electron').shell.openExternal;
      require('electron').shell.openExternal = async url => { evidence.external.push(url) };
      const transport = {
        startTask: async (task, directory, skip, callback) => { evidence.calls.push(['start', task.id]); evidence.callbacks[task.id] = callback; callback({ action: 'start' }) },
        pauseTask: async id => { evidence.calls.push(['pause', id]) },
        removeTask: async id => { evidence.calls.push(['remove', id]) }
      };
      window.lx.worker.download = new Proxy(evidence.originalWorker, { get: (target, key) => Object.hasOwn(transport, key) ? transport[key] : target[key] });
    })()`)
    await navigate('/download')
    await waitFor(() => execute(`Boolean(${row(4)})`), 'five restored fixture tasks')
    await click(button(0, 'list__start')); await state(0, 'run')
    await click(button(1, 'list__start')); await state(1, 'waiting')
    await execute(`window.__downloadEvidence.callbacks['download-fixture-0']({ action: 'progress', data: { progress: 37.5, speed: '128 KB', downloaded: 12000, total: ${wave.length}, writeQueue: 0 } })`)
    await waitFor(() => execute(`${row(0)}.innerText.includes('37.5%') && ${row(0)}.innerText.includes('128 KB/s')`), 'live progress and speed')
    results.push('start/waiting/progress/speed persisted through original actions')
    for (const [key, statuses] of [['download__running', ['run', 'waiting']], ['download__paused', ['pause']], ['download__error', ['error']], ['download__finished', ['completed']], ['download__all', ['run', 'waiting', 'pause', 'error', 'completed']]]) {
      await click(tab(key))
      await waitFor(() => execute(`JSON.stringify(Array.from(document.querySelectorAll('[data-page=downloads] .list-item'), el => el.dataset.status)) === ${JSON.stringify(JSON.stringify(statuses))}`), `original filter ${key}`)
    }
    results.push('all five original status filters')
    const geometry = await execute('Array.from(document.querySelectorAll(\'[data-page=downloads] .list-item\'), el => ({ height: el.getBoundingClientRect().height, slotHeight: el.parentElement.getBoundingClientRect().height, buttons: Array.from(el.querySelectorAll(\'button\'), b => { const r = b.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right, cellRight: b.closest(\'.list-item-cell\').getBoundingClientRect().right } }) }))')
    assert.ok(geometry.every(item => item.height === item.slotHeight && item.buttons.every(b => b.width >= 32 && b.height >= 32 && b.right <= b.cellRight + 1)), JSON.stringify(geometry))
    await screenshot('downloads-lime-1280x800.png', 'downloads', { fixture: true, geometry })
    await verifyColumns(1280, 800, 16)
    for (const [id, width, height] of [['ink_night', 1024, 700], ['oat_milk', 1280, 800]]) {
      await selectTheme(id)
      mainWindow.setContentSize(width, height)
      await waitFor(() => execute(`innerWidth === ${width} && innerHeight === ${height}`), `actual theme window ${id}`)
      await screenshot(`downloads-${id}-${width}x${height}.png`, 'downloads', { fixture: true })
    }
    await selectTheme('lime')
    await click(button(1, 'list__pause')); await state(1, 'pause')
    await click(button(0, 'list__pause')); await state(0, 'pause')
    await delay(450)
    await click(row(0), { ratio: 0.15 }); await click(row(0), { ratio: 0.15, count: 2 }); await state(0, 'run')
    await delay(450)
    await click(row(0), { ratio: 0.15 }); await click(row(0), { ratio: 0.15, count: 2 }); await state(0, 'pause')
    results.push('row pause, queued pause and double-click start/pause')
    await contextAction(3, 'list__start'); await state(3, 'run')
    await execute("window.__downloadEvidence.callbacks['download-fixture-3']({ action: 'error', data: { message: 'fixture 再次失败' } })")
    await state(3, 'error')
    await click(button(3, 'list__start')); await state(3, 'run')
    await execute("window.__downloadEvidence.callbacks['download-fixture-3']({ action: 'complete' })")
    await state(3, 'completed')
    assert.equal((await db()).find(item => item.id === fixtures[3].id).progress, 100)
    results.push('context retry, worker error, row retry and completion')
    await click(button(4, 'list__file'))
    await waitFor(() => Promise.resolve(folderCalls.length === 1), 'original file IPC to shell boundary')
    assert.equal(folderCalls[0], filePath)
    await contextAction(4, 'list__source_detail')
    await waitFor(() => execute('window.__downloadEvidence.external.length === 1'), 'original source detail URL boundary')
    results.push('file location IPC and source detail URL (external shell suppressed)')
    await click(button(4, 'list__play'))
    await waitFor(() => execute("window.lxData.playMusicInfo.listId === 'download' && window.__luxEvidenceAudioElements.some(el => !el.paused && el.currentTime > 0)"), 'completed fixture plays using native Audio')
    results.push('completed row plays generated WAV in real native Audio')
    await waitFor(() => execute(`Boolean(${i18nControl('#player [aria-label]', 'player__pause')})`), 'original player pause control')
    await click(i18nControl('#player [aria-label]', 'player__pause'))
    await select([0, 1])
    await click(row(0), { button: 'right', ratio: 0.15 })
    await screenshot('downloads-selection-menu-1280x800.png', 'downloads', { fixture: true })
    await click(menu('list__start')); await state(0, 'run'); await state(1, 'waiting')
    await select([0, 1]); await contextAction(0, 'list__pause'); await state(0, 'pause'); await state(1, 'pause')
    results.push('native Ctrl multi-select and context bulk start/pause')
    await click(button(2, 'list__remove'))
    await waitFor(async() => (await db()).length === 4, 'single remove persisted')
    await select([0, 1]); await contextAction(0, 'list__remove')
    await waitFor(async() => (await db()).length === 2, 'bulk remove persisted')
    results.push('single and context bulk removal')
    await contextAction(4, 'list__search')
    await waitFor(() => execute(`location.hash.startsWith('#/search?') && new URLSearchParams(location.hash.split('?')[1]).get('text') === ${JSON.stringify(fixtures[4].metadata.musicInfo.name + ' 离线取证')}`), 'original search route and query')
    results.push('search action preserves song and singer query')
    await selectTheme('ink_night')
    mainWindow.setContentSize(1024, 700)
    await waitFor(() => execute('innerWidth === 1024'), 'narrow window')
    await execute("window.lxData.updateSetting({ 'common.fontSize': 20 })")
    await waitFor(() => execute("getComputedStyle(document.documentElement).fontSize === '20px'"), 'large font scaling')
    await waitFor(() => execute("Array.from(document.querySelectorAll('[data-page=downloads] .list-item')).length === 2 && Array.from(document.querySelectorAll('[data-page=downloads] .list-item')).every(el => el.getBoundingClientRect().height === 46 && el.parentElement.getBoundingClientRect().height === 46)"), 'large-font virtual rows settle')
    const large = await execute("Array.from(document.querySelectorAll('[data-page=downloads] .list-item'), el => [el.getBoundingClientRect().height, el.parentElement.getBoundingClientRect().height])")
    assert.ok(large.every(([row, slot]) => row === slot && row === 46), JSON.stringify(large))
    await screenshot('downloads-large-font-1024x700.png', 'downloads', { fixture: true, large })
    await verifyColumns(1024, 700, 20)
    await click(tab('download__error'))
    await waitFor(() => execute("document.querySelector('[data-page=downloads]').innerText.includes(window.i18n.t('no_item'))"), 'empty original status filter')
    await screenshot('downloads-empty-1024x700.png', 'downloads', { fixture: true })
    results.push('dark/narrow/large-font virtual row geometry and empty state')
    checks.push({ kind: 'download-behaviors', fixture: 'labelled SQLite tasks and generated 20s silent WAV; only download transport worker and external shell replaced; no public download', results, workerCalls: await execute('window.__downloadEvidence.calls'), externalUrls: await execute('window.__downloadEvidence.external'), folderCalls })
  } finally {
    shell.showItemInFolder = originalFolder
    await execute("window.lx.worker.download = window.__downloadEvidence.originalWorker; require('electron').shell.openExternal = window.__downloadEvidence.originalExternal; true")
  }
}
