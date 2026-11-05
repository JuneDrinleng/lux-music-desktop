# Lux Music 桌面版重构计划

编制日期：2026-11-05 UTC。任务依据：`/workspace/dev-bot/desktop/BRIEF.md`。本文先于实现编写；勾选只表示已有可复核证据，不能用预期结果代替实际结果。

## 1. 范围与边界

- 将 Electron + Vue 3 桌面应用改为 Lux Music 杂志风桌面布局，默认黄绿主题，并支持 mobile 的另外五套主题。
- 支持应用内切换：无同步（本地）、LX Music 同步、Lux Music 服务端同步。保留原 LX 客户端和本机同步服务端能力。
- 保留播放、搜索、在线歌单、排行榜、我的列表、下载、桌面歌词、自定义源、备份、快捷键、音效、OpenAPI 等原有功能。
- mobile、server 仓库只读参考，不复制其专有实现文件。桌面自行实现适配，保留上游版权声明和许可证。
- 仅向 `dev` 集成。不得改动、推送或合并到 `master`，不得 force push，不发布 Release，不删除任何分支、tag 或 Release。不启用自动预发布。
- 界面入口新增、移动、隐藏、删除、样式变化必须分别写在对应 PR 和本地 `_goal/PROGRESS.md`。删除功能需要 June 决定，不能自行执行。
- 版本号保持不变；Windows/macOS 真机体验无法由 Linux 云端截图替代，明确列为真机确认项。

## 2. 现状审计

### 2.1 审计基线

| 仓库 | 只读基线 commit | 用途 |
| --- | --- | --- |
| desktop | `ad95d5091c9ed689fa72b5e5c849df65f5a679ce` | 当前上游桌面版，远端初始仅有 master |
| mobile | `702b3f956d4f8468d30e004b820921ee8e96be72` | 设计规范、主题、登录门、账号与同步契约 |
| server | `794fcc4cfee03cdc12c56dad0272f116e3f0d8a9` | Lux HTTP/WebSocket、会话和设备契约 |

设计参考：mobile 的 `AGENTS.md`、`docs/design-system.md`、`docs/design-system-magazine.md`、`docs/interaction-spec.md`、`src/theme/luxTokens.ts`、`src/theme/magazineRoles.ts`、`src/theme/magazineType.ts`。历史稿与实现不一致时核对当前规范；手机播放页 v0.5.3 锁定规则不随桌面任务改动。

### 2.2 桌面结构与功能保留表

| 现有区域 | 主要文件 | 保留的能力 |
| --- | --- | --- |
| 应用外壳 | `src/renderer/App.vue`、`components/layout/Aside/*`、`Toolbar/*`、`View.vue` | 六个导航入口、窗口控制、搜索框、缩放/全屏与左右控制按钮设置 |
| 搜索 | `src/renderer/views/Search/*` | 歌曲/歌单搜索、音源、热搜、历史、建议、分页、多选、播放/添加/下载 |
| 在线歌单与榜单 | `views/songList/*`、`views/Leaderboard/*` | 分类/标签/排序/来源、详情、导入与播放 |
| 本地歌单 | `views/List/*`、`store/list/*` | 新建/重命名/排序/去重/拖动、列表内搜索、多选、备份/导入/分享及原有菜单 |
| 下载 | `views/Download/*`、`store/download/*` | 下载中/已完成、进度、失败重试、暂停/继续、批量操作与播放 |
| 播放器 | `components/layout/PlayBar/*`、`PlayDetail/*`、`core/useApp/usePlayer/*` | 队列、封面、歌词、评论、喜欢、音量、进度、倍速、音效、播放模式与定时停止 |
| 独立窗口 | `src/renderer-lyric/*`、`src/main/modules/userApi/renderer/*`（构建配置 `build-config/renderer-scripts/*`） | 桌面歌词与自定义源运行能力 |
| 设置 | `views/Setting/components/*` | 基本/主题/播放/列表/搜索/下载/快捷键/歌词/网络/同步/备份/OpenAPI/关于等原有设置 |
| 同步 | `src/main/modules/sync/*`、`rendererEvent/sync.ts`、`core/useApp/useSync.ts` | LX 连接码认证、客户端/本机服务端、列表与不喜欢列表同步、首轮冲突选择 |

现有 webpack 目标为 `electron-renderer`，renderer 有 Node/Electron IPC 依赖，不能把静态 HTML 或未接通 IPC 的 Vite 页面当作应用截图。列表采用固定行高虚拟滚动；修改密度时必须同步 `OnlineList/useList.ts`、`views/List/MusicList/useList.js`、`views/Download/useList.js` 等行高计算，保留字体缩放。

