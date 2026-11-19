# dsh-preset-editor 系统提示词段过滤 — 推进计划

> 分支：`feat/prompt-section-filter`
> 目标版本：`0.3.0`（拟，具体以发布策略为准）
> 状态：已实现；独立 profile 的 API / catalog / runtime 已验证，Web UI 交互待验收
> 最后更新：2026-11-19
> 验证基线：DeepSeek Harness `0.2.2-rc.1`，Node `24.x`

---

## 1. 背景与问题

`dsh-preset-editor` 当前对 native Agent preset 提供两类编辑能力：

1. 编辑 preset 的插件组合与人格；
2. 在 preset 之上叠加逐工具过滤（`tools.guard` + `tools.restrict`）。

但工具过滤只能影响工具 schema 与工具调用，不能移除插件在**全局 system prompt scope** 注册的提示词段。例如：

- `dsh-free-search` 在全局注册 `free-search:engines` 段（order 500）；
- `dsh-plugin-link-resolver` 在全局注册 `link-resolver:guidance` 段（order 40）。

即使某个 preset 通过工具过滤隐藏了这些插件的工具，它们的静态提示词段仍会出现在该 preset 的 system prompt 中，造成：

- 模型看到无法调用的工具说明；
- prompt token 浪费；
- preset 的“能力边界”与模型实际看到的能力不一致。

`dsh-system-prompt` 的文档明确指出：**工具限制不会删除 section 注册**；工具提示词通常需要插件自己根据 `toolSet` 返回空文本，而任意静态 section 不会被自动改写。因此需要单独增加“系统提示词段过滤”能力。

---

## 2. 目标与非目标

### 2.1 目标

- 每个 native preset 可以独立配置 prompt section 过滤，语义与现有工具过滤一致：
  - `all`：不额外过滤；
  - `allow`：仅保留选中的 section；
  - `deny`：排除选中的 section。
- 过滤按 native preset id 绑定，只影响使用该 preset 的 Agent，不影响其他 preset 或全局 prompt。
- 提供与工具过滤一致的 UI：搜索、来源标记、勾选、保存/清除、旧数据兼容。
- 覆盖全局注册的 section 与 preset 自身注册的 section。
- 不修改 DSH 核心，不改变 preset 原生组合。

### 2.2 非目标

- 不实现 `runtime context`（`assembly.contexts`）的逐段过滤；该能力涉及工作目录、沙箱策略等必需上下文，另行设计。
- 不实现按插件包的精确 owner 过滤；DSH `PromptSection` 没有 owner 元数据。
- 不替代工具过滤：prompt 过滤只影响模型看到的提示词，不改变工具 schema 与执行权限。
- 不在本阶段引入跨 preset 的全局 prompt 策略。
- 不改变现有 preset 编辑、备份、导入/导出与工具过滤行为。

---

## 3. 已验证事实与待验证假设

### 3.1 已验证

- `@deepseek-ai/dsh-system-prompt` 提供：
  - `systemPrompt.section()`：注册 section；agent scope 的同名 section 可以 shadow global；
  - `system-prompt/assemble` waterfall：可对组装后的 `sections`、`contexts`、`variables` 做最终变换；
  - **没有**类似 `tools.guard` / `tools.restrict` 的 section 级过滤 API。
- `system-prompt/assemble` 监听器在 agent scope 注册后只接收该 Agent 的 assembly；在 `next()` 后过滤 `result.sections` 可以移除全局 section，其他 Agent 不受影响。已用最小原型验证（全局 `plugin:global` section 对 Agent A 隐藏、Agent B 仍可见；移除监听器后恢复）。
- `agentPresets.acquireScope(preset.id)` 返回带 `key: ScopeKey` 的 lease；`systemPrompt.assemble({ scope: lease.key })` 可以读出该 preset scope 下的 section 名称。该路径与现有 `buildToolCatalog()` 的 `acquireScope` 模式一致。
- 当前实现中：
  - `NativeOverlayRuntime` 只安装 `tools.guard` / `tools.restrict`；
  - `NativeStore` 的 overlay 只校验 `overlay.tools`；
  - `buildToolCatalog()` 已按 preset lease 读取工具目录，可复用其结构；
  - `index.js` 已注入 `tools`、`systemPrompt`、`agents`、`agentPresets`，无需新增服务依赖。

### 3.2 待验证假设

