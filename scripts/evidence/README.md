# Electron 应用证据

`npm run evidence` 启动锁文件对应的 Electron，执行真正的 `dist/main.js` 和 `dist/index.html`。SQLite worker、应用 IPC、Vue router、组件与 CSS 均来自正常生产构建。截图不是另写的 HTML 样张，也不替换应用 IPC。

先运行已审阅的 runtime 准备步骤，再构建 main 和 renderer：

```sh
node scripts/evidence/prepare-runtime.cjs
npm run build:main
npm run build:renderer
npm run evidence
```

默认输出 `docs/screenshots/m0/`，包含六个实际侧栏入口在 1280×800 和 1024×700 下的截图、`manifest.json` 和运行日志。无 `DISPLAY` 的 Linux 自动通过现有 `xvfb-run` 启动。默认要求系统有中文字体。CI 通过环境变量保存到 artifact：

```sh
LUX_EVIDENCE_DIR=artifacts/screenshots npm run evidence
LUX_EVIDENCE_DIR=docs/screenshots/m2 LUX_EVIDENCE_SIZES=1024x700,1280x800,1440x900 npm run evidence
```

运行使用自动删除的临时 userData 和真实空数据库，不读取个人配置或账号。确定性的配置种子选择简中、关闭透明/动画/自动下载更新/协议提示/更新日志、打开下载入口，并关闭同步、OpenAPI、桌面歌词和托盘。种子的完整内容写在清单中；这些是截图环境设置，不代表应用默认值。HTTP(S) 和 Node TCP 都在证据环境拒绝连接，因此在线歌单和榜单展示真实错误或空状态，不将公共服务响应或合成曲目冒充回归证据。应用 URL scheme 的系统注册和外部浏览器启动被抑制，避免修改运行宿主。

`manifest.json` 记录提交、PR head/base（如 CI 提供）、工作区是否含未提交改动、整个 `dist/` 构建文件和证据脚本的 SHA256、UTC 时间、OS/Node/Electron/Chromium/ABI、尺寸、路由、页面文本快照、配置种子、网络边界及每张 PNG 的 SHA256。云端没有音频设备时，先单独保存真实启动警告截图与 observation，再点击应用原有确认按钮，避免警告遮住每个页面；不会模拟存在音频输出。Vue 未挂载、导航缺失、尺寸错误、renderer 崩溃、未处理异常或清单不完整均返回失败。初始检查点允许记录 dirty source；最终提交验证应在干净且正确的 checkpoint HEAD 构建，截图输出自身不应用作源代码变更。

此基线只证明 Linux 云端能运行真实应用并逐页取证。Windows/macOS 窗口/任务栏、系统托盘、音频输出、桌面歌词独立窗口、实际媒体下载和在线音乐服务仍需相应检查点的独立测试或真机确认；截图不能替代这些行为证据。