### 2.3 CI 与构建

现有 `.github/workflows/build-test.yml` 已对 PR → dev 执行安装、lint 和构建，但没有显式类型检查、单元测试、截图及证据 artifact。`package.json` 也没有 typecheck/test 命令。类型项目分为 main、renderer、renderer-lyric、common、lang；根配置不能独立覆盖别名与 Vue 模板。renderer-scripts 当前为 JS，以 lint 和专属构建验证，不宣称完成其 TS 检查。

`release.yml` 由 push master 触发发布，`beta-pack.yml` 由 push beta 触发打包，`publish-version-info.yml` 由 Release published 触发上游 dispatch。本任务不触发这些入口。CI 只使用编译与测试命令，不执行 `publish:*` 或 electron-builder 发布。

安装前审阅生命周期脚本。根 postinstall 会复制固定 sqlite 二进制，须核对 Electron ABI；首轮安全安装采用 `npm ci --ignore-scripts`，Electron 下载及 native 准备须在审阅后显式执行。不得把手动联网的 musicSdk `api-test.js` 当离线单元测试。

**初始验证状态：**只完成静态审计；依赖安装、lint、类型检查、测试、构建、截图与远端 CI 均未执行，均不得记为通过。

## 3. 目标架构

### 3.1 设计与桌面布局

新增桌面语义主题层，由 paper、ink、muted、rule、hairline、accent 等角色桥接现有 `--color-*`，减少对播放和设置逻辑的侵入。黄绿 `lime` 色值以 mobile token 为基准，不重新推导；另外提供 `mist_blue`、`sakura`、`lavender`、`oat_milk`、`ink_night`。保留原主题选择、编辑、导入和背景能力，明确迁移与回退行为。

采用纸色背景、墨色标题、粗黑分组线和细行分隔，减少圆角卡片与投影。强调色用于当前/已选/播放语义。桌面保留带文字的侧栏、顶部工具区、底部播放器；窄窗口适配，不直接复制手机布局。优先在 1024×700、1280×800、1440×900 验证，同时测试应用实际最小窗口与字体缩放。

列表行建议 44–52 逻辑像素，普通图标点击区 32–36，主操作约 40；最终以实际密度及可用性验证，不给所有按钮统一强制高度。窗口控制独立处理。新增交互包含键盘焦点、可访问标签、加载/空/错误状态和 reduced-motion 支持；文案覆盖现有语言入口，至少简中、繁中、英文完整。

### 3.2 同步边界

新增独立 `provider: local | lx | lux`，与已有 `sync.mode: server | client` 分离。LX provider 继续使用原协议实现，不破坏已有配对配置和本机服务端。Lux provider 使用服务端账号 HTTP 认证，再复用兼容的列表/不喜欢列表 WebSocket 同步模块。

凭据、refresh token、设备标识与敏感请求留在 main；renderer 通过有类型的 IPC 获取脱敏状态。会话持久化使用合适的 Electron 安全存储策略，明确安全存储不可用时的行为。禁止在日志、截图、PR 和 renderer 状态中暴露密码、连接码或 token。

Lux 认证优先采用绑定会话的 accessToken，校验服务端实际返回类型，不直接照抄 mobile 类型。refresh 必须串行合并，同一请求最多在 401 后刷新重试一次；网络错误、429 和 5xx 不得清空有效会话。切换 provider/账号时关闭旧连接、取消请求和重试定时器，防止旧事件写入新会话。

本地可用性不受登录门阻挡，首次引导明确提供三种选择。三种模式均展示状态、错误和重试入口。跨账号数据策略必须对齐 mobile 的数据空间与切换语义，先验证隔离、备份和恢复，再启用写入；不得静默上传现有资料或清空歌单。

实现时核对 `server/src/server/api/{auth,sync,me,authGuard,errors}.ts` 的真实契约：`/api/server-info`、`/api/auth/login`、`/api/auth/refresh`、`/api/auth/me`、`/api/auth/logout`、`/api/sync/key`，以及账号资料与会话列表/撤销接口。需要注册时沿用邀请机制，不开放无邀请注册。URL 保留部署子路径，Bearer 绑定保存的服务器，不能发送给新输入的地址。同步密钥以服务器、provider、账号隔离。