- 对真实 profile 的全部 preset 执行 `systemPrompt.assemble({ scope: lease.key })` 不会因缺少 `context.agent` / `toolSet` 等字段抛错；个别 section 可能需要降级处理。
- 真实 profile 中 section 名称在插件升级后保持稳定；若不稳定，需要“配置中存在但当前不可用”的容错展示。
- 在 `complete: true` 人格 preset 上，prompt 过滤不产生效果；需在 UI 明确提示，而不是静默失效。
- 大量 section 与多个 preset 的目录构建耗时可接受；若超过 UI 预算，再引入按 generation 的缓存。

---

## 4. 方案设计

### 4.1 数据模型

`native.json` 的 overlay 从：

```json
{
  "tools": { "mode": "all", "allow": [], "deny": [] },
  "enabled": true
}
```

扩展为：

```json
{
  "tools": { "mode": "all", "allow": [], "deny": [] },
  "prompts": { "mode": "all", "allow": [], "deny": [] },
  "enabled": true
}
```

规则：

- 旧状态没有 `prompts` 时，归一化为 `{ mode: "all", allow: [], deny: [] }`；
- `setOverlay` 请求没有 `prompts` 字段时，保留现有 `prompts`，避免旧客户端保存工具过滤时误清除 prompt 配置；
- 单个 section 名称最长 160 字符，数组去重并限制数量（建议 5000，与工具一致）；
- `enabled: false` 同时停用工具与 prompt 过滤，保持现有语义。

### 4.2 Prompt 目录

新增 `buildPromptCatalog(ctx, scope, logger)`（放在 `lib/catalog.js`）：

1. 通过 `ctx.agentPresets.list()` 获取 roster；
2. 对每个 preset 调用 `ctx.agentPresets.acquireScope(preset.id)`；
3. 调用 `ctx.systemPrompt.assemble({ scope: lease.key })`，收集 `assembly.sections`；
4. 生成条目：

```json
{
  "name": "free-search:engines",
  "preview": "Search engines: ...",
  "availableIn": ["global", "agent-preset:standard"],
  "protected": false,
  "order": 500
}
```

5. lease 必须在 `finally` 中 dispose；
6. 单个 preset 组装失败时记录 warning，返回该 preset 可读取的部分，不影响其他 preset。

目录缓存策略：

- 第一版按需构建，不做跨请求缓存；
- 若实测超过 300–500ms，增加基于 `native.store.generation` 与 prompt registry change 的短期缓存。

### 4.3 运行时过滤

在 `NativeOverlayRuntime` 构造时注册**一个** runtime 级 prompt 监听器，而不是每个 Agent 各注册一个：

```js
this.promptDisposer = this.scope.on(
  'system-prompt/assemble',
  async (assembly, context, next) => {
    const result = await next()
    const agent = context?.agent
    if (!agent || typeof agent.id !== 'string') return result
    const entry = this.entries.get(agent.id)
    if (!entry) return result
    const overlay = this.overlayFor(entry.sessionId, entry.nativeId)
    const filter = promptFilterFor(overlay)
    if (!filter || !Array.isArray(result?.sections)) return result
    return {
      ...result,
      sections: result.sections.filter((section) =>
        permitsPrompt(filter, section?.name)
      ),
    }
  },
  { prepend: true, global: true },
)
```

为什么不是 `agent.ctx.on(...)`：

- Cordis waterfall 的监听器**外层先执行**。实测顺序是 `global listener -> agent listener -> ...`；`dsh-expression` 在全局监听器里 `await next()` 之后才追加 `dsh-expression:companion`。
- 如果过滤监听器注册在 Agent scope，它是内层，`await next()` 返回时看到的是全局监听器追加**之前**的 sections；等它返回后，全局监听器再把 section 加回去，过滤被绕过。
- 注册在 runtime scope 并传 `prepend: true`，它成为最外层：先调用 `next()` 走完所有全局/Agent 监听器，再过滤最终结果。
- 传 `global: true` 让它收到所有 scope 的 assembly；再用 `context.agent.id` 映射 `entries`，只过滤已附加 Agent。
- 一个 runtime 只注册一个监听器；`dispose()` 释放。preset 切换 / overlay 更新时直接读当前 overlay，不需要重新注册。

残余风险：

- 若另一个插件也以 `prepend: true` 注册并在 `next()` 之后追加 section，且注册时间晚于本插件，它会位于本过滤器外层，仍可能绕过。当前观测到的插件（`dsh-expression`、`dsh-free-search`、`dsh-plugin-link-resolver`）都使用普通 `on`，不受影响；后续新增此类插件需复验。

其他细节：

