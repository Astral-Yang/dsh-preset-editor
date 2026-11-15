# Changelog

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
