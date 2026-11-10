# M3c2 播放详情实机证据

本目录 8 张 PNG 均为生产构建 Electron 42.11.6 的原始 capturePage 输出，没有缩放、拼图或静态替代。源码 head、base、全部构建/harness/PNG SHA256、原生媒体观察和恢复结果见 `evidence.json`。本地完整输出位于 `artifacts/m3c2-*`，失败输出保留在 `artifacts/m3c2-media-failed-1` 和 `artifacts/verification-attempt1`；简短原始失败栈见 `failures.txt`。

本次只调整详情容器、封面与信息排印、详情控制区及窗口按钮焦点。原播放事件、用户字体、主题、左右按钮和全屏退出保留；播放按钮成为可键盘操作的原生 button。歌词、评论、共用弹层内部、播放核心、底部三进度组件、虚拟行高没有改动。定时仍通过隐藏详情后的“设置 → 基本设置”原入口到达。

复现先运行 `npm ci --ignore-scripts`、`npm run verify`、`npm run evidence:prepare`，再逐项运行：

```sh
LUX_EVIDENCE_MODE=media LUX_EVIDENCE_DIR=artifacts/m3c2-media LUX_EVIDENCE_SIZES=1280x800,1024x700,1440x900 npm run evidence
LUX_EVIDENCE_MODE=themes LUX_EVIDENCE_DIR=artifacts/m3c2-themes npm run evidence
LUX_EVIDENCE_MODE=window LUX_EVIDENCE_DIR=artifacts/m3c2-window npm run evidence
LUX_EVIDENCE_MODE=native-drag LUX_EVIDENCE_DIR=artifacts/m3c2-native-drag npm run evidence
LUX_EVIDENCE_MODE=settings LUX_EVIDENCE_DIR=artifacts/m3c2-settings LUX_EVIDENCE_SIZES=1280x800,1024x700,1440x900 npm run evidence
LUX_EVIDENCE_MODE=queue LUX_EVIDENCE_DIR=artifacts/m3c2-queue npm run evidence
LUX_EVIDENCE_MODE=downloads LUX_EVIDENCE_DIR=artifacts/m3c2-downloads npm run evidence
```

| 模式 | 实际图数 | 原行为与新增行为 |
| --- | ---: | --- |
| themes | 35 | 原主题、兼容、焦点与独立进程重启矩阵 |
| media | 3 + 8 详情 | 原八项媒体行为；详情时钟/暂停/seek/恢复、前后曲资源、音量/静音、模式落盘、原滑条驱动 native playbackRate 1→1.5→1、F11/原退出按钮、评论返回、隐藏恢复、音效与定时入口、进入前状态恢复 |
| window | 3 | 原左右最小化/关闭请求、全屏 |
| native-drag | 1 | 原两个拖动区真实位移与复位 |
| settings | 21 | 原十六分组、主题/尺寸/19px、复选框持久化 |
| queue | 8 + 3 media | 原九项队列行为、原媒体八项行为 |
| downloads | 6 | 最新 dev #17 原十项行为与两个尺寸/字号的列对齐；下载 transport fixture 边界沿用原说明 |

共 88 张；每个进程退出 0，WM EWMH 身份对应拥有的 xfwm4 子进程，清理完成，截图尺寸和所有哈希已逐项核验。详情检查由原 CI 必跑的 media → `player.cjs` 直接调用 `play-detail.cjs`，使用独立 `play-detail` kind；原 media 90s 时限、断言及共用 capture/electron-main/CI 文件没有放宽或改动。新详情检查 55s，恢复 20s；无诊断跳过开关，缺 DOM 或行为不符直接抛错。queue 模式保留原矩阵。

详情图覆盖 1024×700、1280×800、1440×900、实际最小 828×540/19px；黄绿/暖米/墨夜、左右窗口按钮、原生 Tab 焦点、每个可见按钮中心命中和横向溢出均核对。无封面保留唱片占位；第二首使用原同名 PNG 封面查找，图片来源是仓库 `doc/images/icon.png`，不是注入歌曲状态。

边界：仅 Linux Xvfb/xfwm4；驱动 Node 24.22.1，现有 CI 使用 Node 22。本地 WAV 不含歌词，评论是原“不支持获取评论”状态；在线歌词/评论内容未验。窄屏打开评论后信息列按原布局收窄，可滚动查看长标题。音效仅核对原弹层入口，定时仅打开关闭且未启动；不证明物理声卡/扬声器输出、全部音效算法、桌面歌词原生窗口或 Windows/macOS 行为。

完整构建、取证 manifest、截图与日志由未改动的 CI `desktop-evidence-<github.sha>-<attempt>` artifact 提供，保留期 **90 天**；最终 run/attempt、head/base、artifact 链接与验收状态记录在 PR 正文和本地 `_goal/REPORT.md`，不以历史 PR 绿灯替代本轮验证。

基线已更新到最新 dev `63bfbdd8cb9b8926e5eba869c8784ca355561d12`（#17）；以上七门与七模式均重新执行，最终源码取证 head 为 `057aecaa64311064179f1971b1f402bdc016e6f9`，其后只更新本目录证据。旧基线成功输出保留在 `artifacts/m3c2-*-base567c5d7b`。

## PR #23 Space 键返工

独立测试在 `5808677d275a93c98d3cb96641761a839a4c23e7` 发现：详情原生播放按钮的 Space 默认 click 被共享 keyup 的无条件 `preventDefault()` 取消。返工仅对原生 `BUTTON` 的 Space keyup 保留默认行为；仍分发原事件、清理按下状态，已配置快捷键仍可自行取消事件。其他目标与其他按键保留原行为。

`tests/unit/key-bind.test.cjs` 覆盖原生默认行为、释放后无残留按键、其他目标/按键及快捷键优先处理；首项在返工前失败，修复后三项通过。media 取证现通过 `play-detail-keyboard.cjs` 增加实际 Tab 聚焦后的 Enter/Space 播放切换与恢复、Enter/Space 前后曲的原生资源核对，以及 `xdotool` 的真实系统 Space 输入。每次激活必须恰有一次可信 click，Space keyup 必须未被取消；不调用组件 handler 或模拟媒体状态。

本目录原图及其历史摘要保留。此次返工的新构建、七种模式 manifest、检查命令/结果和未验证范围记录在任务目录 `_goal/REPORT.md` 与 `_goal/rework-evidence/`；本地 dev 自验不代替独立 test 对新 head 的复测。保留 `changes-requested`，仅在推送和远端核对成功后申请 `needs-test`。
