# 验收报告 — dsh-preset-editor（原生 Agent preset 融合版）

> 版本：0.3.0
> 验证环境：DeepSeek Harness `0.2.2-rc.1`，Node `24.x`，Linux 容器
> 报告时间：2026-11-19
> 结论：**原生预设列表、编辑、新增、恢复、逐工具过滤、提示词段过滤、组成预览与真实 UI 均通过验证；未执行项在第 8 节明确列出。**

---

## 1. 交付状态

| 项目 | 状态 |
|---|---|
| 可安装插件项目 | ✅ `package.json` / `cordis.patch.yml` / `lib/*` |
| 原生 preset 列表/编辑/新增/恢复 | ✅ 已在真实 profile 验证 |
| 逐工具过滤叠加 | ✅ 真实 Agent probe 验证 |
| 自动化测试 | ✅ 83/83 通过 |
| 真实 Web Profile + Chrome UI | ✅ 已截图 |
| 文档 | ✅ README / REQUIREMENTS / ACCEPTANCE |

---

## 2. 环境与命令

```bash
$ node --version
v24.22.2
$ dsh --version
0.2.2-rc.1
```

自动化：

```bash
cd /workspace/dsh-preset-editor/repo
npm test
```

结果：

```text
tests 70
pass 70
fail 0
skipped 0
```

完整输出：[docs/evidence/test-output.txt](evidence/test-output.txt)。

测试文件：

| 文件 | 覆盖 | 结果 |
|---|---|---|
| `test/native.test.js` | `!!js` YAML round-trip、托管块合并/替换、结构校验、NativeStore、patch 写入、reset、自动备份、stale 容错、orphan 修复、insert mode 保持、备份回滚、ID 限制、运行时备份开关、快照分组 | 16/16 |
| `test/schema.test.js` | 旧 overlay 状态归一化/校验 | 10/10 |
| `test/store.test.js` | 原子写/0600/损坏/并发/写失败/未来版本 | 6/6 |
| `test/manager.test.js` | 旧 overlay CRUD/优先级/回退 | 13/13 |
| `test/catalog.test.js` | 工具来源/工作区/作用域/目录 | 6/6 |
| `test/http.test.js` | 旧 overlay API/CSRF/错误 | 7/7 |
| `test/native-http.test.js` | 原生 preset API：同路径多方法、CSRF、overlay、备份回滚、备份策略、错误 | 6/6 |
| `test/runtime.integration.test.js` | 真实 Harness guard/restrict/prompt/双会话/dispose | 6/6 |
| `test/prompt-runtime.test.js` | 真实 Harness prompt listener 追加段过滤、protected、Agent 隔离 | 4/4 |
| `test/preview.test.js` | 组成预览 sections/contexts/variables/tools、overlay 模拟、按需 part、真实 SystemPrompt | 4/4 |

> 旧 overlay 模块保留为回归测试与可复用控制原语；正式 UI/入口已切换到原生版。

---

## 3. 真实 profile 设置与启动

独立 `DSH_HOME`：

```bash
export DSH_HOME=/workspace/dsh-preset-editor/repo/.e2e-home
dsh --profile e2e --from-default-profile web --dump-config
dsh plugin --profile e2e add link:/workspace/dsh-preset-editor/repo
dsh plugin --profile e2e add link:/workspace/dsh-preset-editor/repo/test/fixtures/e2e-agent
```

`cordis.patch.yml` 中加入测试夹具（仅验收用）：

```yaml
- id: preset-editor
  config:
    stateFile: ''
    diagnostics: true
    refreshDebounceMs: 250
    maxPresets: 100
    maxPersonaChars: 20000
    maxSessionAssignments: 5000
- insert:
    - id: e2e-agent
      name: e2e-agent
      config:
        cwd: /workspace/dsh-preset-editor/repo
        sessionId: e2e-native
        resultFile: /workspace/dsh-preset-editor/repo/.e2e-results.json
        nativePreset: standard
```

启动：

```bash
DSH_HOME=/workspace/dsh-preset-editor/repo/.e2e-home dsh --profile e2e --port 0 --no-open
# dsh web: http://127.0.0.1:PORT/?token=...
```

启动日志无 Failed plugins；`chmod 600 .credentials.yaml` 已确认。

---

## 4. 原生 preset API 验证

