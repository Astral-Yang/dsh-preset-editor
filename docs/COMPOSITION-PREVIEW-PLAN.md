# dsh-preset-editor 预设组成预览 — 推进计划

> 分支：沿用 `feat/prompt-section-filter`
> 目标版本：`0.4.0`（拟）
> 状态：已实现；真实 profile API/overlay 模拟已验证，Web UI 交互待验收
> 最后更新：2026-11-19
> 验证基线：DeepSeek Harness `0.2.2-rc.1`，Node `24.x`

## 1. 目标

为每个原生 preset 提供只读的「组成预览」，回答两个问题：

1. 这个 preset 最终让模型看到哪些能力（工具、插件组合、overlay 结果）？
2. 这个 preset 的 system prompt / 静态 runtime context 由哪些 section 组成？

本期只做 **A. 预设静态快照**，不做真实会话快照。

## 2. 非目标

- 不展示真实会话的消息历史、附件、工具结果；
- 不展示当前模型选择、上下文窗口剩余量、实际 token 计费；
- 不伪造 cwd / sandbox / approval 等 Agent 级 runtime context；
- 不改变现有 preset 编辑、工具过滤、提示词段过滤行为；
- 不提供编辑、导出或远程同步；预览是只读的。

## 3. 语义边界

`systemPrompt.assemble({ scope: presetScope })` 能给出：

- `sections`：已解析、未插值的 system prompt sections；
- `contexts`：已解析、未插值的 runtime contexts；
- `variables`：插值变量；
- `tools`：该 preset scope 下的 tool declarations。

没有 Agent 时，`working-directory:current`、`sandbox:policy` 等 context provider 会返回空文本。预览必须明确提示：

> 这是预设级静态快照，不包含真实会话的 cwd、沙箱、审批与历史消息。

工具侧：

- `assembly.tools` 是 preset scope 的可见声明；
- 工具 overlay 的 `guard` 对所有调用生效；
- `restrict` 只收窄可限制的 global/ancestor 工具，preset scope 自己注册的工具仍可能可见，但执行会被 guard 拒绝。

预览会分别标注 `visible`、`hidden-by-overlay`、`visible-but-guard-denied`，不把三者混成一个“最终工具数”。

## 4. 数据模型

`buildPresetPreview()` 返回：

```json
{
  "id": "standard",
  "name": "standard",
  "generatedAt": "...",
  "prompt": {
    "renderedPreview": "...",
    "chars": 12000,
    "truncated": true,
    "sections": [
      {
        "name": "harness:identity",
        "origin": "harness",
        "protected": true,
        "filtered": false,
        "chars": 800,
        "preview": "..."
      }
    ],
    "contexts": [
      { "name": "working-directory:current", "chars": 0, "preview": "" }
    ],
    "variables": {},
    "unresolvedVariables": ["model"],
    "warnings": []
  },
  "tools": {
    "overlay": { "mode": "deny", "allow": [], "deny": ["send_meme"] },
    "items": [
      {
        "name": "read",
        "origin": "builtin",
        "parameterCount": 2,
        "allowed": true,
        "visibility": "visible",
        "restrictable": true
      }
    ],
    "counts": { "total": 35, "visible": 34, "hidden": 1, "guardOnly": 0 }
  },
  "capabilities": {
    "pluginRows": 12,
    "enabledPluginRows": 12,
    "mcpTools": 0
  }
}
```

全文不默认返回。按需接口：

- `part=prompt`：完整渲染文本；
- `part=section&name=...`：单个 section 全文；
- `part=tool&name=...`：单个工具完整 schema。

## 5. API

新增：

```text
GET /api/preset-editor/native/preview?id=standard
GET /api/preset-editor/native/preview?id=standard&part=prompt
GET /api/preset-editor/native/preview?id=standard&part=section&name=harness:identity
GET /api/preset-editor/native/preview?id=standard&part=tool&name=read
```

- 只读，沿用 owner-only / Host / Origin / CSRF 规则（GET 不需要 action header）。
- `id` 必须存在于 native roster；不存在返回 404。
- 组装失败返回结构化错误，不缓存半成品。
- `part` 非法返回 400。
- 全文上限 200,000 字符；超限截断并返回 `truncated: true`。
- 每次请求 `acquireScope` 后必须在 `finally` dispose。

## 6. UI

新增独立「组成预览」tab：

- 顶部摘要：sections / contexts / visible tools / chars；
- system prompt：渲染预览 + 展开全文；
- sections：名称、来源、protected、filtered、字符数、预览、展开全文；
- runtime contexts：名称、字符数、预览；空列表显示“预设级快照无 Agent 运行时上下文”；
- tools：名称、来源、参数数量、overlay 决策、可见性；
- variables：折叠 JSON；
- 刷新按钮；切换 preset 自动重新加载。

不使用无限滚动；列表可滚动，全文在 `<pre>` 中展示。

## 6.1 UI 结构

- 单列 manifest，不采用多张同构卡片；
- sections / contexts 按 assembly 顺序编号；
- 完整 prompt / section / context / tool schema 用原生 `<details>` 内联展开；
- 除 tab body 外不设置嵌套滚动容器；
- filtered / protected / hidden 用 badge 与行级状态表达，不用装饰性底色堆叠。

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 静态快照被误认为真实请求 | 用户误判 cwd/审批/历史 | UI 固定提示“预设级静态快照”；runtime contexts 为空时明确说明 |
| 工具可见性语义复杂 | 预览与实际 schema 不完全一致 | 区分 visible / hidden / guard-only；标注 restrict 只作用于可限制工具 |
| 全文过大 | API/UI 卡顿 | 默认 240 字符 section preview、1600 字符 rendered preview；全文按需、上限 200k |
| 敏感文本暴露 | prompt/context 含路径或自定义内容 | 沿用 owner-only API；不主动导出；UI 提示仅本人可见 |
| `assemble` 有副作用或耗时 | 每次预览变慢 | 只按需构建、不后台轮询；单次预览一次 assemble；后续按需加 generation 缓存 |
| lease 泄漏 | scope 资源累积 | `finally` dispose |
| `complete` persona | 其他 section 被抑制 | 显示 persona complete 警告；预览反映 assembly 实际结果 |
| 工具声明为空 | 误报“没有能力” | 显示工具执行器/组装错误提示，不把空列表当成功结论 |

## 8. 里程碑

- M1：`lib/preview.js` + 单元测试；
- M2：HTTP preview 路由 + 测试；
- M3：UI「组成预览」tab；
- M4：真实 profile API/组装验证 + 证据；
- M5：README / CHANGELOG / ACCEPTANCE 更新，全量测试。

## 8.1 实施记录

- `lib/preview.js`：preview 数据模型、插值、overlay 模拟、full part；
- `lib/native-http.js`：`GET /native/preview`；
- `lib/client.js`：`TAB_PREVIEW` 与 `PreviewPane`；
- `test/preview.test.js`、HTTP preview 用例；
- 真实 profile 证据：`docs/evidence/composition-preview-e2e.json`。

## 9. 验收

- [x] 每个原生 preset 可打开组成预览；
- [x] sections / contexts / variables / tools 与 assembly 一致；
- [x] prompt/tool overlay 在预览中标注，不改变真实配置；
- [x] 默认返回截断预览，全文按需加载；
- [x] 不存在 preset / 无 systemPrompt / 组装失败返回结构化错误；
- [x] 真实 profile 中 `standard` 能看到 `dsh-expression:companion` 与真实工具列表；
- [ ] 浏览器内打开 tab、展开全文、查看 schema 的交互截图；
- [x] 全量测试通过，文档更新（83/83）。
