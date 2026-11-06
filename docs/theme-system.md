# 桌面主题系统

M1 把 mobile 杂志设计规范中的六套颜色接入现有桌面主题系统。主题选择、编辑、自动亮暗、导入和背景仍走 LX 原入口；页面布局改版由后续检查点完成。

## 主题与默认值

| ID | 名称 | 模式 | 纸面 paper | 强调 accent | 强调文字 accentInk |
| --- | --- | --- | --- | --- | --- |
| `lime` | 黄绿 | light，默认 | `#eef0fb` | `#c8e600` | `#58651b` |
| `mist_blue` | 雾蓝 | light | `#eef3f9` | `#2563eb` | `#173473` |
| `sakura` | 樱粉 | light | `#faf0f3` | `#db2777` | `#651a3b` |
| `lavender` | 薰衣草紫 | light | `#f3f0fb` | `#7c5cbf` | `#3d2f5c` |
| `oat_milk` | 暖米 | light | `#f6f1ea` | `#a65d28` | `#50321a` |
| `ink_night` | 墨夜 | dark | `#12141c` | `#c8e600` | `#d1e932` |

新 profile 与缺少主题字段的设置以 `lime` 为默认亮色、`ink_night` 为默认暗色。每年一、二月不再把默认主题改成 `happy_new_year`；该主题仍在原列表内，桌面歌词既有的独立季节颜色行为保留。

已有合法 ID 不迁成新默认，包括原 15 套内置主题、自定义 ID 和 `auto` 的原亮暗子主题。旧数字主题的历史迁移保持原映射，例如 0→`green`、13→`black`。本次未提高应用版本，也未依赖版本号强制重写用户偏好。

固定主题不随系统亮暗变化。`auto` 按系统模式选择保存的 `theme.lightId` / `theme.darkId`；子主题失效时按当前模式回退到 `lime` / `ink_night`。固定 ID 失效时回退到 `lime`。解析结果中的 `theme.id` 表示保存的选择，`theme.resolvedId` 表示实际应用的主题，二者在 `auto` 或回退时可以不同。

## 颜色来源与兼容

[magazine.js](../src/common/theme/magazine.js) 是六套精确颜色与运行时解析的共同来源；`main/getTheme` 和 renderer 的预览、应用都调用 `resolveThemeColors`。修改主题生成配置后执行 `npm run build:theme`，生成 [index.json](../src/common/theme/index.json)。列表先放六套新主题，再放原 15 套，共 21 套，原背景主题的数据不删除。

M1 提供 22 个核心语义角色，每个主题完整输出，CSS 名使用短横线，例如 `paperRaised`→`--lux-paper-raised`：

- 纸面：`paper`、`paperRaised`。
- 文字：`display`、`ink`、`list`、`muted`、`eyebrow`、`option`、`faint`、`quiet`。
- 线条：`rule`、`hairline`。
- 强调与控件：`accent`、`accentSoft`、`onAccent`、`accentInk`、`onInk`。
- 状态与占位：`danger`、`like`、`placeholder`、`skeleton`、`scrim`。

六套内置主题的这些值直接使用规范表，黄绿默认值不从主色推导。`--lux-color-scheme` 同时声明 light/dark。色彩测试的独立规范数据在 [magazine-palettes.json](../tests/fixtures/magazine-palettes.json)；mobile 规范中的图标衬底色未在 M1 提供独立角色，后续有实际使用时再接入同一数据源。

旧组件仍使用 `--color-*`。六套新内置主题在运行时为正文、标签、导航、按钮和选中背景提供明确覆盖：强调填充使用 accent，强调文字使用 accentInk，避免把黄绿直接用于浅底小字。后续页面应优先使用语义角色。角色映射和数值对比度通过不能代替实际页面中所有文字、透明叠层、禁用态和图标的视觉审查。

自定义或原主题的旧色值保持有效。其语义角色每次重新建立为当前可编辑 `--color-*` 的 CSS 变量别名，例如 paper 跟随主背景、ink 跟随字体、accent 跟随主色。这样从墨夜切回旧浅色主题时，不会沿用上一套固定的暗色角色。亮暗标识决定通用 danger、like、scrim 的后备值。

固定的内置角色和覆盖只进入运行时结果，不写回原 `themeColors` / `extInfo`。从黄绿等新主题复制为自定义主题后，编辑器修改主色、文字、导航与背景会继续生效；即使自定义记录保留了内置 ID，也不会套用固定色表。解析结果不改变存储对象。自定义主色可以是任意颜色；其 `onAccent` 的兼容别名不保证所有用户配色都满足对比度，应按实际样本检查。

## 排印、间距与焦点

[magazine.less](../src/renderer/assets/styles/magazine.less) 提供桌面密度的字号、字重、间距、线宽、点击区和圆角 token。字号与间距使用 rem，随已有 `common.fontSize` 根字号缩放。页面边距为 1.75rem，窗口不超过 1100px 时为 1.375rem；主线 2px，细线 1px，强调标记 3px。封面、菜单和弹层分别提供 6px、4px、8px 圆角 token。这里只建立共用量值，不宣称所有旧页面已经完成迁移或统一行高。

字体 token 的正文候选是系统字体、Noto Sans CJK SC、Microsoft YaHei、PingFang SC；展示候选增加 Inter、Roboto。没有从网络下载这些字体，实际可用字体由系统决定。已有平台回退规则和用户 `common.font` 设置继续工作；未把全应用强制换成一套字体。新增页面使用 token 时仍须尊重用户字体偏好，按实际渲染确认中文与数字宽度。

键盘可聚焦的按钮、链接、输入框和带 tabindex 的元素在 `:focus-visible` 下使用 2px 墨色 outline、3px offset，不只依赖浅色 accent。CSS 同时尊重 `prefers-reduced-motion`，缩短动画与过渡。焦点是否被容器裁切、点击区域是否合适以及放大后的布局，仍需真实 Electron 交互检查。

## 验证范围

`node --test tests/unit/magazine-theme.test.cjs` 直接测试生产主题生成器、实际生成的 registry、设置迁移/合并以及 main/renderer 解析。覆盖全部六套的 22 个精确角色、默认与旧选择保留、十二个月的新 profile、固定/自动/失效回退、自定义颜色与背景、解析无副作用和两端一致性。

测试还计算六套内置主题的八种语义色对：纸面正文/标题/列表、抬升纸面正文、纸面强调文字、柔和强调底文字、强调底文字和墨底按钮文字。每对要求至少 4.5:1。该要求不扩展到 muted/faint 等辅助色、不证明所有旧控件自动合格，也不证明任意自定义配色可读。

真实窗口证据应使用生产 `dist/main.js`、IPC 和临时 profile，记录主题选择、实际解析 ID、窗口尺寸、重启保持与键盘焦点。测试数据和 Linux Xvfb 截图不能证明 Windows/macOS 原生窗口、字体安装差异、音频、托盘、桌面歌词及真实显示器观感。当前检查点的实际命令、CI、截图与已知边界以 `_goal/PROGRESS.md` 和截图 manifest 为准；本文件不把尚未执行的环境检查记成通过。
