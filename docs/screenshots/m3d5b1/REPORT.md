# desktop-m3d5b1：关于信息排印与 Electron 证据

只交付 PLAN 4.2 M3d5b。基线 dev：`63bfbdd8cb9b8926e5eba869c8784ca355561d12`；实现提交：`ed7fd45193b91c1a161feb7dab265f89073086a3`。本目录后续提交只补证据；最终 PR/head/CI run、attempt、实际 checkout 与 artifact 见交付后本地 `DELIVERY.local.md`、`ci-attestation.local.json`，不使用旧 head 的绿灯代替最终检查。

生产修改仅 SettingAbout.vue：paper/ink/muted/rule/hairline、原字体继承、行距、段间分隔、长 URL 换行及完整命中盒。原 template 去掉新增局部类后逐字相同；script 逐字相同，SHA256 `6a83e2046a1844cd974ad32ecf70d0644e7503dc467a5d3654450827ebf1c48c`。全部十段、落雪无痕署名、免费/开源/第三方渠道/非官方账号声明、五个原 lyswhut URL 和原 handleShowPact 均保留；未改语言、设置顺序或业务。逐个 URL/事件及受保护文件 SHA256 见 [preservation.json](preservation.json)。

新增独占 settings-about.cjs；window.cjs 原正文逐字保留，仅在原左右按钮、minimize/guarded close/F11 检查、清理及失败抛出之后无条件 await 调用。只使用现有 context 与 ui.cjs 原生输入；检查总预算 40 秒、独立清理总预算 10 秒，含全部 await，超时/缺 DOM/少图/协议往返不完整即抛错。保留首错和各清理错误；没有跳过开关。原 electron-main 120 秒、capture 150 秒、窗口/绘制/WM/裁剪断言及按 kind 的原三图规则均未改。

真实生产构建、临时空 userData、原离线 fixture（已同意协议、自动更新关闭）。通过原设置侧栏及“关于”分类进入；每场景逐段滚动核对全部文字与五链接中心，外链从未点击。真实点击原许可协议按钮，检查原 PactModal/协议正文/原关闭按钮，再真实关闭返回；未进行首次签署、退出协议或更新。主题、字号通过原控件切换，逐项记录 renderer/main/磁盘与 radio/aria/computed 字号。真实 Shift+Tab/Tab 后要求 :focus-visible、完整轮廓及文本不被祖先裁剪。

固定六场景均通过；原垂直滚动保留，横向溢出为零。每格都是未编辑的原始 PNG：

| 主题 / viewport / 字号 | 首部 | 尾部与署名 | 实际 Tab | 原许可协议 |
| --- | --- | --- | --- | --- |
| 黄绿 1024×700 / 16px | [首](about-lime-1024x700-16px-top.png) | [尾](about-lime-1024x700-16px-bottom.png) | [焦点](about-lime-1024x700-16px-focus.png) | [协议](about-lime-1024x700-16px-pact.png) |
| 黄绿 1280×800 / 16px | [首](about-lime-1280x800-16px-top.png) | [尾](about-lime-1280x800-16px-bottom.png) | [焦点](about-lime-1280x800-16px-focus.png) | [协议](about-lime-1280x800-16px-pact.png) |
| 黄绿 1440×900 / 16px | [首](about-lime-1440x900-16px-top.png) | [尾](about-lime-1440x900-16px-bottom.png) | [焦点](about-lime-1440x900-16px-focus.png) | [协议](about-lime-1440x900-16px-pact.png) |
| 暖米 1280×800 / 16px | [首](about-oat_milk-1280x800-16px-top.png) | [尾](about-oat_milk-1280x800-16px-bottom.png) | [焦点](about-oat_milk-1280x800-16px-focus.png) | [协议](about-oat_milk-1280x800-16px-pact.png) |
| 墨夜 1280×800 / 16px | [首](about-ink_night-1280x800-16px-top.png) | [尾](about-ink_night-1280x800-16px-bottom.png) | [焦点](about-ink_night-1280x800-16px-focus.png) | [协议](about-ink_night-1280x800-16px-pact.png) |
| 黄绿实际最小 828×540 / 19px | [两行 URL](about-lime-828x540-19px-top.png) | [尾](about-lime-828x540-19px-bottom.png) | [完整焦点](about-lime-828x540-19px-focus.png) | [协议](about-lime-828x540-19px-pact.png) |

已目检最小窗首部/协议、暖米首部、墨夜焦点、1440 首部；预验收另目检最小窗尾部/焦点及墨夜协议。六场景全部几何/文字/命中/协议开关数据见 [about-checks.json](about-checks.json)。还保留原 [左按钮](window-controls-left.png)、[右按钮](window-controls-right.png)、[F11](window-fullscreen.png) 三图。进入前后均为 lime/16px、`#/search?source=all&type=music`、bounds `(403,241,1280,800)`、resizable=false/fullscreen=false；协议、全屏、主题、字号、分类/路由、bounds、可缩放七项分别恢复成功，恢复三方状态无失败。

