# M3b1 下载页真实 Electron 证据

生产 `dist/main.js`/`dist/index.html`，临时 profile、真实 SQLite/IPC/原动作和原生 Audio；不是静态样张。

- `downloads-lime-1280x800.png`：五种状态、进度/速度、长标题与完整行内操作。
- `downloads-ink_night-1024x700.png`、`downloads-oat_milk-1280x800.png`：墨夜窄窗与暖米。
- `downloads-selection-menu-1280x800.png`：原 Ctrl 多选与右键菜单。
- `downloads-large-font-1024x700.png`：20px 根字号，原虚拟行/槽均为 46px。
- `downloads-empty-1024x700.png`：出错筛选的原空态。

数据全部明确标为 fixture；下载传输与外部 shell 被替代，其他 worker 方法委托原实现。生成的 20 秒静音 WAV 经原生 Audio 播放，只证明软件管线。真实音乐源下载/网络重试、系统文件管理器/浏览器实际打开、扬声器及 Windows/macOS 体验尚未验证。

[evidence.json](evidence.json) 记录干净实现提交、UTC、运行版本、完整构建/harness/PNG SHA256、七门结果与行为证据摘要。最终 PR head CI 会重新构建及运行完整 themes35/media3/window3/native-drag1/downloads6；完整 manifest/日志在 90 天 CI artifact，关键 PNG 永久入库。父 M3b 尚未完成，本 PR 不合并。

PR #17 列对齐修复：下载页表头采用固定表格布局和 border-box，与数据行使用相同 rem／百分比列宽；列表稳定预留滚动槽，与全局表头的预留宽度一致。保持原 2.3 × 根字号行高与所有动作。

真实 Electron 六列表头／每个可见行左右边界检查（容差 1 CSS px）已接入 CI，并要求两种尺寸都具备记录；表头文字中心也须位于对应数据列。1280×800／16px 最大边界差 0px，1024×700／20px 为 0.5px，原始坐标见 [16px](column-alignment-1280x800-font16.json) 与 [20px](column-alignment-1024x700-font20.json)。旧样式在同一检查下退出 1（序号／品质／操作表头各宽 12px），失败日志保留本地 `_goal/logs/columns-negative.log`。