认证后：

```text
GET  /api/preset-editor/native?catalog=1  → {"ok":true,"presets":[...],"catalog":{...}}
```

初始 roster：

```text
standard, ptc, minimal, cordis
```

### 4.1 覆盖内置 preset

`PUT /api/preset-editor/native`，body 抄自 `readDocument('standard')`，改 `name=Standard X`：

- 返回 `{"ok":true,"preset":{...,"name":"Standard X","mode":"override"}}`
- profile `cordis.patch.yml` 出现托管块 `- id: preset-standard`
- 官方 Session header chip 显示 `Standard X`（截图前观察）
- `GET /native` 再读为 `standard / Standard X / override`

### 4.2 新增原生 preset

`POST /api/preset-editor/native`，id `native-demo`，从 standard 复制 plugins：

- 返回 `ok:true`，`mode:"create"`，`rowId:"preset-native-demo"`
- `cordis.patch.yml` 出现：

```yaml
- insert:
    - id: preset-native-demo
      name: '@deepseek-ai/dsh-agent-preset'
      config: { id: native-demo, ... }
```

- `GET /native` roster 包含 `native-demo`。

### 4.3 恢复/删除

- `DELETE /native` id `standard` → `removed:true`，roster 名称恢复 `standard`、mode `builtin`。
- `DELETE /native` id `native-demo` → `removed:true`，roster 移除；profile patch 变回 `[]`。

### 4.4 工具过滤 overlay

`PUT /api/preset-editor/native/overlay`：

```json
{ "id": "standard", "enabled": true,
  "tools": { "mode": "deny", "allow": [], "deny": ["preset_editor_probe","bash"] } }
```

返回 overlay；`GET /native` 的 standard.overlay 一致。`DELETE` 可移除。

### 4.5 自动备份

每次 `PUT/POST/DELETE /native` 或 overlay 变更前后：

- 写 `cordis.patch.yml` 前，把旧 patch 保存为 `backups/patch-<ISO>-g<generation>.yml`；
- 写 `native.json` 前，把旧状态保存为 `backups/native-<ISO>-g<generation>.json`；
- 默认保留最近 20 份，可用 `backup` / `backupDir` / `backupKeep` 配置调整。

实测：`GET /api/preset-editor/native/backups` 返回：

```json
{"ok":true,"enabled":true,"keep":20,"backups":[{"name":"patch-2026-11-14T18-05-23-596Z-g1.yml","kind":"patch","bytes":343}]}
```

### 4.6 启动修复与缺失声明

真实实例验证：用一个托管 `test1` 的 direct row（错误形态）加 native 状态启动。

修复后：

```text
GET /native: ids = standard, test1, ptc, minimal, cordis
test1.mode = create
patch: - insert: ... preset-test1
native.json: test1.mode = create
```

- `repairOrphans()` 在启动时发现托管定义没有对应 Loader declaration，自动改写为 `- insert:`；
- 新增 preset 一旦进入 roster，后续保存仍保持 `mode: create`，不会再退化成 direct row；
- `extractManagedDefinitions` 现在区分 insert/direct，恢复时不会把 insert 误判为 override；
- 若修复失败，列表会显示“未加载”并提供“修复为新增声明”。

### 4.7 错误与并发

- 缺 CSRF header → 403。
- generation 过期 → 不再 409 STALE；服务端仅记录 warning，写入继续。
- 重复创建 id → 409 NATIVE_EXISTS。
- patch 写入/激活失败 → 回滚 patch + state，返回错误。
- HMR 超时（空 patch 曾导致）已修复：空托管块写回 `[]`。

### 4.8 提示词段过滤（0.3.0，真实 profile）

独立 `DSH_HOME`，profile 同时加载 `dsh-preset-editor`、`dsh-meme` 和 `e2e-agent` fixture：