本地/LX 使用原本地数据空间，Lux 按服务器和 user.id 隔离；切换事务依次冻结写入和播放、保存当前状态、暂停下载、断开连接/定时器、准备目标身份和空间，再发布新状态。失败不发布半完成身份；成功不自动恢复播放/下载。首轮同步保留用户冲突选择，不静默记住破坏性覆盖策略；临时播放列表不参与同步。服务端未协商支持的扩展不能宣称已实现。

## 4. 检查点与可验证完成标准

每行是独立 PR，严格按顺序从最新 origin/dev 开分支；前一个 PR 完成 squash 合并并核对远端后再开下一个。若审计要求拆分，先更新本计划，保持每个完成标准可验证。

| 检查点 / 分支 | 交付物 | 必须具备的验收证据 |
| --- | --- | --- |
| [ ] M0 `codex/desktop-m0` | 建立远端 dev；提交本计划；安全 PR CI；显式 lint/typecheck/test/build 命令及实际应用截图工具 | dev 从上述 desktop 基线建立；PR base=dev；main/renderer/lyric/common/lang 与 Vue SFC 的类型检查真实运行；离线行为测试真实运行；renderer 构建成功；基线真实应用截图；CI artifact 和绿灯；squash 合并 SHA |
| [ ] M1 `codex/desktop-m1` | 六套语义主题、默认黄绿、字体/间距/线/焦点 token；兼容原主题入口 | 六主题角色/默认色值回归测试；主题切换与重启保持；原自定义主题可选；六主题截图，至少黄绿/暖米/墨夜可读性和焦点自查；完整检查及 PR 合并证据 |
| [ ] M2 `codex/desktop-m2` | Lux 品牌外壳、桌面侧栏与导航、工具栏、底部播放条 | 六导航逐一可达；前进/返回/详情状态保持；原窗口按钮与拖动区域有效；窄/中/宽三尺寸截图；播放条控制真实状态；完整检查及 PR 合并证据 |
| [ ] M3a `codex/desktop-m3a` | 搜索、在线歌单/详情、排行榜杂志风 | 歌曲/歌单切换、来源、建议/历史、分页、空/失败/重试、详情、播放/添加/下载入口回归；虚拟行高/滚动定位一致；相应页面与多选截图；完整检查及 PR 合并证据 |
| [ ] M3b `codex/desktop-m3b` | 我的列表与下载界面 | 歌单管理、拖动排序、去重、导入/备份、列表内搜索与批量菜单保持；下载状态与重试动作验证；列表/菜单/多选/下载截图；完整检查及 PR 合并证据 |
| [ ] M3c `codex/desktop-m3c` | 播放详情、队列、歌词/评论及共用弹层 | 用本地音频验证播放/暂停/seek/队列/音量/模式/倍速，原音效与定时入口保留；桌面歌词编译与可启动验证；详情/队列/歌词/评论/弹层截图；完整检查及 PR 合并证据 |
| [ ] M3d `codex/desktop-m3d` | 设置各分组、主题与自定义源界面、关于信息 | 对照功能保留表逐项确认入口；自定义源导入/选择、主题编辑、快捷键、备份、OpenAPI、网络等原控件不丢失；设置各区和关键弹层截图；完整检查及 PR 合并证据 |
| [ ] M4a `codex/desktop-m4a` | main 侧 Lux API、会话/设备管理、安全持久化及脱敏 IPC | 用契约 fixture 覆盖实际账号 API、登录/恢复/退出、refresh 合并、过期/撤销/401/429/5xx/离线；敏感值不进日志/renderer；账号区脱敏截图；完整检查及 PR 合并证据 |
| [ ] M4b `codex/desktop-m4b` | provider 生命周期、Lux socket 认证、LX 兼容与数据空间隔离 | 本地 mock Lux server + 两客户端同步真实歌单操作；LX 连接码客户端/本机服务端兼容；首轮冲突、重连、切换、跨账号隔离/恢复、无网络本地使用测试；三模式状态截图；完整检查及 PR 合并证据 |
| [ ] M4c `codex/desktop-m4c` | 首次同步选择/登录门、设置内三模式切换、账号与错误交互 | local→LX→Lux→local 和退出/重启恢复端到端测试；保留所有原同步控件；不使用 June 生产账号也可复现的本地契约集成；登录/错误/切换确认/三模式截图；完整检查及 PR 合并证据 |
| [ ] M5 `codex/desktop-m5` | 清理、设计/交互/架构/测试与使用文档、最终功能保留矩阵 | 消除未使用适配代码；全套 lint/typecheck/test 通过；main/renderer/lyric/scripts 全部构建通过；全页面与主题/尺寸矩阵证据；每项 PLAN 标准能链接到 PR/CI/artifact/截图；最终 squash 合并到 dev；真机限制明确 |

