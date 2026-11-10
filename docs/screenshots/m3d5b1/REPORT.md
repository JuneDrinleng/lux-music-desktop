# desktop-m3d5b1 本地交付记录（执行中）

目标：PLAN 4.2 M3d5b 关于信息排印；仅本组件局部样式、独占 helper、window 尾部调用与本目录证据。base dev = `63bfbdd8cb9b8926e5eba869c8784ca355561d12`；主号 GET user = JuneDrinleng。

已核对：原 script SHA256 `6a83e2046a1844cd974ad32ecf70d0644e7503dc467a5d3654450827ebf1c48c` 逐字相同；移除新增样式类后 template 逐字相同。五个 openUrl 参数与原 handleShowPact 保留。PactModal、openUrl、协议正文、设置目录、公共容器与 runner/CI 未改。链接仅测可达性/中心命中，绝不点击。

实际已发生的问题：

- workspace.sh 对已存在 worktree 的幂等复核返回 2；它先尝试写共享根的锁，当前沙箱只读。只读 git worktree list 确认指定目录、分支与基线正确；没有重置工作树。
- 首次 npm ci --ignore-scripts 返回 226：默认 /home/box/.npm 缓存只读。改用 --cache /tmp/m3d5b1-npm-cache 后返回 0。根 postinstall 和依赖生命周期均禁用，未运行 pack/publish。
- 独立 helper 首次局部 eslint 发现四处 object-property-newline，已修正并重新局部 lint 通过。
- git add --dry-run 返回 128：共享 _base .git/worktrees 的 index.lock 只读。禁止改共享 _base 或旧 goal Git 元数据；后续使用本任务新建的标准本地 Git 目录，工作文件仍在原任务目录。

npm run evidence:prepare 返回 0，Electron 42.11.6 与打包 SQLite binding 实际 create/insert/select/close 通过。npm ci 报告既有依赖审计 37 项（1 low / 17 moderate / 17 high / 2 critical），未扩大范围升级依赖。

七门检查、七个完整取证模式、固定六场景/24图、PNG 目检、最终 head CI 和 PR 链接：待实际执行后填写，不表示通过。完整运行日志保留在 artifacts/，最终 CI 原 artifact 保留 90 天。

未执行边界：Windows/macOS 真机、原生字体、真实外链目标及外部浏览器。未签署/退出协议、未触发更新、未提交 Issue、未联系任何人。

预验收：七门统一检查均退出 0，单测 160 通过 / 0 失败 / 0 跳过。窗口五次失败后第六次退出 0（原3图+关于24图；六组原协议开关与实际 Tab、七项独立恢复均通过）。失败明细见 failures.json：初次分类误采搜索页 Tab；SVG 空文本范围；小数裁剪边界；多行内联链接中心落空；nearest 滚动后链接盒底部 0.25px 未完整进入视口。分别修正新 helper 和局部排印，原检查/协议未改；固定实现提交后将完整复跑。