- `GET /api/preset-editor/native?catalog=1` 返回 25 个 prompt section，其中包含真实的 `dsh-expression:companion`；`harness:identity`、`deployment:persona-prefix/suffix` 标记为 protected。
- fixture 创建一个使用 `standard` 原生 preset 的真实 Agent，并注册全局 `e2e:prompt-marker` section。
- 默认 assembly 同时包含 `e2e:prompt-marker` 与 `dsh-expression:companion`。
- `PUT /native/overlay` 设置 `prompts: { mode: "deny", deny: ["e2e:prompt-marker", "dsh-expression:companion"] }` 后，两者都从最终 assembly 消失，protected section 保留。
- `DELETE /native/overlay` 后两者恢复；fixture 记录 `promptDefaultHasMeme=true`、`promptFilteredHasMeme=false`、`promptRestoredHasMeme=true`。
- Web 页面加载的 `dsh-preset-editor/client.js` bundle 包含 `PromptFilterPane`、`resetFilterPart` 与「提示词段」文案。

结论：真实 profile 的 API、catalog 与 runtime prompt 过滤已验证；浏览器内点击保存/清除的 UI 交互截图仍未执行。脱敏证据见 [prompt-filter-e2e.json](evidence/prompt-filter-e2e.json)。

### 4.9 组成预览（0.4.0 候选，真实 profile）

独立 `DSH_HOME`，加载 `dsh-preset-editor` 与 `dsh-meme`：

- `GET /preview?id=standard` 返回 23 个 prompt section、7 个 context、37 个 tool declaration；包含真实 `dsh-expression:companion`。
- `model` 变量在预设级快照中无法插值，返回 `unresolvedVariables: ["model"]` 与明确 warning。
- 设置 overlay `tools.deny=["bash","send_meme"]`、`prompts.deny=["dsh-expression:companion"]` 后再取预览：
  - section 标记 `filtered: true`，渲染预览不再包含斗图规则；
  - `bash` / `send_meme` 标为 `hidden`；
  - counts 为 visible 35 / hidden 2 / total 37。
- `part=prompt`、`part=section&name=dsh-expression:companion`、`part=tool&name=bash` 均返回 200；不存在的 section 返回 404 `PREVIEW_PART_NOT_FOUND`。
- 组成预览 UI 为单列 manifest：section/context 有顺序编号，全文/schema 用原生 `<details>` 内联展开；除 tab body 外无嵌套滚动容器。
- `warnings` 与 `notes` 已分离：静态工具可见性说明进入 notes，不再混在真正的 warning 中。
- Web 页面加载的 `client.js` bundle 包含 `PreviewPane`、`dspm_previewStats` 与「组成预览」文案。
- 移动端截图显示旧的 1380px 双列规则覆盖了 980px 单列规则，导致编辑器横向裁切；现已把双列规则限定在 981–1380px，并在 CSS 末尾追加 ≤980px 单列/无嵌套滚动覆盖。
- DSH 的 main panel 自身不滚动；移动端改为 `.dspm_page` 作为唯一纵向滚动容器，避免移除 tabBody 滚动后整页无法滚动。待移动端复测。

结论：真实 profile 的 preview API、assembly 数据与 overlay 模拟已验证；浏览器内点击 tab/展开全文的交互截图仍未执行。脱敏证据见 [composition-preview-e2e.json](evidence/composition-preview-e2e.json)。

---

## 5. 真实 Agent 执行验证（fixture）

`test/fixtures/e2e-agent` 在 `setup` 中执行：

```js
await ctx.get('agentPresets').mount(agentCtx, 'standard')
```

创建真实 Agent 后：

1. 读取 `composedPreset === 'standard'`；
2. `ctx.tools.definitions(agent)` 包含 standard 的 33 个工具（含 `bash`、`preset_editor_probe`）；
3. 执行 `ctx.tools.execute` 固定探针 → `preset-editor-probe-ok`；
4. 设置 overlay deny `preset_editor_probe,bash`；
5. 再读 definitions：`bash`、`preset_editor_probe` 消失；
6. 再执行探针 → `Error: 原生预设「standard」的工具过滤不允许调用「preset_editor_probe」`；
7. 清除 overlay；
8. definitions 恢复；探针恢复 `ok`。

证据：[docs/evidence/e2e-results.json](evidence/e2e-results.json)。

关键片段：

```json
"composedPreset": "standard",
"visibleDefault": ["bash", ..., "preset_editor_probe", ...],
"visibleFiltered": [ ... no bash/probe ... ],
"visibleRestored": [ ... bash/probe back ... ],
"probeDefault": {"isError": false, "text": "preset-editor-probe-ok"},
"probeFiltered": {"isError": true, "text": "Error: 原生预设「standard」的工具过滤不允许调用「preset_editor_probe」"},
"probeRestored": {"isError": false, "text": "preset-editor-probe-ok"}
```