`npm run verify` 在固定实现提交且干净工作树执行，真实结果如下；完整退出码、时长与日志 SHA256 见 [verification.json](verification.json)。没有缺失检查；未新增镜像样式单测。

| 实际命令 | 退出码 | 结果 |
| --- | --- | --- |
| npm run lint | 0 | 通过 |
| npm run typecheck | 0 | 全部原 TS/Vue 项目通过 |
| npm run test | 0 | 160 通过 / 0 失败 / 0 跳过 / 0 取消 / 0 todo |
| npm run build:main | 0 | 生产构建通过 |
| npm run build:renderer | 0 | 生产构建通过 |
| npm run build:renderer-lyric | 0 | 生产构建通过 |
| npm run build:renderer-scripts | 0 | 生产构建通过 |

领取及提交前 dev 未变，当前 CI 共七种完整模式，均实际执行且最终退出码 0。精确命令、runId、15 个进程阶段、全部 PNG SHA256、source head/base、构建/harness SHA256、Electron/owned WM 身份及清理见 [provenance.json](provenance.json)。命令前缀均为 `LUX_EVIDENCE_MODE=<mode> LUX_EVIDENCE_DIR=artifacts/m3d5b1-<mode>`，后接 `npm run evidence`；settings 另带 `LUX_EVIDENCE_SIZES=1280x800,1024x700,1440x900`。

| mode | 退出码 | 实际保留矩阵 |
| --- | --- | --- |
| themes | 0 | 35 图 / 9 次实际进程启动 |
| media | 0 | 3 图及原八项播放器动作 |
| window | 0 | 原 window-controls 2 + window-fullscreen 1 + settings-about 24 |
| native-drag | 0（单独复跑） | 原 1 图、两区域实际拖动及恢复 |
| settings | 0 | 原 21 图 / 16 分类 |
| queue | 0 | 原 queue 8 图及原行为 + media 3 图 |
| downloads | 0 | 原 6 图及原行为 |

共 104 张常规图，原矩阵没有减少。Linux x64、Electron 42.11.6（Node 24.19.0 / Chrome 148.0.7778.280）；本地驱动 Node 24.22.1。每阶段均检查真实 Electron PID、owned xfwm4 PID/EWMH 自引用身份、正常退出 code=0、无超时和 cleanupComplete=true。原始完整日志在 artifacts/；最终 CI 沿用 `desktop-evidence-<实际checkout>-<attempt>` artifact，保留 90 天，不改 CI。

实际失败及限制见 [failures.json](failures.json)，没有把失败改记为通过：

- 首次 npm ci --ignore-scripts 因默认缓存只读退出 226；使用 `--cache /tmp/m3d5b1-npm-cache` 后退出 0。审阅根/依赖生命周期和 Electron installer 后，npm run evidence:prepare 退出 0，SQLite create/insert/select/close 真实通过。未运行 postinstall、pack、publish。npm ci 既有依赖审计报告 37 项（1 low / 17 moderate / 17 high / 2 critical），未扩大范围升级依赖。
- 新 helper 首次局部 lint 的四处格式错误已修复；五次窗口失败完整保留：分类误采搜索 Tab；SVG 空文本范围；clientWidth 整数边界误判；多行内联链接中心落空；nearest 滚动后链接盒底部 0.25px 未完全进入视口。分别修正新 helper 的范围/精确小数边界/原生滚动编排及本组件排印，裁剪阈值仍为 0.01px，原检查未改。首轮分类清理失败及其余独立清理成功均保留。
- 最终实现首轮 native-drag 在原位置恢复等待超时，虽实际测量位移 40×20、最终 bounds 回原位，仍记录退出 1；结束并发取证后以相同未改 harness 单独复跑退出 0。此项存在本地瞬态失败记录；不声称已修复原拖动实现。
- workspace.sh 幂等复核因共享锁只读失败，git add --dry-run 也因共享 index.lock 只读失败（这两条链式命令未单独保存退出码）。只读 worktree 清单确认指定目录、codex/desktop-m3d5b1 与正确基线。使用本任务新建的标准 Git 目录 `/tmp/m3d5b1-git`，工作树仍为原任务目录；原 .git、共享 _base、旧 goal Git 元数据均未改。此副本后续 Git 操作需指定该 GIT_DIR 和原工作树；远端任务分支是正式交付。
- Windows/macOS 真机与原生字体未验证；真实外链目标/外部浏览器未执行，未提交 Issue、发邮件、私信或联系任何人。最小窗原设置目录仍有既有省略号，公共目录/容器不在本次范围。原窗口 close 仅为 guarded request 证明，应用正常退出由原 driver 验证；不声称真实点击 close 后的进程退出已通过。
