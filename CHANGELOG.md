# Changelog

## Unreleased

- 新建 preset ID 限制为小写字母、数字和 `-`，与 DSH-IM 5.x 的 Agent Preset 校验一致；已有 legacy ID（含大写/其他字符）仍可编辑，不会被强制迁移。
- 修复新 preset ID 与 Loader row id 碰撞检查中的初始化顺序问题。
- 备份记录弹窗新增“自动备份”开关；关闭后停止生成新备份，已有备份保留。profile 配置 `backup: false` 仍可硬关闭。
- 标题蓝色竖线改为跟随标题行高（34/26/31px），不再超出标题基线。
- 输入框焦点改为原边框变色，不再叠加 2–3px outline；搜索框由外层容器统一高亮，修复高亮尺寸不一致。
- 新建 preset ID 的可见文案只保留规则，不再显示内部兼容性说明。
- 测试：68 / 68 通过。

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
