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

本地媒体管线可单独验证，不改变原主题矩阵：

```sh
LUX_EVIDENCE_MODE=media LUX_EVIDENCE_DIR=artifacts/media npm run evidence
```

`media` 模式只在 Linux 独立 Xvfb/私有 WM 会话运行一个真实 Electron 进程，要求三张截图和八项实际行为：本地文件导入、递增的播放时钟、暂停、seek、下一首、上一首、音量和静音、播放模式。临时生成两首明确标记的45秒 PCM WAV，点击原歌单菜单，仅在系统文件选择器边界返回这两个路径；文件元数据 worker、SQLite、IPC、原播放器控件和 HTMLAudioElement 均保持生产实现。helper 按原 aria-label 找到控件，支持现有 div 播放键，通过原生鼠标事件操作，不依赖未来外壳按钮重构。seek 仅为原交互 mask 增加稳定 data-action 标记，事件逻辑不变。额外 preload 通过 Proxy 调用原 Audio 构造并返回原生元素，只记录只读实例快照，不改写播放方法、currentTime、src 或 volume。音量轮先读取实际可信 WheelEvent 的 delta 符号，再用原滚轮处理器改变真实音量；必须核对原生媒体、renderer 设置和磁盘配置，并用原控件恢复。截图和进程/WM 身份、正常退出及清理继续受 driver 原规则核验。没有模拟音频设备，不声称扬声器声音、在线音乐服务、完整歌词/音效/倍速或桌面歌词已经验证；这些仍需后续检查点证据。

原媒体 helper 的坐标命中、原生点击与本地化label查询集中到 `ui.cjs` 并由实际media模式使用；函数体及事件数值/顺序保留。后续窗口/导航工具复用同一套真实输入，不通过单独DOM click或伪状态替代它们。此抽取不启用未来外壳断言；themes35与media3/八行为仍必须实际全部通过。

原窗口控件与全屏另有独立 Linux 模式：

```sh
LUX_EVIDENCE_MODE=window LUX_EVIDENCE_DIR=artifacts/window npm run evidence
```

`window` 使用原设置页切换左右按钮，真实鼠标点击原 min/close 控件；必须看到原生 minimize event，恢复后等待真实可见焦点。close 用临时 listener 阻止销毁，只证明原 IPC 和 close request；原 main_window_close handlers 仍在 tray/sync/desktop lyrics 全关闭的临时 profile 运行，不声称没有副作用或关闭按钮已经退出进程。原 F11 必须同时改变 BrowserWindow 和 renderer fullscreen 状态，隐藏按钮、切换 drag CSS；退出须原生 leave 事件、原 bounds、可见焦点、配置字号和按钮/drag CSS 全恢复，并记录真实双帧重绘。默认一进程三图（左右按钮、全屏），原 themes35/media3 矩阵完整保留；driver 核验 owned WM、PID、正常退出和 cleanup。

原生拖动取证独立为 M2t3b2：本地诊断的 XTest 指针移动 40×20 后窗口未移动，仍待修复，不能用上述 drag CSS 检查代替实际拖动或声明完整 M2 已通过。Windows/macOS 与真实 close-button 退出仍待真机验证。

原生拖动单独运行，保留上述三套完整 CI 矩阵：

```sh
LUX_EVIDENCE_MODE=native-drag LUX_EVIDENCE_DIR=artifacts/native-drag npm run evidence
```

`native-drag` 在一个真实原应用进程检查侧栏与工具栏区域，输出一张图及完整原生指针/窗口坐标记录。两个 10×5 的真实 priming 运动必须先让窗口实际移动并稳定，随后才读取 beforeTravel；四段 10×5 连续手势后，实际窗口相对 beforeTravel 必须移动40×20，抬键后仍稳定，最后才允许 setPosition 恢复 originalBefore。总指针运动60×30，窗口总位移另行如实记录，不将总手势夸成40×20。CSS drag/指针移动/截图本身均不能代替实际窗口位移。每个区域全部 await 受20秒预算约束，单命令至多2秒且先等退出；异常时额外各2秒抬键与观察，截止后不再发后续手势或 restore。

尺寸准备前读取并要求原应用 resizable=false、非全屏的默认窗口状态；临时调整截图 viewport 后先恢复该原生不可缩放状态，实际焦点/可见性/content size/renderer viewport 与 DPR/zoom=1 就绪且真实重绘后才开始手势。两区域前后都必须保持不可缩放，缺少状态证据即失败。这是原应用固定窗口状态的独立拖动取证；最终 M2gate 仍须在同一 interactions 窗口里完成 F11 往返后再做原生拖动。此前单段手势失败与最小 Electron 诊断保留；此模式不声明 Windows/macOS 已通过。