- 受保护 section（`harness:identity`、`deployment:persona-prefix`、`deployment:persona-suffix`）始终保留；
- `complete: true` 人格在 waterfall 后由 DSH 恢复为唯一 section，prompt 过滤无法覆盖；
- 监听器安装失败只记录 warning，不影响工具过滤与 Agent 启动；
- 不使用空 section shadow 作为主方案：同一 scope 内重复注册同名 section 会抛错，且需要知道 order；waterfall 更通用；
- 只过滤 `sections`，不处理 `contexts`。

### 4.4 HTTP API

`PUT /api/preset-editor/native/overlay` 请求体扩展为：

```json
{
  "id": "standard",
  "enabled": true,
  "tools": { "mode": "all", "allow": [], "deny": [] },
  "prompts": { "mode": "deny", "allow": [], "deny": ["free-search:engines"] },
  "generation": 12
}
```

- `DELETE /api/preset-editor/native/overlay` 仍删除整个 overlay（工具 + prompt）；
- `GET /api/preset-editor/native?catalog=1` 响应增加 `catalog.promptSections`；
- 错误码沿用现有 `INVALID_INPUT` / `PRESET_NOT_FOUND`；
- 旧客户端只发送 `tools` 时，`prompts` 保持不变。

### 4.5 UI

在现有「工具过滤」旁新增「提示词段过滤」页签，或作为一个独立卡片放在同一过滤页面：

- 模式选择：`不额外过滤` / `仅保留选中` / `排除选中`；
- 搜索框、来源筛选（全部 / 全局 / 当前 preset）；
- section 列表：名称、短 preview、来源 badge、受保护 badge；
- 保存 / 移除按钮复用现有 overlay 保存流程；
- 顶部提示：
  - `complete: true` 人格下过滤不生效；
  - 受保护 section 不可被排除；
  - 过滤只影响模型可见提示词，不影响工具执行；
- 侧边状态栏显示当前 prompt filter 摘要。

### 4.6 兼容与降级

- 旧 `native.json` 载入后自动补全 `prompts`；
- 旧 API 客户端只保存工具过滤时不触碰 `prompts`；
- DSH 版本没有 `systemPrompt` 或 `system-prompt/assemble` 时，插件不注册 prompt 监听器，工具过滤照常工作；启动日志记录一次；
- `assemble()` 目录读取失败时，UI 仍可编辑工具过滤，prompt 列表显示错误状态；
- 配置开关 `promptFilter`（默认 `false` 的开发期开关，验收后决定是否默认开启）用于安全试点；关闭时 UI 隐藏 prompt 页签、runtime 不安装监听器。

---

## 5. 推进计划

### M0 — 分支与基线（0.5 天）

- 创建 `feat/prompt-section-filter` 分支；
- 运行一次基线测试：`npm test`，记录当前通过数（README 记录 70 个测试）；
- 确认 DSH 版本与依赖：`@deepseek-ai/dsh@0.2.2-rc.1`、Node 24.x；
- 产出：分支、基线记录、无行为变化。

**验收**：分支干净（除计划文件外），`npm test` 通过数与修改前一致。

### M1 — 数据模型与存储（0.5–1 天）

- `lib/native.js`：
  - `#normalize()` 支持 `prompts`，旧数据补默认值；
  - `setOverlay()` 支持 `prompts` 且缺省时保留旧值；
  - `overlay()` 返回完整结构；
- `test/native.test.js`：新增旧数据兼容、allow/deny、非法字段、generation 容错测试。

**验收**：旧 `native.json` 原样载入不报错；旧 API 只传 `tools` 不会清除 `prompts`。

### M2 — Prompt 目录（1 天）

- `lib/catalog.js`：实现 `buildPromptCatalog()`；
- `lib/native-http.js`：`catalog=1` 返回 `promptSections`；
- `test/catalog.test.js`：mock `agentPresets.acquireScope` 与 `systemPrompt.assemble`；
- 用真实 profile 测量一次目录构建耗时。

**验收**：目录中能看到 `free-search:engines`、`link-resolver:guidance` 等段；单个 preset 失败不影响其他 preset。

### M3 — Runtime 过滤（1–1.5 天）

- `lib/native-runtime.js`：新增 runtime 级 `promptDisposer`、`promptFilterFor()`、`permitsPrompt()`；
- 监听器注册在 runtime scope：`{ prepend: true, global: true }`；**不要**注册在 `agent.ctx`（会被全局 listener 的 `next()` 后追加绕过）；
- `lib/index.js`：无需新增 inject，`systemPrompt` 已注入；
- 新增 `test/prompt-runtime.test.js`：
  - 模拟 `dsh-expression` 的全局 listener，在 `next()` 后追加 section；preset A 移除，preset B 保留；
  - protected section 保留；
  - 无 prompt filter / `enabled: false` 时行为不变；
  - `complete: true` 人格下不破坏原行为；
  - 工具过滤与 prompt 过滤可同时工作（工具集成测试已有）。

