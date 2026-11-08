# M3b1 下载页真实 Electron 证据

生产 `dist/main.js`/`dist/index.html`，临时 profile、真实 SQLite/IPC/原动作和原生 Audio；不是静态样张。

- `downloads-lime-1280x800.png`：五种状态、进度/速度、长标题与完整行内操作。
- `downloads-ink_night-1024x700.png`、`downloads-oat_milk-1280x800.png`：墨夜窄窗与暖米。
- `downloads-selection-menu-1280x800.png`：原 Ctrl 多选与右键菜单。
- `downloads-large-font-1024x700.png`：20px 根字号，原虚拟行/槽均为 46px。
- `downloads-empty-1024x700.png`：出错筛选的原空态。

数据全部明确标为 fixture；下载传输与外部 shell 被替代，其他 worker 方法委托原实现。生成的 20 秒静音 WAV 经原生 Audio 播放，只证明软件管线。真实音乐源下载/网络重试、系统文件管理器/浏览器实际打开、扬声器及 Windows/macOS 体验尚未验证。

[evidence.json](evidence.json) 记录干净实现提交、UTC、运行版本、完整构建/harness/PNG SHA256、七门结果与行为证据摘要。最终 PR head CI 会重新构建及运行完整 themes35/media3/downloads6；完整 manifest/日志在 90 天 CI artifact，关键 PNG 永久入库。父 M3b 尚未完成，本 PR 不合并。
