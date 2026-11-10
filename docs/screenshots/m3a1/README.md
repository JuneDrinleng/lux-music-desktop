# M3a1 搜索页真实 Electron 证据

源码与构建来自干净提交 `a00d872ad509e26471ca3ad3ceee3007279cdc73`，基于 dev `fb3cde65`。17 张图通过生产 `dist/main.js`、原 Vue/Router/SDK/IPC 和真实 SQLite，在一个临时 profile 中生成；Node HTTP 边界只返回明确标记的酷我原始响应 fixture，其他外部连接被阻止。

[evidence.json](evidence.json) 记录命令、源码、UTC、OS/Node/Electron/Chromium、构建及 harness 哈希、157 项测试和七门检查的退出码、45 条行为记录、实际虚拟槽测量，以及每张 PNG 的尺寸、路由、主题与 SHA256。完整原始 manifest、阶段与进程/WM/cleanup 明细及日志保留在本地 artifacts/search；最终 PR head 的 CI artifact 同样重新生成完整证据，保留 90 天。此归档提交仅加入图片和文档，源码 commit 指向实际构建及运行的前一提交。

图片覆盖热搜、建议、多选、原菜单及添加弹层、虚拟滚动、歌单、两类空态/失败态、历史、1024×700/1280×800/1440×900、19px 字号与暖米/墨夜。真实输入验证歌曲/歌单和六来源切换、建议键盘提交、热搜/历史点击、历史右键移除/清空、两种分页及清空后同词重试。真实 SQLite 添加歌单、37px/44px 固定槽高、`top=index×height` 和翻页回顶均有断言。

播放/下载菜单及未安装用户音源 API 时的原禁用规则已验证；未冒称在线播放、实际下载或音源服务已经验证。Linux 云端截图不能替代 Windows/macOS 原生窗口、字体、系统音频、托盘和安装包真机验收。完整主题/媒体/窗口/拖动矩阵及 CI 结果见 PR 和本地 `_goal/REPORT.md`。
