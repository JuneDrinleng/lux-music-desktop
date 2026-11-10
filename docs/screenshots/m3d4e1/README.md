# desktop-m3d4e1 · 搜索设置控件

交付 PLAN 4.2 的 M3d4e。入口是原侧栏“设置”→原“搜索设置”分类。三个原开关改为继承用户字体的纸面行、方形墨线 checkbox、较清晰的行距与细分隔线，使用 M1 paper / ink / muted / rule / hairline token。

生产改动仅在 `SettingSearch.vue` 的局部 class 和 Less；三个 base-checkbox、id、顺序、四语言引用、model-value / updateSetting 绑定均保留。script 与领取 dev 逐字相同，script SHA256 为 `fce00f8c2a8371d84b78a3bd7f849fddda694f4cde7b2c3ee9ead150648faef7`。不勾选父 M3d。

领取 base：`63bfbdd8cb9b8926e5eba869c8784ca355561d12`。最终本地 queue 取证 source head：`24964c70567278fb4f4eb494b53009cc1bb3d376`；其余完整矩阵 source head 为 `b674b8eb`（仅新增本地失败说明）。完整 source、build/harness/PNG SHA256、逐项结果和原生进程身份在 [evidence.json](evidence.json)，九张随 PR 保留的原始图的字节哈希在 [SHA256SUMS](SHA256SUMS)。PNG 已逐张目视检查。

## 固定搜索矩阵

| 主题 | 实际 viewport | 原 UI 字号 | 原始 PNG |
| --- | --- | --- | --- |
| lime | 1024×700 | 16px | [图片](settings-search-lime-1024x700-font16.png) |
| lime | 1280×800 | 16px | [图片](settings-search-lime-1280x800-font16.png) |
| lime | 1440×900 | 16px | [图片](settings-search-lime-1440x900-font16.png) |
| oat_milk | 1280×800 | 16px | [图片](settings-search-oat_milk-1280x800-font16.png) |
| ink_night | 1280×800 | 16px | [图片](settings-search-ink_night-1280x800-font16.png) |
| lime | 828×540，原最小支持预设 | 19px | [图片](settings-search-lime-828x540-font19.png) |

828×540 是原 `windowSizeList` 的最小支持尺寸；原非自由缩放窗口未设置原生 minimum-size 限制。每个场景同时核对 native content size 和 renderer viewport，主题及字号均由原 UI 选择并核对 UI / renderer / main / 临时 profile 磁盘状态。

三个完整焦点图均在 lime、828×540、19px 下取得：

| 原控件 / 设置键 | 实际 Tab 次数 | 原始焦点 PNG |
| --- | --- | --- |
| `setting_search_showHot_enable` / `search.isShowHotSearch` | 1 | [热搜](settings-search-focus-setting_search_showHot_enable.png) |
| `setting_search_showHistory_enable` / `search.isShowHistorySearch` | 2 | [历史](settings-search-focus-setting_search_showHistory_enable.png) |
| `setting_search_focusSearchBox_enable` / `search.isFocusSearchBox` | 3 | [自动聚焦](settings-search-focus-setting_search_focusSearchBox_enable.png) |

从原标题鼠标点击后发送真实 Tab 到原 `role=checkbox`，没有调用 DOM focus()。三个焦点环均为 2px、offset 3px，完整位于祖先裁剪区域内；文字片段、完整几何和中心命中均核对，无横向溢出或遮挡。截图沿用原 screenshot 的真实双帧绘制与原超时，所有新增图 kind 独立为 `settings-search`。

每个控件分别鼠标、Enter、Space 切换一次并以同一方式恢复，共 18 次操作。只读 MutationObserver 核对每次恰好一个 aria-checked 变化，并核对原隐藏 input、指定 renderer / main / 磁盘键。每个鼠标切换后离开分类再返回，改变值保持。三个初值本轮均 false，最后均恢复 false；主题 ink_night、字号 16、原分类“基本设置”、完整路由 `#/list?id=default`、原窗口 bounds 和原生状态全部恢复。来源列表、最终空队列及当前音频语义保持。

