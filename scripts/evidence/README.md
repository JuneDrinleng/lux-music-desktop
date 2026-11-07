# Electron 应用证据

`npm run evidence` 启动锁文件对应的 Electron，执行真正的 `dist/main.js` 和 `dist/index.html`。SQLite worker、应用 IPC、Vue router、组件与 CSS 均来自正常生产构建。截图不是另写的 HTML 样张，也不替换应用 IPC。

先运行已审阅的 runtime 准备步骤，再构建 main 和 renderer：

```sh
node scripts/evidence/prepare-runtime.cjs
npm run build:main
npm run build:renderer
npm run evidence
```

默认输出 `docs/screenshots/m0/`，包含六个实际侧栏入口在 1280×800 和 1024×700 下的截图、`manifest.json` 和运行日志。Linux 默认通过现有 `xvfb-run` 使用独立 display，隔离宿主桌面窗口与焦点；需要观察实际桌面时可显式设置 `LUX_EVIDENCE_XVFB=0` 使用经 `xdpyinfo` 检查的现有 display。默认要求系统有中文字体。CI 通过环境变量保存到 artifact：

```sh
LUX_EVIDENCE_DIR=artifacts/screenshots npm run evidence
LUX_EVIDENCE_DIR=artifacts/baseline-three-sizes LUX_EVIDENCE_SIZES=1024x700,1280x800,1440x900 npm run evidence
```

Linux 独立 display 的每个阶段经 `dbus-run-session` 建立私有 D-Bus，再由 `display.cjs` 启动自己的 xfwm4 和原 Electron。需要已安装 xvfb、xauth、xfwm4、x11-utils、dbus-bin、dbus-daemon；缺失时直接失败，不在取证期间安装。wrapper 不替换宿主窗口管理器，只在私有 display 没有现存 WM 时启动；xfwm4 和私有 D-Bus 激活服务的 XDG 写路径位于临时目录，Electron 的 HOME 与原环境保持。每阶段的 display JSON 记录 WM 版本、实际 child PID、EWMH 所有者和退出结果；driver 核对 run/phase、Electron PID 与进程清单一致、WM PID 与 EWMH 一致，以及 owned child 全部清理完毕。退出时只向自己创建的 child 发送信号，三秒未退出才对该 child 发 SIGKILL，不操作宿主进程组。显式使用现有 display 或非 Linux 时仍走原启动路径，清单注明窗口管理器所有权未经验证，不将这类运行冒充私有 WM 证据。此变更只准备显示会话基础设施，不证明原生拖窗、窗口按钮或媒体行为。

M1 用真实主题切换和完整进程重启取证：

```sh
LUX_EVIDENCE_MODE=themes LUX_EVIDENCE_DIR=artifacts/screenshots npm run evidence
```

`themes` 模式顺序启动九个独立 Electron 进程，共用一个仅在首次启动前初始化的临时 profile。先取上述十二张页面截图，再以 Enter/Space 在实际设置页选择六个新主题、保留的 green 主题及明确标记的自定义主题 fixture。每次必须等上一个应用正常退出后再启动新进程，核对主进程、renderer、实际 CSS 和磁盘配置；最后一个进程只验证自定义主题重启保持。首个进程还会右键打开原自动主题配置弹层，逐项核对六个主题色块 `::after` 的实际背景色，再点击原关闭按钮退出，确认当前主题保持 lime。默认矩阵包含 35 张证据截图：十二张页面、六张主题、六张键盘 focus-visible、两张兼容主题、八张进程重启保持，以及一张自动主题色块预览。真实音频设备警告另记为 observation，不计入这个矩阵。