M0 类型或构建基线失败必须修复或明确拆分后修复，不能通过 `continue-on-error`、空测试、无条件成功、任意压低检查范围或批量 `@ts-ignore` 伪造通过。主题等低风险样式不新增镜像实现的测试；测试集中验证主题不变式、虚拟列表尺寸、同步状态机、凭据处理和用户行为。

类型检查显式覆盖 `src/common/**/*.ts` 中未被其他入口引用的源码。每个检查点的 lint、类型检查、测试、构建均要求实际退出码为 0；测试数量和失败数必须记录，不能把“已运行但失败”当完成。

无需账号的测试使用本地 fixture/mock 服务，不访问生产账号，不把云端不能验证的真机体验列为已经通过。如集成必须依赖 June 账号、付费或产品决策，先记录精确缺口和建议，停止并等待。

## 5. 每个 PR 的执行和取证流程

1. 读取最新远端状态并确认上个检查点已合并。`git fetch origin dev`，从最新 `origin/dev` 创建表内分支，不复用过期基线。
2. 实现本检查点，按变更同步文档；先在本地运行 lint、类型检查、离线测试、renderer 构建。有 main/lyric/scripts 变更时补相应构建，M5 覆盖所有目标。
3. 使用真实构建的 Electron 应用拍图；允许确定性的 IPC/音乐/网络 fixture，但必须标注 fixture 与未验证的原生边界。不能用独立静态样张冒充运行中的应用。截图保存在 `docs/screenshots/` 或有保留期限说明的 PR/CI artifact 中，关键最终截图入库。
4. 提交并推送 checkpoint 分支，通过 `gh pr create --base dev` 创建中文 PR。描述包含具体问题、实现结果、入口新增/移动/隐藏/删除/样式变化、验证结果和真机限制；不把版本号或发布混入。
5. 执行 `gh pr checks <号> --watch`。检查最终 head SHA 下完整工作流的全部必需任务。无任务、旧 SHA 绿灯、跳过/取消/中性结论均不是验收绿灯；失败修复后重跑。
6. 用 `gh pr view` 确认 base=dev、最新 head SHA、CI 结论和 mergeable。CI 全部成功且可合并后，`gh pr merge <号> --squash --subject "<中文标题> (#<号>)"`。不使用 `--delete-branch` 或管理员绕过选项。
7. 核对 PR merge commit 和远端 dev，更新本地 `_goal/PROGRESS.md`：PR URL、head SHA、CI run URL/attempt、合并 SHA、检查命令/退出码、截图与日志路径、风险与需要 June 真机确认的点，再开始下一个检查点。

截图旁的证据清单记录 build/commit SHA、UTC 时间、OS/Node/Electron 版本、窗口尺寸、路由/主题、fixture 模式、生成命令和 SHA256。CI artifact 包含测试/构建日志与截图清单；本地 `_goal/` 持久留存详细记录，但通过 `.git/info/exclude` 排除，不提交。

## 6. 当前进度与阻碍

- 计划和静态审计完成，所有实现检查点仍未验收。
- 本环境原 `.git` 为只读，已建立 `/tmp/lux-desktop-goal-git` 独立 Git 元数据并指向原工作区；原 master ref 未改动。恢复时显式使用该 GIT_DIR，或建立可写独立 checkout，不能误在原 master 上提交。
- 已在独立元数据创建本地 dev 与 `codex/desktop-m0`。尝试推送 dev 被 GitHub 返回 403；REST 创建同一基线 ref 也返回 `Resource not accessible by personal access token`。远端 dev 尚未建立，尚无 PR、CI 或合并。
- 需要 June 为当前环境更新授权，包含此仓库 Contents、Pull requests、Workflows 写权限及 Actions 读权限；账号角色显示 admin/push 不等于当前 token 有相应 scope。凭据只通过环境配置更新，不进入聊天或仓库。
- 授权恢复后首先重新核对远端 refs（可能由 June 创建过 dev），从原基线安全建立/复用 dev，然后继续 M0，不覆盖已有分支。

## 7. 结束判定

只有所有检查点都已合入 dev、每一完成标准均在 `_goal/PROGRESS.md` 有实际证据、远端状态核对成功，才将 `_goal/STATUS` 写为单行 `DONE`。进行中为 `RUNNING`；只有必须 June 处理的凭据、付费、master/Release/功能决策等才写 `BLOCKED: <具体原因>` 并停。

目前不能写 DONE，也不能将尚未执行的测试、构建或截图标记为通过。