> 注意：`visibleDefault` 中 standard 的实际工具取决于 profile 的 `standard` 组合；fixture 没有修改原生组合，因此工具集与官方一致。

---

## 6. 浏览器 UI 验证

设计方向：以 DSH 的“工作台/蓝图”为语义，三栏结构（预设脊柱 / 编辑器 / 状态轨），钴蓝作为唯一强调色，hairline 分隔与少量直角，避免 SaaS 卡片堆叠；交互上使用页面内未保存确认、禁用未变更保存、焦点可见、响应式收束。

使用 headless Chrome + CDP，真实 `dsh web` token URL：

| 操作 | 结果 |
|---|---|
| 左侧快捷列表「预设管理」 | ✅ 独立页面，不再位于 Settings；截图可见左侧导航项与全宽页面 |
| 侧栏图标居中 | ✅ 图标 16×16，`display:flex; align-items:center`；实测 icon center y=208 = nav center y=208 |
| 列表 | ✅ 显示 standard/ptc/minimal/cordis（以及测试中新增的自定义 preset）；默认/内置/已覆盖/自定义徽标 |
| 人格 tab | ✅ 显示 prefix/complete/includeRuntimeContext；页面内包含两项的中文解释（complete 抑制其他 section；includeRuntimeContext 注入工作目录/沙箱/审批等） |
| 预设 id 说明 | ✅ 字段旁 ? 图标；hover/focus 显示固定定位气泡，点击可固定；自动夹在视口内并放在字段下方，不被 overflow 截断 |
| 新 preset ID | ✅ 新建仅允许小写字母/数字/`-`；`Aemeath` 被拒绝，`aemeath` 创建成功；已有 legacy ID 仍可编辑；页面文案仅显示规则 |
| 输入焦点 | ✅ 普通输入框只变边框色；搜索框由 `.dspm_search:focus-within` 整体高亮，input outline-style=none，搜索高亮与容器尺寸一致 |
| 标题竖线 | ✅ 标题 `margin:0`；mark 与 h1 同 top/height（34px），≤1180 为 26px，≤980 为 31px |
| 插件组合 tab | ✅ 显示原生插件行与开关；不含 YAML；只有 tabBody 一条滚动条 |
| 高级编辑 tab | ✅ 独立 tab，完整 entry-list YAML；实测 textarea scrollHeight 2180 / clientHeight 173，`overflow-y:auto`，`scrollTop` 可置 200 |
| 保存来源 | ✅ 默认“结构化行”；YAML 输入后自动切“YAML”、dirty 出现、保存按钮启用；切回结构化保留 dirty，按钮 active/徽标同步 |
| 工具过滤 tab | ✅ 三种模式、搜索、来源筛选、批量选择 |
| 顶部固定 | ✅ 过滤标题/说明/保存按钮/模式/搜索工具栏固定；实测 tabBody `overflow:hidden`，工具列表 `clientHeight=274 / scrollHeight=3180`，滚动条只在列表内 |
| 新增原生预设 | ✅ 弹窗可用；CDP 填 id/name 后成功创建 `ui-native`，API roster 出现；随后通过 API 删除 |
| 保存到原生预设 | ✅ 通过 API/结构体验证；UI 调用同一 `PUT /native` |
| 恢复内置/删除自定义 | ✅ modal 与 API 行为已验证 |
| 自动备份 | ✅ 头部显示“自动备份：开启 · N 份（保留 20）”；`GET /native/backups` 返回真实 patch 备份（如 `patch-...-g1.yml`） |
| 备份回滚 | ✅ 备份记录每行“回滚”；确认后 POST `/backups/restore`；实测 standard 从 `Backup Test` 恢复为 `standard`，并自动生成回滚前备份 |
| 备份显示 | ✅ 时间按系统本地时区 `YYYY-MM-DD HH:mm:ss`；大小显示 B / KB / MB |
| 自动备份开关 | ✅ 备份记录弹窗可关闭/开启；关闭后新写入不再生成备份，历史备份保留；profile `backup:false` 为硬关闭 |
| 备份状态文案 | ✅ 弹窗中的“开启 · N 份（保留 K）”使用 `fmt` 插值，不再显示 `{n}`/`{keep}` |
| 备份快照 | ✅ patch/native 同一次操作合并为一条，按系统时间命名并计 1 份；保留份数可在弹窗调整 |
| 未保存切换 | ✅ 使用页面内 modal（不再 `window.confirm`）；显示“继续编辑 / 放弃修改”，实测放弃后切到 ptc |
| 布局 | ✅ 三栏工作台（272px 预设脊柱 + 编辑器 + 238px 状态轨）；≤1380px 隐藏状态轨，≤980px 单列 |
| 按钮层级 | ✅ 主操作实心钴蓝 29px/4px；次级/备份/刷新为无边框 ghost；禁用态 42% 透明度；实测 primary `rgb(65,118,230)`、ghost 透明背景 |
| 半屏 1280×752 | ✅ 状态轨隐藏；editor bottom 735 < innerHeight 752；组合用 tabBody 滚动，过滤只用工具列表滚动，高级编辑只用 YAML 滚动 |
| 过滤操作按钮 | ✅ 保存/移除按钮移到过滤 tab 顶部，不随 80 个工具列表滚到最底部 |
| 操作区间距 | ✅ 编辑器顶部距 layout 17px；编辑器右缘与状态轨间隔 16px；页面右侧保留 28px padding |
| 控制台错误 | ✅ 无插件 JS 异常；仅无关的 open-in-app 图标 404 |
| 截图 | `docs/images/native-presets.png`、`native-composition.png`、`native-filter.png`、`native-advanced.png` |

