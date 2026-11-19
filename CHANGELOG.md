# Changelog

## Unreleased

- 新增每个原生 preset 的「组成预览」：展示 assembly 的 prompt sections、静态 runtime contexts、variables、tool declarations，以及 overlay 后的 visible / hidden 工具。
- 新增 `GET /api/preset-editor/native/preview`，默认返回截断预览；`part=prompt|section|context|tool` 按需返回全文或完整 schema，单条上限 200,000 字符。
- 预览明确标注为预设级静态快照：不伪造 cwd / 沙箱 / 审批 / 会话历史；`{{model}}` 等会话变量会列为 `unresolvedVariables`。
- 工具预览区分 `visible` / `hidden`，不把工具过滤与 prompt 过滤混为权限边界；真实 profile 已验证 `standard` 的 `dsh-expression:companion` 与工具 overlay。
- 组成预览改为单列 manifest：顺序编号、低频 separator、内联展开；移除嵌套滚动容器，全文/schema 只让 tab body 一个滚动区域承载。
- 修复移动端整体布局：将 981–1380px 的双列规则限定在该区间，追加 ≤980px 单列堆叠；tab bar 换行，筛选/提示词列表取消内部滚动，窄屏列表压缩并去掉重复的新建入口。
- 修复移动端无法滚动：DSH 的 main panel 不提供滚动，改为在 ≤980px 时让 `.dspm_page` 自身 `height:100% + overflow-y:auto` 成为唯一纵向滚动容器，列表/编辑器/预览共用该滚动。
- 优化组成预览的工具过滤描述：不再显示 `overlay: deny（…）`，改为「工具过滤 · 已排除 2 个工具」并列出工具名；allow/all/未启用分别使用可读文案，名称过多时折叠为「另有 N 个」。
- 新增逐原生 preset 的**系统提示词段过滤**：可保留/排除 `system-prompt/assemble` 最终 sections，覆盖插件在全局 prompt scope 注册、但 preset 只过滤了工具的情况（例如关闭 `send_meme` 后仍注入的 `dsh-expression:companion` 斗图规则）。
- 提示词段目录通过 global + 每个 preset 的 `systemPrompt.assemble({ scope })` 汇总，包含 assembly listener 动态追加的 section；`harness:identity` 与 persona prefix/suffix 始终受保护。
- 运行时监听器使用 `prepend + global`，在 `next()` 返回后过滤最终 assembly；避免普通 scope 监听器被全局 listener 的 `next()` 后追加内容绕过。
- Overlay 数据新增 `prompts`，旧 `native.json` 自动补默认值；只更新 `tools` 的旧客户端不会清空已有 `prompts`。
- UI 新增「提示词段」tab，支持 all/allow/deny、搜索、来源筛选、受保护标记，以及 `complete` 人格的不生效提示。
- 修复备份记录弹窗中“自动备份：开启 · {n} 份（保留 {keep}）”直接显示占位符的问题，改用 `fmt` 插值。

## 0.2.0 — 2026-11-15

- 新建 preset ID 限制为小写字母、数字和 `-`，与 DSH-IM 5.x 的 Agent Preset 校验一致；已有 legacy ID（含大写/其他字符）仍可编辑，不会被强制迁移。
- 修复新 preset ID 与 Loader row id 碰撞检查中的初始化顺序问题。
- 备份记录弹窗新增“自动备份”开关；关闭后停止生成新备份，已有备份保留。profile 配置 `backup: false` 仍可硬关闭。
- 标题蓝色竖线改为跟随标题行高（34/26/31px），并移除标题默认 `margin`，不再超出标题基线。
- 输入框焦点改为原边框变色，不再叠加 2–3px outline；搜索框由外层容器统一高亮，修复高亮尺寸不一致。
- 新建 preset ID 的可见文案只保留规则，不再显示内部兼容性说明。
- 备份列表按一次操作合并 patch/native 为一条快照，以系统时间命名并只计 1 份；优先按 generation 配对，避免相邻操作错配。保留份数可在备份弹窗调整，调整后立即按快照裁剪旧备份。
- 内部命名统一为 `preset-editor`：Loader row id、API 路径、托管块 marker、客户端 namespace/panel id、日志前缀和诊断探针；数据/备份目录同步为 `$DSH_HOME/preset-editor`，不提供旧数据迁移。
- 测试：70 / 70 通过。

## 0.1.1 — 2026-11-15

- 修复 Windows 平台测试兼容性：0600 文件权限断言仅在 POSIX 执行；原子写失败测试改用“目标路径为目录”的可移植失败方式，不再依赖 chmod。
- 发布工作流改为在推送 `v*` tag 时触发，支持 `workflow_dispatch`；继续使用 npm Trusted Publishing + provenance。
- CI 在测试前安装 npm 依赖（`npm install`），确保发布工作流在干净 checkout 中可运行。
- 测试：65 / 65 通过。

## 0.1.0 — 2026-11-15

首个公开版本，包名 `dsh-preset-editor`。

- 在 DSH 左侧快捷列表提供「预设管理」独立页面，直接读取原生 `agentPresets` roster。
- 支持编辑内置 preset 的人格与插件组合，新增原生 preset（`- insert:`），恢复内置、删除自定义。
- 原生组合以 profile `cordis.patch.yml` 托管块承载，依赖 DSH HMR 重组；无 HMR 或驻留 Agent 场景返回 `restart-required`。
- 提供逐原生预设的工具过滤叠加层：`tools.guard` 执行拒绝 + `tools.restrict` 可见性收窄，支持 allow / deny / all。
- 人格编辑支持 `prefix`、`complete`、`includeRuntimeContext`，并在页面内解释后两项语义。
- 插件组合提供结构化行编辑与完整 entry-list YAML 高级编辑；保存来源在结构化行 / YAML 之间显式切换。
- 自动备份 profile patch 与 `native.json`，页面显示备份记录（本地时区、B/KB/MB），支持一键回滚；回滚前自动备份当前版本，并修复 patch/state 一致性。
- 新增预设保持 `- insert:` 声明，修复 HMR 后误退化为 direct row 的问题；启动时自动修复 orphan 声明，列表显示“未加载”并允许修复。
- 三栏工作台 UI：预设脊柱 / 编辑器 / 状态轨；≤1380px 收起状态轨，过滤页只滚动工具列表，高级编辑只滚动 YAML。
- 预设 id 说明使用悬浮/点击问号气泡；气泡 fixed 定位并夹在视口内。
- 安全：owner-only HTTP + CSRF header，备份路径校验。
- 测试：65 / 65 通过。
