# 桌面验证与证据

## 安全安装与本地验证

需要 Node.js 22+。先审阅依赖与生命周期，再执行：

```sh
npm ci --ignore-scripts
npm run verify
npm run evidence:prepare
npm run evidence
```

`verify` 逐项执行 lint、typecheck、test，以及 main、renderer、renderer-lyric、renderer-scripts 四个生产构建。每项日志和真实退出码保存在 `artifacts/verification/`；任一失败，整个命令失败。没有测试文件时测试入口直接失败。验证不会调用打包发布脚本。

`evidence:prepare` 仅显式运行已审阅的锁定 Electron 安装器；之后在该 Electron 的 Node 环境真实创建、写入、查询和关闭 SQLite 内存数据库，并核对 Electron 版本。它不运行仓库旧 postinstall，不把固定旧二进制覆盖到新依赖；探针失败必须处理，不能用安装成功代替运行成功。运行记录在 `artifacts/runtime/`。

Linux 没有 DISPLAY 时，截图入口自动使用已安装的 `xvfb-run`；CI 显式使用 xvfb。必要系统依赖包括 Electron 运行库、Xvfb 和中文字体。Windows/macOS 的本机窗口、音频、托盘和桌面歌词体验仍需真机确认。

此工作环境原 `.git` 只读，Git 元数据另存于 `/tmp/lux-desktop-goal-git`。在该环境执行会读写 Git 的命令时，应显式设置 `GIT_DIR=/tmp/lux-desktop-goal-git`；普通 clone 与 CI 不需要这个设置。

## 类型检查范围

`scripts/typecheck.cjs` 对 main、renderer、renderer-lyric、common、lang 分别执行 `tsc` 或 `vue-tsc`。五个原 TypeScript 项目继承 strict，不通过放宽 TS 规则或缩小 include 解决基线问题。common 显式覆盖全部源码，包含不再被当前入口引用的历史兼容文件。

普通 TypeScript 的 `*.vue` shim 不能证明模板正确。renderer 与歌词窗口由 `vue-tsc` 检查，Pug 模板沿用专门语言插件；旧 JS SFC 另有增量 JavaScript 语义检查项目，检查全部 SFC 和传递依赖。动态 JS 与原 TypeScript 的规则边界在各自配置中显式记录，不宣称所有旧 JS 已经迁为严格 TS。

webpack 的 ts-loader 仅处理实际打包的模块和 ambient 声明，防止把普通 JS SFC 的 include 根错误地解释为 TS；全项目检查独立运行，不能因为某文件暂未打包就漏过。

## 离线行为测试

测试直接加载仓库的生产实现，仅替换未被测试目标使用的 I/O 边界；若误调用这些边界立即失败。覆盖主题、列表清洗/排序/搜索/去重、音乐数据迁移、队列排除、同步 URL/压缩/加密往返等。HTTP 请求测试仅绑定 127.0.0.1，在真实 Undici 7 与 Windows 7 兼容使用的 Undici 5 各跑一遍重定向/查询/JSON/字节响应行为。

这些测试不证明第三方音源可用，不把加密往返扩大为安全审计，也不把随机排序元素守恒扩大为分布证明。详细边界见 `tests/README.md`。

同步 action 的单元测试替换了 snapshot manager，只证明 RPC 等待管理接口完成并传播其拒绝，不证明磁盘已经持久化。原管理器仍使用节流写盘；真实文件写入、断电/失败恢复和同步协议的集成证据须在 M4 单独验证。

## 真实应用截图

入口使用真正的 `dist/main.js`、数据库 worker、IPC 和 renderer；使用临时 userData，阻止外部网络及系统 URL 关联变更。首次协议/更新提示、下载入口可见性等受明确测试设置控制；空数据基线不代表在线搜索、真实下载或实际账号同步已验证。

默认截取六个实际导航页在 1280×800 和 1024×700 两种窗口尺寸的界面，并通过 DOM/路由、页面尺寸和运行异常检查后保存。每张 PNG 有 SHA256，manifest 同时记录 UTC、OS/Node/Electron/Chrome 版本、源码与完整构建文件哈希、fixture 设置和阻断请求计数。入口、边界及环境参数见 `scripts/evidence/README.md`。

本地基线图保存在 `docs/screenshots/m0/`；CI 用 `LUX_EVIDENCE_DIR=artifacts/screenshots` 为当前最终提交重新生成。独立静态设计稿不能替代这些运行截图。

## PR 与 CI

`Desktop verification` 仅监听 PR → dev 和 push dev，以只读仓库权限验证。CI 安装不执行隐式生命周期；全套检查、运行时准备、截图任一步失败都不能合并。日志、构建产物、截图以 artifact 保存 90 天，关键截图另存仓库。

PR CI 默认 checkout GitHub 的测试合并提交，以验证与 dev 的集成。报告同时保留实际 checkout commit 和 PR head/base SHA；不能把测试合并 SHA 写成原始 PR head。PR 更新后必须等待新 head 的完整工作流成功，旧提交的绿灯、零任务或被取消的运行都不能验收。

每个检查点的 PR URL、最终 head、CI URL/attempt、squash 合并 SHA、命令退出码、截图路径和真机限制写入本地 `_goal/PROGRESS.md`。只有全部计划标准都有证据且合入 dev，STATUS 才能写 DONE。