每个阶段会记录实际数据库查询和截图的字体、双 animation frame、DOM 快照、capturePage 边界，失败清单包含最后阶段和窗口可见/最小化/焦点/节流状态。Xvfb 可能把可见窗口当作后台窗口并停止 animation frame；证据 harness 会单独关闭目标 webContents 的后台节流，仍要求每张图前两个真实帧的时间戳严格递增并写入清单。相对等待期限与阶段耗时使用 performance.now 单调时钟，UTC 时间仅作取证标签，系统时钟校正不消耗等待预算。单次 renderer 操作和截图必须在十秒内完成，整个进程阶段上限为两分钟。driver 另对每个具体 launcher child 设置 150 秒退出期限，覆盖 Electron 尚未建立内部计时器、正常退出未完成或 launcher 卡住的情况；期限到达后只向此 child 发 SIGTERM，三秒仍未退出才发 SIGKILL，并等待其实际 exit 后写入失败及 PID/期限/退出状态，不重启该阶段。超时直接失败，不跳过绘制或主题验证。

运行使用自动删除的临时 userData 和真实空数据库，不读取个人配置或账号。确定性的配置种子选择简中、关闭透明/动画/自动下载更新/协议提示/更新日志、打开下载入口，并关闭同步、OpenAPI、桌面歌词和托盘。种子的完整内容写在清单中；这些是截图环境设置，不代表应用默认值。HTTP(S) 和 Node TCP 都在证据环境拒绝连接，因此在线歌单和榜单展示真实错误或空状态，不将公共服务响应或合成曲目冒充回归证据。应用 URL scheme 的系统注册和外部浏览器启动被抑制，避免修改运行宿主。

`manifest.json` 记录提交、PR head/base（如 CI 提供）、工作区是否含未提交改动、整个 `dist/` 构建文件和证据脚本的 SHA256、UTC 时间、OS/Node/Electron/Chromium/ABI、尺寸、路由、页面文本快照、配置种子、网络边界及每张 PNG 的 SHA256。矩阵完成后再次校验构建和证据脚本，任何中途变更都使证据失败。云端没有音频设备时，先单独保存真实启动警告截图与 observation，再点击应用原有确认按钮，避免警告遮住每个页面；不会模拟存在音频输出。Vue 未挂载、导航缺失、尺寸错误、renderer 崩溃、未处理异常或清单不完整均返回失败。初始检查点允许记录 dirty source；最终提交验证应在干净且正确的 checkpoint HEAD 构建，截图输出自身不应用作源代码变更。

此基线只证明 Linux 云端能运行真实应用并逐页取证。Windows/macOS 窗口/任务栏、系统托盘、音频输出、桌面歌词独立窗口、实际媒体下载和在线音乐服务仍需相应检查点的独立测试或真机确认；截图不能替代这些行为证据。

辅助 xfwm4（含版本探针）在其专有环境设置 `NO_AT_BRIDGE=1`，避免 GTK 等待桌面 AT-SPI 服务；Electron 原环境与可访问性行为保持。受控私有慢 `org.a11y.Bus` 对照中，原探针三次均触发 GetAddress 并超时，加标志组三次均正常完成且未调用该服务。CI 首次观测是版本探针超时，未采集到其 D-Bus trace，不把对照实验冒称同一次 CI 的根因实证。1500ms 探针期限、8000ms EWMH 身份/PID readiness 与全部矩阵检查保留；探针失败记录原 stdout/stderr，便于区分后续故障。

版本元数据通过无GUI的 `dpkg-query` 读取：先解析 PATH 中实际可执行文件及 realpath，验证该文件由已安装的 xfwm4 包拥有，再记录包版本和实际文件 SHA256，实际启动也使用同一绝对路径。取证环境已有 dpkg/xfwm4 安装要求。原 `xfwm4 --version` 会额外初始化一次 GTK，CI 在没有输出时超过1500ms；即使隔离AT-SPI后仍复现，所以不再为元数据多启动一个GUI进程。每条metadata命令仍限1500ms；真正WM仍须在8000ms内发布原EWMH自引用/名称/owned PID，且存活到实际Electron退出。包元数据不代表WM已就绪；任何归属、版本或实际就绪/清理失败仍返回失败。