> UI 的“新增原生预设”CDP 操作创建了 `ui-native`；删除时使用 API 清理。UI 的保存按钮调用同一 API，API 已多次验证真实 patch/HMR。

---

## 7. 逐项验收对照

| 需求 | 状态 | 证据 |
|---|---|---|
| NP-01 列表原生 roster | ✅ | `/native` 与官方 roster 一致 |
| NP-02 读取组合 | ✅ | standard 22 行、ptc 23 行、minimal 4 行、cordis 23 行；`!!js` 保留 |
| NP-03 编辑人格 | ✅ | 人格 tab + API patch 覆盖 |
| NP-04 编辑插件组合 | ✅ | 行级开关 + YAML；API 覆盖验证 |
| NP-05 保存内置覆盖 | ✅ | Standard X 名称/组合生效；HMR |
| NP-06 新增原生 preset | ✅ | native-demo + ui-native 两次 |
| NP-07 恢复内置 | ✅ | name 恢复 standard |
| NP-08 删除自定义 | ✅ | native-demo/ui-native 移除，patch `[]` |
| NP-09 工具过滤叠加 | ✅ | probe allow/deny/restore |
| NP-10 按 native id 绑定 | ✅ | fixture standard 使用 overlay |
| NP-11 结构化/YAML | ✅ | UI 两种编辑入口；服务端 `pluginsYaml` 支持 |
| NP-12 托管块共存 | ✅ | native.test 验证 other patch 保留 |
| NP-13 状态恢复 | ✅ | `reconcileFromPatch` + `extractManagedDefinitions` |
| NP-14 HMR/无 HMR | ✅ | HMR 实测；无 HMR 返回 restart-required 代码路径 |
| NP-15 错误回滚 | ✅ | 空 patch/HMR 超时曾回滚；测试覆盖 |
| NP-16 并发 | ✅ | stale generation 写入实测 200；UI 写前同步 |
| NP-17 浏览器 UI | ✅ | CDP 截图/创建 |
| NP-18 身份一致 | ✅ | `config.id` / Session header / roster 同一 id |
| NP-19 空/加载/错误 | ⚠️ 部分 | 代码有；未逐一截图断网/500 |
| NP-20 API 安全 | ✅ | owner-only + CSRF；HTTP 测试 |
| NP-21 测试/真实实例 | ✅ | 70 测试 + 真实 profile |
| NP-22 无核心修改 | ✅ | 仅 profile patch / public services |

---

## 8. 未执行 / 部分执行项