helper 主体预算 40 秒、清理 10 秒，所有异步操作纳入；本轮主体 9160ms，总计 9479ms。八项清理各自尝试并全部成功。缺场景、少图、缺动作或任何清理失败均抛错。queue 原 8 图及全部行为、源列表断言、real-queue 记录完成后，无条件 await helper，直接传原 context；player、capture、electron-main 和旧计数均未修改。

## 完整本地检查

`npm run verify` 依次实际执行以下七门，退出码均为 0：

| 命令 | 退出码 | 测试通过 / 失败 / 跳过 |
| --- | --- | --- |
| `npm run lint` | 0 | 不适用 |
| `npm run typecheck` | 0 | 不适用 |
| `npm test` | 0 | 160 / 0 / 0（cancelled/todo 亦为 0） |
| `npm run build:main` | 0 | 不适用 |
| `npm run build:renderer` | 0 | 不适用 |
| `npm run build:renderer-lyric` | 0 | 不适用 |
| `npm run build:renderer-scripts` | 0 | 不适用 |

该本地 verify source 为 `e57419bb`；之后仅修正 helper 的取证假设并实际重跑定向 ESLint、完整 queue 和以下所有原模式，生产构建字节未变。最终 PR head 的七门检查由完整 CI 再执行。纯样式没有新增镜像实现单测。

依赖安装前审阅 package / lock 生命周期，`npm ci --ignore-scripts` exit 0；审阅 Electron installer / SQLite probe 后 `npm run evidence:prepare` exit 0（Electron 42.11.6，SQLite create/insert/select/close）。未运行 postinstall、pack、publish。

| 原模式 | 实际退出码 | 保留矩阵 |
| --- | --- | --- |
| themes | 0（完整重跑） | 35，9 个真实进程，共用该模式唯一临时 profile |
| media | 0 | 3 |
| window | 0 | 3 |
| native-drag | 0 | 1 |
| settings | 0 | 21，尺寸 1280×800 / 1024×700 / 1440×900 |
| queue | 0（第三轮） | 原 queue 8 + media 3 + 新 settings-search 9 |
| downloads | 0 | 6 |

各实际命令、逐图 SHA256、阶段 PID / 退出码 / 期限均在 evidence.json。原启动音频警告等 observation 附图继续保留在原 artifact，不并入上述 89 张矩阵计数。

本地 Linux x64、Electron 42.11.6、Xvfb / private D-Bus / owned xfwm4 4.20.0-1。每个成功阶段 EWMH owner PID 与所启动 WM PID 一致，Electron 与 WM 退出码为 0，cleanupComplete=true，临时 profile 已删除。原 main 120 秒、capture 150 秒期限未延长。

本地完整日志及开发失败 manifest 在 `artifacts/m3d4e1-local/`，最终模式完整日志与 PNG 在各 `artifacts/m3d4e1-*`。既有 CI 原样执行全部七门与完整矩阵，并上传其完整 `artifacts/` 和 `dist/`，保留 90 天；最终 head 的 run/attempt、实际 checkout、artifact 链接记录在 PR 正文及工作副本本地交付报告。开发中真实失败见 [failures.txt](failures.txt)，不作为通过结果。

工作目录为 workspace.sh 建立的独立副本。其共享 Git 元数据只读，fetch 报只读错误后改用本任务新建 `/tmp/desktop-m3d4e1-git` 配合原工作目录；未修改共享 `_base`，独立提交备份为 `artifacts/m3d4e1-local/implementation.bundle`。

## 风险与未做项

验收仅覆盖原搜索设置控件、持久化和本次样式，搜索结果页、整个 M3a、父 M3d 未验收。Linux 离线软件 fixture 不代表公共音源、真实音频硬件、Windows/macOS 已验证。保留原组件和按键逻辑；后续真实平台验收仍需执行。未修改共用 Checkbox、设置容器、搜索页、keyBind、播放或同步逻辑；未合并、打 tag、发版或删除分支。