**验收**：两个 Agent 隔离；过滤后最终 assembly 不含目标段；无过滤时行为与现状完全一致。

### M4 — HTTP API（0.5 天）

- `lib/native-http.js`：overlay 路由支持 `prompts`；
- `test/native-http.test.js`：旧请求兼容、prompt 保存/读取/清除；
- 更新 API 文档。

**验收**：`PUT /native/overlay` 可同时保存 tools + prompts；`DELETE` 清除两者。

### M5 — UI（1.5–2 天）

- `lib/client.js`：
  - 新增 `TAB_PROMPTS` 或过滤页卡片；
  - `overlayOf()` 默认包含 `prompts`；
  - 列表搜索、allow/deny 勾选、来源 badge、受保护标记；
  - `saveOverlay` / `clearOverlay` 传递完整 overlay；
- 更新 `README.md` 使用说明与截图。
- 旧 UI 行为回归：工具过滤页、人格页、组合页不受影响。

**验收**：真实 Web UI 中可保存 / 清除 prompt 过滤；刷新后状态保持；`complete` 人格提示可见。

### M6 — 测试、验收与文档（1 天）

- 运行 `npm test` 全量；
- 真实 profile 验收：
  - 一个全局静态 section 被过滤；
  - 同一 section 在其他 preset 可见；
  - 无过滤时无回归；
- 更新 `docs/ACCEPTANCE.md` 增加验收项与证据；
- 更新 `CHANGELOG.md`（Unreleased → 0.3.0）。

**验收**：测试全绿；真实实例截图/日志证据齐全；文档与实现一致。

### M7 — 发布准备（0.5 天）

- 版本号 `0.2.0` → `0.3.0`（minor feature）；
- 打包检查 `npm pack --dry-run`；
- PR description / release notes；
- 回滚方案演练（关闭 `promptFilter` 配置或删除 overlay 即可恢复）。

**验收**：`npm pack` 内容包含新模块与文档；关闭开关后行为回到 0.2.0 等价状态。

总估算：**6–8 个工作日**（不含真实 UI 截图返工与上游 DSH 兼容性变化）。

---

## 6. 风险与影响

### 6.1 风险矩阵

| ID | 风险 | 概率 | 影响 | 应对 / 验证 |
|---|---|---:|---|---|
| R1 | section 名称随插件版本变化，overlay 静默失效 | 中 | 中 | 保存名称并按目录比对，UI 显示“配置中存在但当前不可用”；每次 catalog 刷新提示缺失项 |
| R2 | DSH 无 section owner 元数据，只能按名称前缀推断来源 | 高 | 低–中 | UI 以名称为主、来源只作辅助 badge；文档明确不承诺精确归属 |
| R3 | `systemPrompt.assemble({ scope: lease.key })` 在缺少 `context.agent` / `toolSet` 时抛错 | 中 | 中 | 捕获单 preset 错误并降级；目录不阻塞工具过滤；记录 warning |
| R4 | `complete: true` 人格使 prompt 过滤无效 | 中 | 中 | 检测 `@deepseek-ai/dsh-persona` 的 `complete` 配置并禁用/警告；不写入无效 overlay |
| R5 | 误删核心 section，导致身份或人格缺失 | 低–中 | 高 | 保护 `harness:identity`、`deployment:persona-prefix`、`deployment:persona-suffix`；allow 模式下强制保留 |
| R6 | 与其他 `system-prompt/assemble` 监听器顺序/重复过滤冲突 | 低 | 中 | 只在 `next()` 后过滤最终数组；不修改 `contexts`；单 Agent 单监听器幂等安装 |
| R7 | 目录构建遍历所有 preset 导致打开 UI 变慢 | 中 | 中 | 先测量；必要时按 generation 缓存；单个 preset 失败不阻塞整体 |
| R8 | 旧 `native.json` / 旧客户端兼容问题 | 低 | 中 | 归一化补 `prompts`；缺省字段保留旧值；专门测试旧格式 |
| R9 | 已有 live Agent 保留旧 revision，用户以为立即生效 | 中 | 低–中 | 沿用现有提示：新会话生效；UI 显示“运行中会话保留旧 revision” |
| R10 | prompt 过滤被误当作安全/权限控制 | 低 | 中 | 文档明确：只影响模型可见文本，不改变工具权限与执行 |
| R11 | 新增 UI 页签破坏原有过滤页布局 | 低 | 低 | 复用现有组件与 CSS；视觉回归截图；窄屏检查 |
| R12 | `promptFilter` 开关关闭时 UI/服务残余注册 | 低 | 低 | 统一在 `apply()` 入口判断；开关关闭不注册 listener、不返回 prompt catalog |