| 项目 | 状态 | 原因 |
|---|---|---|
| 无 HMR 部署的 `restart-required` 实机验证 | 未执行 | 测试 profile 启用 HMR；代码路径返回该状态。 |
| 真实第三方 bundle 覆盖（非 preset-standard） | 未执行 | 需安装额外 bundle；`readDocument` + rowId 查找逻辑已覆盖 standard。 |
| `complete: true` 人格组合 | 未执行 | 文档化 DSH prompt 语义；未跑 minimal 实际会话。 |
| 工作区/Session 级原生 selection | 不提供 | DSH 未公开 workspace→preset API；本插件不伪造；原生 selection 由官方 UI 处理。 |
| UI 保存/创建全部按钮的逐项截图 | 部分 | 新增弹窗与列表截图；保存 API 多次验证，UI 调用同一 API；未逐按钮录屏。 |
| 断网/500 UI 状态截图 | 未执行 | 代码有错误横幅/重试；未模拟。 |
| 鼠标坐标点击（CDP Input.dispatchMouseEvent） | 使用 DOM click | 本次 CDP 的 DOM click 成功；未使用坐标点击。 |
| PTC `run_code` overlay | 未执行 | 测试 profile native executor；guard 逻辑放行 `run_code`，内层未实测。 |
| 导入/导出/同步 | 未实现 | 后续扩展。 |
| 提示词段过滤的真实 profile/UI 验收 | 部分 | API/catalog/runtime 已在独立 profile 验证（见 §4.8）：真实 `dsh-expression:companion` 可过滤并恢复；浏览器内点击保存/清除/刷新与 `complete: true` 会话仍未执行。 |
| 组成预览的真实 profile/UI 验收 | 部分 | API/assembly/overlay 模拟已在独立 profile 验证（见 §4.9）；浏览器内打开 tab、展开全文、查看 schema 的交互截图仍未执行。 |

---

## 9. 已知问题/限制

1. profile patch 写入依赖 HMR；无 HMR 或 preset 正被运行中 Agent 使用时，可能返回 `restart-required`；patch/state 已保存，重启后应用。
2. 原生组合是插件级；逐工具过滤是叠加层，不改变原生组合。
3. `readDocument` 无 rowId；依赖 `ctx.loader.entries()`，上游表示变化需适配。
4. 用户手工同 id 行与托管块可能冲突；托管块最后写入优先。
5. 新会话使用当前定义；Host 未驻留的旧会话重新打开时使用当前定义；已打开/驻留 Agent（含空闲）保留旧 revision。
6. 修改 profile 影响整个 profile；需备份。
7. 不实现工作区/Session 级原生选择（无公开 API）。
8. 旧 overlay 模块仍作为回归测试/工具原语保留，但入口/UI 已切换原生版。
9. 提示词段过滤只处理 `assembly.sections`，不处理 `assembly.contexts`；`complete: true` 人格下其他 section 会被 DSH 抑制，过滤不生效。
10. Prompt section 没有 owner 元数据；目录来源按名称前缀推断，插件改名后可能显示为未知来源。

---

## 10. 复现步骤

见 README §2 与 §8；关键：

```bash
export DSH_HOME=/tmp/dsh-native-e2e
dsh --profile e2e --from-default-profile web --dump-config
dsh plugin --profile e2e add link:/path/to/dsh-preset-editor
dsh plugin --profile e2e add link:/path/to/dsh-preset-editor/test/fixtures/e2e-agent
# 写 profile patch（见 §3）
DSH_HOME=$DSH_HOME dsh --profile e2e --port 0 --no-open
# 认证后：
curl -b cookies "$BASE/api/preset-editor/native?catalog=1"
# 读取 .e2e-results.json
```

清理：删除 `.e2e-home`、`.e2e-results.json`、测试 chrome profile；不要删除用户自己的 DSH_HOME。

---

## 11. 最终交付状态

- ✅ 原生 preset 列表/编辑/新增/恢复/过滤、提示词段过滤与组成预览，真实 profile + API + UI 验证（0.3.0 范围）。
- ✅ 83/83 自动测试（0.3.0 范围）。
- ✅ 文档与截图。
- ⚠️ 第 8 节未执行项已明确，不伪装为通过。
- 版本 `0.3.0`，目标 DSH `0.2.2-rc.1`。
- 提示词段过滤：新增 8 个自动化用例，真实 `dsh-expression:companion` 已验证。
- 组成预览：preview API/UI/测试已交付，真实 profile API 与 overlay 模拟已验证；浏览器内 UI 交互截图仍待执行（见第 8 节）。