### 6.2 影响范围

**代码文件**

- `lib/native.js`：overlay 数据模型、归一化、setOverlay；
- `lib/catalog.js`：新增 prompt section 目录；
- `lib/native-runtime.js`：新增 per-agent prompt 过滤监听器；
- `lib/native-http.js`：overlay API 与 catalog 响应；
- `lib/client.js`：新增提示词段过滤 UI；
- `lib/index.js`：可选开关与注入检查；
- `test/*`：新增/更新单元、HTTP、集成测试；
- `README.md`、`docs/ACCEPTANCE.md`、`CHANGELOG.md`、本计划文件。

**数据**

- `$DSH_HOME/preset-editor/native.json`：overlay 增加 `prompts` 字段，向后兼容；
- 备份快照格式同步变化；旧快照恢复时按旧格式归一化；
- 不需要数据库迁移。

**性能**

- 每个 Agent 每次 prompt assembly 多一次数组过滤，开销可忽略；
- catalog 构建按 preset 执行 `systemPrompt.assemble()`，是主要成本；首版按需构建并测量，超过阈值再加缓存。

**兼容性**

- 不修改 DSH 核心；
- 不修改 native preset 组合；
- 保留现有工具过滤全部行为；
- 旧 `native.json` 与旧 API 客户端可继续工作；
- 需要 DSH 版本至少包含 `systemPrompt.section` / `system-prompt/assemble`（当前验证基线 `0.2.2-rc.1` 已满足）。

**用户可见影响**

- 新增一个可选过滤维度；默认 `all` 时没有行为变化；
- 提示词段列表可能出现大量条目，需要搜索与来源过滤；
- `complete` 人格 preset 的 prompt 过滤不可用，需要明确说明。

**安全与权限**

- prompt 过滤不是权限边界：隐藏提示词不等于禁用插件或工具；工具执行仍由现有 `tools.guard` 负责；
- 不新增网络、文件或凭据访问；
- 所有管理 API 继续走现有 owner-only / CSRF 校验。

---

## 7. 验收标准

- [x] 旧 `native.json` 与旧 overlay 请求无回归；
- [x] `npm test` 全量通过（78/78，含真实 Harness prompt 测试）；
- [x] 一个全局静态 prompt section 可在 preset A 中隐藏，preset B 仍可见；
- [x] 清除过滤/无过滤时 section 恢复（`test/prompt-runtime.test.js`）；
- [x] protected section 始终保留；
- [x] 工具过滤与 prompt 过滤可同时启用且互不影响（独立 disposer / 独立数据）；
- [x] 独立真实 profile：catalog 含 `dsh-expression:companion`；Agent assembly 中该 section 可过滤并恢复（证据 `docs/evidence/prompt-filter-e2e.json`）；
- [ ] 真实 Web UI 内点击保存/清除/刷新保持（client bundle 已服务，待浏览器截图）；
- [x] README、ACCEPTANCE、CHANGELOG 更新。

## 8. 回滚方案

- 功能级：把所有 preset 的 `prompts.mode` 置为 `all`，或 `DELETE /api/preset-editor/native/overlay` 清除对应 overlay；runtime 监听器仍在，但 `promptFilterFor()` 返回 `null`，行为与 0.2.0 等价；
- 数据级：旧版本读取 `native.json` 时忽略未知 `prompts` 字段；`setOverlay()` 只更新 `tools` 也不会清空 `prompts`；
- 代码级：revert feature branch；
- 发布级：保留上一版本 `0.2.0` 的 tag 与包，必要时回退。

> 未实现全局 `promptFilter: false` 开关：默认 overlay 为 `all`，功能本身是惰性的；再增加开关只会增加配置组合，暂不需要。

## 9. 已定决策

1. **默认开启**：不加全局 feature flag；每个 preset 的 overlay 默认 `all`，只有用户明确配置才改变 prompt。
2. **受保护集合**：`harness:identity`、`deployment:persona-prefix`、`deployment:persona-suffix`；其余 section（含 `tool:*`）可过滤。
3. **UI**：独立「提示词段」tab，不塞进工具过滤页。
4. **contexts**：本期只过滤 `sections`，`assembly.contexts` 留作后续独立需求。
5. **版本**：目标 `0.3.0`，待真实 profile/UI 验收后再发布。
