window.__ModuleLoader__.load({
  id: "dsh-preset-editor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    /**
     * Browser half: a native DSH Agent-preset editor.
     *
     * It reads the same `agentPresets` roster the official UI reads, edits the
     * composition through the Host's profile-patch bridge, and exposes a
     * per-native-preset tool filter overlay. It does not define a parallel
     * preset list.
     */

    let P = {};
    try { P = require("@deepseek-ai/dsh-client-ui-primitives") || {}; } catch (_) { P = {}; }

    const NS = "preset-editor";
    const API = "/api/preset-editor/native";
    const PRESET_PANEL_ID = "preset-editor";
    const TAB_PERSONA = "persona";
    const TAB_COMPOSITION = "composition";
    const TAB_FILTER = "filter";
    const TAB_PROMPTS = "prompts";
    const TAB_PREVIEW = "preview";
    const TAB_ADVANCED = "advanced";

    const COPY = {
      zh: {
        nav: "预设管理", title: "预设管理", intro: "直接读取 DSH 原生 Agent preset：编辑人格与插件组合，或新增预设。保存写入当前 profile 的 cordis.patch.yml，由 HMR 实时重组；也可附加工具/提示词过滤并查看组成预览。",
        refresh: "刷新", retry: "重试", loading: "加载中…", loadFailed: "读取原生预设失败", listSearch: "搜索预设", backups: "备份记录", backupOn: "自动备份：开启 · {n} 份（保留 {keep}）", backupOff: "自动备份：关闭", backupTitle: "自动备份记录", backupHint: "每次写入原生 preset 或 profile patch 前自动保存旧版本；可在下方开关和调整保留份数，备份位于 $DSH_HOME/preset-editor/backups。", backupEmpty: "暂无备份", backupPolicy: "自动备份", backupConfigOff: "已由 profile 配置关闭", backupEnabledDone: "自动备份已开启", backupDisabledDone: "自动备份已关闭", backupSaving: "保存中…", backupKeepLabel: "保留", backupKeepDone: "保留份数已更新", backupKeepInvalid: "保留份数必须是 1–500 的整数", rollback: "回滚", restoreTitle: "回滚到备份", restoreBody: "确定用备份 {name} 覆盖当前配置？当前版本会先自动备份。", restoreDone: "已回滚到备份", restoreRestart: "已回滚，需重启 DSH 后生效", bytes: "字节", at: "时间", save: "保存到原生预设", saving: "写入中…", cancel: "取消", create: "新增原生预设", duplicate: "复制为自定义", reset: "恢复/删除", resetOverride: "恢复内置定义", deleteCustom: "删除自定义预设", resetConfirm: "确定移除该预设的本地覆盖/新增声明？", resetConfirmBody: "该操作会改写 profile patch；内置预设将恢复官方定义，自定义预设将从 roster 消失。正在使用它的已启动会话保留当前 revision。", remove: "确认", emptyTitle: "没有可读的原生预设", emptyBody: "当前部署没有 agentPresets 服务，或 roster 为空。", emptyCreate: "创建原生预设", name: "名称", description: "描述", id: "预设 id", idHint: "作为 Agent preset 的 config.id，也是 Session header 记录的身份；创建后不可修改。", idHelpLabel: "关于预设 id", order: "排序", personaTab: "人格", compositionTab: "插件组合", filterTab: "工具过滤", advancedTab: "高级编辑", personaTitle: "原生人格", personaHint: "这里编辑组合中 @deepseek-ai/dsh-persona 的 prefix。保存会重写该原生 preset 在 profile patch 中的完整组合；新会话使用新组合，已打开或仍驻留内存的旧会话（含空闲）保留旧 revision，直到 Host 释放 Agent 或重启 DSH。",
        completeHint: "complete（完整 system prompt）：把该 @deepseek-ai/dsh-persona 的 prefix 作为整个 system prompt，DSH 会抑制其他 prompt section。通常关闭；只有当你希望该 preset 完全接管提示词时才开启。",
        includeRuntimeContextHint: "includeRuntimeContext：让 DSH 把工作目录、沙箱策略、审批策略、委派说明等运行时上下文作为用户消息注入模型历史。默认开启；关闭可减少 token，但 Agent 可能不知道当前目录与安全策略。", personaMissing: "该 preset 没有 @deepseek-ai/dsh-persona 插件行。可在「插件组合」添加，或点击下方按钮添加一行。", addPersona: "添加人格插件行", personaPlaceholder: "用自然语言描述 Agent 的身份、语气与工作方式。", prefix: "prefix", complete: "complete（完整 system prompt）", includeRuntimeContext: "includeRuntimeContext", compositionTitle: "插件组合", compositionHint: "原生 preset 由 Cordis 插件行组成；启用/停用行等价于禁用该能力插件。保存会写入 profile patch；工具级收窄请用「工具过滤」。", yaml: "YAML 源码", yamlHint: "高级编辑：直接编辑该 preset 的 entry-list YAML（支持 !!js）。保存时优先使用 YAML。", yamlHintShort: "entry-list YAML，支持 !!js；切换保存来源不会自动转换另一侧。", sourceYaml: "保存来源：YAML", sourceStructure: "保存来源：结构化行", sourceHint: "切换只决定保存使用哪一侧；不会自动转换另一侧。编辑 YAML 会自动切到 YAML 来源。", applyYaml: "以 YAML 为准", useStructure: "以结构化行改动为准", rowGroup: "分组", rowDisabled: "已停用", rowCondition: "条件", noComposition: "没有可读的插件行。", filterTitle: "工具过滤（叠加）", filterHint: "这是叠加在原生 preset 之上的逐工具过滤，不改变原生组合。允许/排除通过 DSH tools.guard 执行拦截，并用 tools.restrict 收窄模型可见性。", filterHelpLabel: "关于工具过滤", filterMode: "过滤模式", modeAll: "不额外过滤", modeAllow: "仅允许选中的工具", modeDeny: "允许全部，但排除选中的工具", filterSave: "保存工具过滤", filterClear: "移除过滤", filterSaved: "工具过滤已保存", filterCleared: "工具过滤已移除", toolsSearch: "搜索工具", originAll: "全部来源", originMcp: "MCP", originBuiltin: "DSH 内置", originPlugin: "插件 / 未知", selectAll: "选中可视项", selectNone: "清空可视项", selectedCount: "已选 {n} / {total}", noTools: "没有匹配的工具", noToolsBody: "当前组合没有发现工具，或过滤条件过严。", missingTitle: "配置中存在但当前不可用", missingRemove: "移除", builtIn: "内置", managed: "已覆盖", custom: "自定义", external: "外部声明", defaultBadge: "默认", broken: "损坏", missing: "未加载", missingBody: "该托管定义没有被 DSH 加载；保存会把它修复为 insert 声明，或删除后重建。", repairMissing: "修复为新增声明", unsaved: "有未保存修改", unsavedSwitch: "当前修改尚未保存，切换会丢失这些修改。", discard: "放弃修改", keepEditing: "继续编辑", saved: "已写入原生预设", created: "已新增原生预设", createdRestart: "已写入 profile patch；DSH 尚未加载该预设，重启后出现在列表中。", resetDone: "已移除本地覆盖/声明", createTitle: "新增原生预设", createBody: "从现有 preset 复制一份组合作为起点，或创建空组合。id 必须唯一。", createFrom: "起点组合", createBlank: "空组合", createId: "新 preset id", createIdHint: "只能用小写字母、数字和 -，例如 diana；创建后不可修改。", createName: "显示名称", createDescription: "描述", createOrder: "排序", confirm: "确认", warnings: "加载警告", apiUnavailable: "管理接口不可用；请确认 Web 运行时与 client-connection 已加载。", stale: "配置已被其他窗口修改，请刷新后重试", nativeNotFound: "原生预设不存在", nameRequired: "名称不能为空", idRequired: "id 不能为空", idFormat: "新 preset id 只能使用小写字母、数字和 -，例如 diana。", reloadTimeout: "写入后 DSH 未完成重载，已尝试回滚", close: "关闭", current: "当前", nativeLabel: "原生预设", externalNote: "该 preset 来自外部 bundle；在其上保存会创建本地覆盖。", empty: "空", allTools: "全部工具", diagnostics: "诊断探针", noPreset: "未找到预设", filterModeAllHint: "当前不额外过滤原生 preset 的工具。", filterModeAllowHint: "仅勾选工具可见；未勾选工具在执行时也会被拦截。", filterModeDenyHint: "勾选工具会被隐藏并拦截；新工具默认允许。", statusApplied: "已实时生效", statusRestart: "需重启 DSH 后生效", unknown: "未知", railStatus: "当前状态", railComposition: "组合概览", railRows: "插件行", railTools: "可用工具", railFilter: "工具过滤", railImpact: "生效范围", railImpactHint: "保存后，新会话使用新组合；已打开或仍驻留内存的旧会话（含空闲）保留旧 revision，直到 Host 释放 Agent 或重启 DSH。未驻留的旧会话重新打开时使用当前定义。", railSource: "来源", railDefault: "默认", railOrder: "排序", railPresetId: "预设 id", railDirty: "草稿未保存", railBuiltinSource: "内置", railManagedSource: "本地覆盖", railCustomSource: "自定义", railExternalSource: "外部声明", railNoFilter: "未额外过滤", railAllowFilter: "仅允许选中", railDenyFilter: "允许但排除", railBackup: "自动备份", railBackupOn: "开启 · {n} 份", railBackupOff: "关闭", railNext: "保存后", railRunning: "运行中会话保留旧 revision",
      },
      en: {
        nav: "Preset Manager", title: "Preset Manager", intro: "Reads DSH's own Agent presets: edit the persona and plugin composition, or add a preset. Saves write a managed block into the current profile's cordis.patch.yml and let DSH HMR recompose. Tool and prompt filters, plus a composition preview, are layered on top.",
        refresh: "Refresh", retry: "Retry", loading: "Loading…", loadFailed: "Failed to read native presets", listSearch: "Search presets", backups: "Backups", backupOn: "Auto backup: on · {n} files (keep {keep})", backupOff: "Auto backup: off", backupTitle: "Automatic backup records", backupHint: "The previous version is saved before every native preset or profile patch write. Toggle backups and adjust retention below; files live under $DSH_HOME/preset-editor/backups.", backupEmpty: "No backups yet", backupPolicy: "Automatic backup", backupConfigOff: "Disabled by profile config", backupEnabledDone: "Automatic backup enabled", backupDisabledDone: "Automatic backup disabled", backupSaving: "Saving…", backupKeepLabel: "Keep", backupKeepDone: "Retention updated", backupKeepInvalid: "Retention must be an integer from 1 to 500", rollback: "Restore", restoreTitle: "Restore backup", restoreBody: "Restore {name} over the current configuration? The current version will be backed up first.", restoreDone: "Backup restored", restoreRestart: "Backup restored; restart DSH to apply", bytes: "bytes", at: "Time", save: "Save to native preset", saving: "Writing…", cancel: "Cancel", create: "New native preset", duplicate: "Duplicate as custom", reset: "Reset/Delete", resetOverride: "Reset built-in", deleteCustom: "Delete custom preset", resetConfirm: "Remove this local override/new declaration?", resetConfirmBody: "This rewrites the profile patch. A built-in returns to its shipped definition; a custom preset disappears from the roster. Running Sessions keep their current revision.", remove: "Confirm", emptyTitle: "No readable native presets", emptyBody: "This deployment has no agentPresets service, or the roster is empty.", emptyCreate: "Create native preset", name: "Name", description: "Description", id: "Preset id", idHint: "Used as the Agent preset config.id and Session header identity; immutable after creation.", idHelpLabel: "About preset id", order: "Order", personaTab: "Persona", compositionTab: "Composition", filterTab: "Tool filter", advancedTab: "Advanced", personaTitle: "Native persona", personaHint: "Edits the @deepseek-ai/dsh-persona prefix in this composition. Saving rewrites the complete composition in the profile patch; new Sessions use it, while already open or resident Sessions (including idle ones) keep the old revision until the Host releases the Agent or DSH restarts.",
        completeHint: "complete (whole system prompt): treats this @deepseek-ai/dsh-persona prefix as the entire system prompt; DSH will suppress other prompt sections. Keep it off unless this preset should fully own the prompt.",
        includeRuntimeContextHint: "includeRuntimeContext: lets DSH inject runtime context (working directory, sandbox policy, approval policy, delegation guidance) as user-role messages. On by default; turning it off saves tokens but the Agent may not know the current directory or safety policy.", personaMissing: "This preset has no @deepseek-ai/dsh-persona row. Add one below, or use the Composition tab.", addPersona: "Add persona plugin row", personaPlaceholder: "Describe the Agent's identity, tone, and working style.", prefix: "prefix", complete: "complete (whole system prompt)", includeRuntimeContext: "includeRuntimeContext", compositionTitle: "Plugin composition", compositionHint: "A native preset is a list of Cordis plugin rows; disabling a row disables that capability plugin. Saving writes the profile patch; use Tool filter for tool-level narrowing.", yaml: "YAML source", yamlHint: "Advanced: edit the preset entry-list YAML directly (!!js supported). Saving uses YAML when present.", yamlHintShort: "Entry-list YAML; !!js supported. Switching save source does not convert the other side.", sourceYaml: "Save source: YAML", sourceStructure: "Save source: structured rows", sourceHint: "Switching selects which side is saved; it does not convert the other side. Editing YAML selects the YAML source automatically.", applyYaml: "Use YAML", useStructure: "Use structured rows", rowGroup: "group", rowDisabled: "disabled", rowCondition: "condition", noComposition: "No readable plugin rows.", filterTitle: "Tool filter (overlay)", filterHint: "A per-tool filter layered over the native preset, without changing its composition. Allowed/denied calls are enforced by DSH tools.guard, and tools.restrict narrows model visibility.", filterHelpLabel: "About tool filtering", filterMode: "Filter mode", modeAll: "No extra filter", modeAllow: "Allow only selected tools", modeDeny: "Allow all except selected tools", filterSave: "Save tool filter", filterClear: "Remove filter", filterSaved: "Tool filter saved", filterCleared: "Tool filter removed", toolsSearch: "Search tools", originAll: "All sources", originMcp: "MCP", originBuiltin: "DSH built-in", originPlugin: "Plugin / unknown", selectAll: "Select visible", selectNone: "Clear visible", selectedCount: "{n} selected / {total}", noTools: "No matching tools", noToolsBody: "The composition exposes no tools, or filters are too narrow.", missingTitle: "Configured but unavailable", missingRemove: "Remove", builtIn: "Built-in", managed: "Overridden", custom: "Custom", external: "External", defaultBadge: "Default", broken: "Broken", missing: "Not loaded", missingBody: "DSH has not loaded this managed declaration. Saving repairs it as an insert declaration, or delete and recreate it.", repairMissing: "Repair as insert", unsaved: "Unsaved changes", unsavedSwitch: "Switching presets will discard unsaved changes.", discard: "Discard", keepEditing: "Keep editing", saved: "Written to native preset", created: "Native preset created", createdRestart: "Written to the profile patch; DSH has not loaded it yet. Restart to show it in the roster.", resetDone: "Local override/declaration removed", createTitle: "New native preset", createBody: "Start from a copy of an existing preset composition, or an empty composition. The id must be unique.", createFrom: "Template", createBlank: "Empty", createId: "New preset id", createIdHint: "Lowercase letters, digits and - only; e.g. diana. Immutable after creation.", createName: "Display name", createDescription: "Description", createOrder: "Order", confirm: "Confirm", warnings: "Loading warnings", apiUnavailable: "Management API unavailable; check the Web runtime and client-connection.", stale: "Configuration changed in another window; refresh and retry", nativeNotFound: "Native preset not found", nameRequired: "Name is required", idRequired: "id is required", idFormat: "New preset id must use lowercase letters, digits and - only, e.g. diana.", reloadTimeout: "DSH did not finish reloading; rollback attempted", close: "Close", current: "Current", nativeLabel: "Native preset", externalNote: "This preset comes from an external bundle; saving creates a local override.", empty: "empty", allTools: "All tools", diagnostics: "Diagnostic probe", noPreset: "Preset not found", filterModeAllHint: "No extra filtering over the native preset.", filterModeAllowHint: "Only checked tools are visible; unchecked tools are blocked at execution.", filterModeDenyHint: "Checked tools are hidden and blocked; new tools are allowed by default.", statusApplied: "Applied live", statusRestart: "Restart DSH to apply", unknown: "Unknown", railStatus: "Status", railComposition: "Composition", railRows: "Plugin rows", railTools: "Available tools", railFilter: "Tool filter", railImpact: "Apply scope", railImpactHint: "After saving, new Sessions use the new composition. Already open, resident Sessions (including idle ones) keep the old revision until the Host releases the Agent or DSH restarts. A non-resident old Session picks up the current definition when reopened.", railSource: "Source", railDefault: "Default", railOrder: "Order", railPresetId: "Preset id", railDirty: "Draft not saved", railBuiltinSource: "Built-in", railManagedSource: "Local override", railCustomSource: "Custom", railExternalSource: "External declaration", railNoFilter: "No extra filter", railAllowFilter: "Allow selected", railDenyFilter: "Allow except selected", railBackup: "Auto backup", railBackupOn: "On · {n} files", railBackupOff: "Off", railNext: "After save", railRunning: "Running Sessions keep the old revision",
      },
    };

    Object.assign(COPY.zh, {
      promptsTab: "提示词段",
      promptFilterTitle: "提示词段过滤（叠加）",
      promptFilterHint: "这是叠加在原生 preset 之上的 system prompt 段过滤。它只改变模型看到的提示词，不改变插件组合、工具权限或执行拦截。",
      promptHelpLabel: "关于提示词段过滤",
      promptMode: "过滤模式",
      promptModeAll: "不额外过滤",
      promptModeAllow: "仅保留选中的提示词段",
      promptModeDeny: "允许全部，但排除选中的提示词段",
      promptSave: "保存提示词段过滤",
      promptClear: "移除提示词段过滤",
      promptSaved: "提示词段过滤已保存",
      promptCleared: "提示词段过滤已移除",
      overlaySaved: "过滤配置已保存",
      overlayCleared: "过滤配置已移除",
      promptSearch: "搜索提示词段",
      promptOriginAll: "全部来源",
      promptOriginGlobal: "全局 / 动态",
      promptOriginPreset: "当前 preset",
      promptSelectAll: "选中可视项",
      promptSelectNone: "清空可视项",
      noPrompts: "没有匹配的提示词段",
      noPromptsBody: "当前接口没有返回 prompt section，或过滤条件过严。",
      promptProtected: "受保护",
      promptProtectedHint: "身份与人格 section 始终保留，不能通过此过滤移除。",
      promptCompleteWarning: "该 preset 的人格开启了 complete（完整 system prompt），其他提示词段会被 DSH 抑制，此过滤不会生效。",
      promptMissing: "配置中存在但当前不可用",
      promptDynamic: "动态 / 空文本",
      promptModeAllHint: "当前不额外过滤原生 preset 的提示词段。",
      promptModeAllowHint: "仅勾选提示词段保留；受保护 section 始终保留。",
      promptModeDenyHint: "勾选提示词段会被移除；新提示词段默认保留。",
      railPrompts: "提示词段过滤",
      railPromptsAll: "未额外过滤",
      railPromptsAllow: "仅保留选中",
      railPromptsDeny: "允许但排除",
      railPromptsCount: "{n} 段",
      previewTab: "组成预览",
      previewStaticBadge: "静态快照",
      previewTitle: "发送给模型的组成",
      previewHint: "只读预览：展示该 preset 的提示词段、静态运行时上下文、变量与工具声明。基于当前已加载的 preset，未保存草稿不会进入预览；不包含真实会话的消息历史、附件、cwd、沙箱、审批或当前模型。",
      previewRefresh: "刷新预览",
      previewLoading: "正在组装预览…",
      previewError: "预览加载失败",
      previewEmpty: "暂无可预览内容",
      previewRendered: "最终提示词（预览）",
      previewFullPrompt: "展开完整提示词",
      previewHideFull: "收起",
      previewSections: "提示词段",
      previewContexts: "运行时上下文",
      previewTools: "工具",
      previewVariables: "变量",
      previewChars: "{n} 字符",
      previewSectionCount: "共 {n} 段",
      previewContextCount: "{active} / {total} 个非空",
      previewToolCount: "{visible} / {total} 可见",
      previewProtected: "受保护",
      previewFiltered: "已被过滤",
      previewVisible: "模型可见",
      previewHidden: "被 overlay 隐藏",
      previewGuardOnly: "仍可见，执行会被拦截",
      previewUnknown: "可见性未知",
      previewToolSchema: "查看完整 schema",
      previewShowFull: "展开全文",
      previewContextEmpty: "空文本",
      previewStaticWarning: "这是预设级静态快照：没有真实 Agent/session，cwd、沙箱、审批等运行时 context 不会出现。",
      previewCompleteWarning: "该 preset 的人格开启了 complete；DSH 会把 complete section 恢复为唯一 prompt，其他 section 的预览可能与实际不同。",
      previewToolOverlay: "工具 overlay",
      previewNoTools: "assembly 没有返回工具声明。",
      previewNoSections: "assembly 没有返回 prompt section。",
      previewNoContexts: "没有可用的 runtime context。",
      previewPluginRows: "插件行",
      previewEnabledRows: "启用行",
      previewMcpTools: "MCP 工具",
      previewRenderedTruncated: "预览已截断，点击「展开完整提示词」查看全部。",
      previewFullTruncated: "全文超过上限，已截断。",
      previewMissing: "预设不存在或未加载",
      previewStatChars: "字符",
      previewFilteredCount: "{n} 段已过滤",
      previewHiddenCount: "{n} 个隐藏",
      previewParams: "{n} 参数",
      previewToolFilter: "工具过滤",
      previewFilterAll: "未额外过滤",
      previewFilterAllow: "仅允许 {n} 个工具",
      previewFilterAllowEmpty: "未允许任何工具",
      previewFilterDeny: "已排除 {n} 个工具",
      previewFilterDenyEmpty: "未排除任何工具",
      previewFilterDisabled: "未启用",
      previewMoreNames: "另有 {n} 个",
      previewNameSeparator: "、",
      previewCapabilitiesLine: "插件行 {plugins}，启用 {enabled}，MCP {mcp}",
      previewVariablesCount: "变量（{n}）",
      previewWarningsTitle: "需要留意",
      previewActive: "非空",
      previewFilteredHint: "该段已过滤，不会进入最终渲染。",
    });
    Object.assign(COPY.en, {
      promptsTab: "Prompt sections",
      promptFilterTitle: "Prompt section filter (overlay)",
      promptFilterHint: "Filters system prompt sections layered over the native preset. It changes only the model-visible prompt, not the plugin composition, tool permissions, or execution guards.",
      promptHelpLabel: "About prompt section filtering",
      promptMode: "Filter mode",
      promptModeAll: "No extra filter",
      promptModeAllow: "Keep only selected prompt sections",
      promptModeDeny: "Allow all except selected prompt sections",
      promptSave: "Save prompt filter",
      promptClear: "Remove prompt filter",
      promptSaved: "Prompt section filter saved",
      promptCleared: "Prompt section filter removed",
      overlaySaved: "Filters saved",
      overlayCleared: "Filters removed",
      promptSearch: "Search prompt sections",
      promptOriginAll: "All sources",
      promptOriginGlobal: "Global / dynamic",
      promptOriginPreset: "Current preset",
      promptSelectAll: "Select visible",
      promptSelectNone: "Clear visible",
      noPrompts: "No matching prompt sections",
      noPromptsBody: "The API returned no prompt sections, or filters are too narrow.",
      promptProtected: "Protected",
      promptProtectedHint: "Identity and persona sections are always kept and cannot be removed by this filter.",
      promptCompleteWarning: "This preset's persona uses complete (whole system prompt); DSH suppresses other prompt sections, so this filter will not take effect.",
      promptMissing: "Configured but unavailable",
      promptDynamic: "Dynamic / empty text",
      promptModeAllHint: "No extra filtering over the native preset's prompt sections.",
      promptModeAllowHint: "Only checked prompt sections are kept; protected sections always remain.",
      promptModeDenyHint: "Checked prompt sections are removed; new sections are allowed by default.",
      railPrompts: "Prompt filter",
      railPromptsAll: "No extra filter",
      railPromptsAllow: "Keep selected",
      railPromptsDeny: "Allow except selected",
      railPromptsCount: "{n} sections",
      previewTab: "Composition",
      previewStaticBadge: "static snapshot",
      previewTitle: "Model composition",
      previewHint: "Read-only preview of the currently loaded preset's prompt sections, static runtime contexts, variables and tool declarations. Unsaved drafts are not included. It does not include live conversation history, attachments, cwd, sandbox, approval or the current model.",
      previewRefresh: "Refresh preview",
      previewLoading: "Assembling preview…",
      previewError: "Preview failed",
      previewEmpty: "Nothing to preview",
      previewRendered: "Final system prompt (preview)",
      previewFullPrompt: "Show full prompt",
      previewHideFull: "Collapse",
      previewSections: "Prompt sections",
      previewContexts: "Runtime contexts",
      previewTools: "Tools",
      previewVariables: "Variables",
      previewChars: "{n} chars",
      previewSectionCount: "{n} sections",
      previewContextCount: "{active} / {total} active",
      previewToolCount: "{visible} / {total} visible",
      previewProtected: "Protected",
      previewFiltered: "Filtered",
      previewVisible: "Model-visible",
      previewHidden: "Hidden by overlay",
      previewGuardOnly: "Visible, guarded",
      previewUnknown: "Visibility unknown",
      previewToolSchema: "Show full schema",
      previewShowFull: "Show full text",
      previewContextEmpty: "empty",
      previewStaticWarning: "Preset-scope static snapshot: without a live Agent/session, cwd, sandbox and approval runtime contexts do not appear.",
      previewCompleteWarning: "This preset's persona uses complete; DSH restores the complete section as the sole prompt, so other sections may differ from the actual request.",
      previewToolOverlay: "Tool overlay",
      previewNoTools: "The assembly returned no tool declarations.",
      previewNoSections: "The assembly returned no prompt sections.",
      previewNoContexts: "No active runtime context.",
      previewPluginRows: "Plugin rows",
      previewEnabledRows: "Enabled rows",
      previewMcpTools: "MCP tools",
      previewRenderedTruncated: "Preview truncated; use “Show full prompt” for the complete text.",
      previewFullTruncated: "Full text exceeded the limit and was truncated.",
      previewMissing: "Preset not found or not loaded",
      previewStatChars: "chars",
      previewFilteredCount: "{n} filtered",
      previewHiddenCount: "{n} hidden",
      previewParams: "{n} params",
      previewToolFilter: "Tool filter",
      previewFilterAll: "No extra filter",
      previewFilterAllow: "Only {n} tools allowed",
      previewFilterAllowEmpty: "No tools allowed",
      previewFilterDeny: "{n} tools excluded",
      previewFilterDenyEmpty: "No tools excluded",
      previewFilterDisabled: "disabled",
      previewMoreNames: "{n} more",
      previewNameSeparator: ", ",
      previewCapabilitiesLine: "plugins {plugins}, enabled {enabled}, MCP {mcp}",
      previewVariablesCount: "Variables ({n})",
      previewWarningsTitle: "Needs attention",
      previewActive: "active",
      previewFilteredHint: "This section is filtered out of the rendered prompt.",
    });

    function fmt(template, vars) { return String(template).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] !== undefined ? String(vars[k]) : ""); }
    function formatBackupTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value || "");
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function formatBytes(value) {
      const size = Number(value);
      if (!Number.isFinite(size) || size < 0) return "—";
      if (size < 1024) return `${Math.round(size)} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function clsx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
    function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    class ApiError extends Error { constructor(message, code, details, status) { super(message); this.name = "ApiError"; this.code = code; this.details = details; this.status = status; } }
    async function api(path, options) {
      const opts = options || {};
      let response;
      try {
        response = await fetch(API + path, {
          method: opts.method || "GET", credentials: "same-origin", cache: "no-store",
          headers: opts.body === undefined ? {} : { "content-type": "application/json", "x-dsh-preset-action": "1" },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      } catch (error) { throw new ApiError(COPY.zh.apiUnavailable, "NETWORK", undefined, 0); }
      let data = {};
      try { data = await response.json(); } catch (_) { data = {}; }
      if (!response.ok || data.ok === false) throw new ApiError(data.error || response.statusText, data.code, data.details, response.status);
      return data;
    }
    function localeOf(ctx) { try { const v = ctx.locale && ctx.locale.getLocale ? ctx.locale.getLocale() : ""; return typeof v === "string" && v.toLowerCase().startsWith("en") ? "en" : "zh"; } catch (_) { return "zh"; } }
    function copyFor(ctx) { const table = COPY[localeOf(ctx)] || COPY.zh; return (key) => table[key] || COPY.zh[key] || key; }
    function registerLocale(ctx) { try { if (ctx.locale && ctx.locale.register) return ctx.locale.register(NS, COPY); } catch (_) {} return undefined; }
    function iconOf(name, size) { const c = P[name]; if (typeof c !== "function") return null; try { return React.createElement(c, { size: size || 14 }); } catch (_) { return null; } }
    function Btn(props) {
      const { variant, size, className, children, ...rest } = props;
      const tone = variant || "outline";
      const scale = size || "sm";
      const classes = clsx("dspm_btn", "dspm_btn--" + tone, "dspm_btn--" + scale, className);
      if (typeof P.Button === "function") return React.createElement(P.Button, { variant: tone, size: scale, className: classes, ...rest }, children);
      return React.createElement("button", { type: "button", className: classes, ...rest }, children);
    }
    function Toggle(props) { if (typeof P.Switch === "function") return React.createElement(P.Switch, { checked: props.checked, disabled: props.disabled, label: props.label, onChange: props.onChange }); return React.createElement("button", { type: "button", role: "switch", "aria-checked": props.checked, "aria-label": props.label, disabled: props.disabled, className: "dspm_fallbackSwitch", onClick: () => props.onChange(!props.checked) }, React.createElement("span", { className: "dspm_fallbackThumb", "data-on": props.checked ? "1" : "0" })); }
    function Badge(props) { return React.createElement("span", { className: clsx("dspm_badge", "dspm_badge_" + (props.kind || "neutral")), title: props.title }, props.children); }
    function HelpTip(props) {
      const [hover, setHover] = React.useState(false);
      const [pinned, setPinned] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const buttonRef = React.useRef(null);
      const open = hover || pinned;
      const close = () => { setHover(false); setPinned(false); };
      React.useLayoutEffect(() => {
        if (!open) { setPos(null); return undefined; }
        const update = () => {
          const button = buttonRef.current;
          if (!button) return;
          const rect = button.getBoundingClientRect();
          const field = button.closest(".dspm_field");
          const anchorBottom = field ? field.getBoundingClientRect().bottom : rect.bottom;
          const width = Math.min(280, window.innerWidth - 24);
          const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
          const top = Math.min(anchorBottom + 6, window.innerHeight - 96);
          setPos({ left, top, width });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
          window.removeEventListener("resize", update);
          window.removeEventListener("scroll", update, true);
        };
      }, [open]);
      return React.createElement("span", { className: "dspm_help" },
        React.createElement("button", {
          ref: buttonRef,
          type: "button",
          className: "dspm_helpBtn",
          "aria-label": props.label || "Help",
          "aria-expanded": open,
          title: props.label || "Help",
          onClick: (event) => { event.preventDefault(); event.stopPropagation(); setPinned((value) => !value); },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          onFocus: () => setHover(true),
          onBlur: close,
          onKeyDown: (event) => { if (event.key === "Escape") close(); },
        }, React.createElement("svg", { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
          React.createElement("circle", { cx: 12, cy: 12, r: 10 }),
          React.createElement("path", { d: "M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5" }),
          React.createElement("path", { d: "M12 17h.01" }),
        )),
        open && pos ? React.createElement("span", { className: "dspm_helpTip", role: "tooltip", style: { position: "fixed", left: pos.left, top: pos.top, width: pos.width } }, props.text) : null,
      );
    }

    function Field(props) { return React.createElement("label", { className: "dspm_field" }, React.createElement("span", { className: "dspm_labelRow" }, React.createElement("span", { className: "dspm_label" }, props.label), props.help ? React.createElement(HelpTip, { text: props.help, label: props.helpLabel, align: props.helpAlign }) : null), props.children, props.hint ? React.createElement("span", { className: "dspm_hint" }, props.hint) : null); }
    function Spinner() { return React.createElement("span", { className: "dspm_spinner", "aria-hidden": "true" }, iconOf("IconLoadingOutlineRegular", 14) || "◌"); }
    function Segmented(props) { if (typeof P.SegmentedControl === "function") return React.createElement(P.SegmentedControl, { id: props.id, value: props.value, options: props.options, onChange: props.onChange, label: props.label }); return React.createElement("div", { className: "dspm_seg", role: "tablist", "aria-label": props.label }, props.options.map((o) => React.createElement("button", { key: o.value, type: "button", role: "tab", "aria-selected": o.value === props.value, className: clsx("dspm_segBtn", o.value === props.value && "dspm_segBtnActive"), onClick: () => props.onChange(o.value) }, o.label))); }
    function Confirm(props) {
      if (!props.open) return null;
      const footer = React.createElement("div", { className: "dspm_modalFooter" }, props.cancelLabel ? React.createElement(Btn, { variant: "ghost", onClick: props.onCancel }, props.cancelLabel) : null, React.createElement(Btn, { variant: "primary", className: props.danger ? "dspm_dangerBtn" : "", disabled: props.busy, onClick: props.onConfirm }, props.confirmLabel));
      if (typeof P.Modal === "function") return React.createElement(P.Modal, { open: true, title: props.title, onClose: props.onCancel, footer, closeLabel: COPY.zh.close }, React.createElement("div", { className: "dspm_modalBody" }, props.children));
      return React.createElement("div", { className: "dspm_overlay", role: "dialog", "aria-modal": "true" }, React.createElement("div", { className: "dspm_modal" }, React.createElement("h3", { className: "dspm_modalTitle" }, props.title), React.createElement("div", { className: "dspm_modalBody" }, props.children), footer));
    }
    function Notice(props) { if (!props.notice) return null; return React.createElement("div", { className: "dspm_notice", role: "status", "data-kind": props.notice.kind }, props.notice.text, React.createElement("button", { type: "button", className: "dspm_noticeClose", "aria-label": "close", onClick: props.onClose }, "×")); }
    function originLabel(t, tool) { if (tool.origin === "mcp") return tool.server ? "MCP · " + tool.server : t("originMcp"); if (tool.origin === "builtin") return t("originBuiltin"); if (tool.origin === "transport") return "PTC"; return t("originPlugin"); }
    function isJsDisabled(value) { return value && typeof value === "object" && typeof value.__jsExpr === "string"; }
    function findPersona(plugins) { return (plugins || []).find((row) => row && row.name === "@deepseek-ai/dsh-persona"); }
    function pluginRowsOf(plugins) { return Array.isArray(plugins) ? plugins : []; }
    function repoPresetName(presets, id) { const p = (presets || []).find((x) => x.id === id); return p ? p.name : id; }

    function sourceText(t, preset) {
      if (!preset) return "";
      if (preset.missing) return t("missing");
      if (preset.mode === "create") return t("railCustomSource");
      if (preset.managed) return t("railManagedSource");
      if (preset.builtIn) return t("railBuiltinSource");
      return t("railExternalSource");
    }

    function filterText(t, overlay) {
      const mode = overlay && overlay.tools ? overlay.tools.mode : "all";
      if (mode === "allow") return t("railAllowFilter");
      if (mode === "deny") return t("railDenyFilter");
      return t("railNoFilter");
    }
    function promptFilterText(t, overlay) {
      const mode = overlay && overlay.prompts ? overlay.prompts.mode : "all";
      if (mode === "allow") return t("railPromptsAllow");
      if (mode === "deny") return t("railPromptsDeny");
      return t("railPromptsAll");
    }

    function ContextRail(props) {
      const { t, selected, draft, data, overlayDraft, catalog } = props;
      if (!selected || !draft) return null;
      const tools = (catalog.tools || []).filter((tool) => tool.origin !== "transport");
      const filter = filterText(t, overlayDraft);
      const backup = data.backup;
      const fact = (label, value) => React.createElement("div", { className: "dspm_fact" },
        React.createElement("dt", null, label),
        React.createElement("dd", null, value),
      );
      return React.createElement("aside", { className: "dspm_contextRail" },
        React.createElement("div", { className: "dspm_railBlock" },
          React.createElement("h3", null, t("railStatus")),
          React.createElement("dl", { className: "dspm_facts" },
            fact(t("railSource"), sourceText(t, selected)),
            fact(t("railDefault"), selected.isDefault ? "✓" : "—"),
            fact(t("railPresetId"), React.createElement("code", null, selected.id)),
            fact(t("railOrder"), String(draft.order)),
          ),
        ),
        React.createElement("div", { className: "dspm_railBlock" },
          React.createElement("h3", null, t("railComposition")),
          React.createElement("dl", { className: "dspm_facts" },
            fact(t("railRows"), String((draft.plugins || []).length)),
            fact(t("railTools"), String(tools.length)),
            fact(t("railFilter"), filter),
            fact(t("railPrompts"), promptFilterText(t, overlayDraft)),
          ),
        ),
        React.createElement("div", { className: "dspm_railBlock" },
          React.createElement("h3", null, t("railBackup")),
          React.createElement("p", { className: "dspm_railMuted" }, backup && backup.enabled ? fmt(t("railBackupOn"), { n: (backup.recent || []).length }) : t("railBackupOff")),
        ),
        React.createElement("div", { className: "dspm_railBlock dspm_railImpact" },
          React.createElement("h3", null, t("railImpact")),
          React.createElement("p", null, t("railImpactHint")),
        ),
        props.dirty ? React.createElement("div", { className: "dspm_railDirty" }, React.createElement("span", { className: "dspm_stateDot dspm_stateDotWarn" }), t("railDirty")) : null,
      );
    }

    function MainPanel(props) {
      return React.createElement("div", { className: "dspm_page" },
        React.createElement("div", { className: "dspm_dragBand", "data-window-drag": true, "aria-hidden": "true" }),
        React.createElement("div", { className: "dspm_pageInner" }, React.createElement(SettingsInner, props)),
      );
    }

    function SidebarIcon(props) {
      const size = props && props.size ? props.size : 16;
      return React.createElement("span", {
        className: "dspm_sidebarIcon",
        "data-dsh-plugin": "dsh-preset-editor",
        "data-dsh-part": "preset-sidebar-icon",
        "aria-hidden": "true",
      },
        iconOf("IconAgentPresetOutlineRegular", size) || iconOf("IconPersonalizationOutlineRegular", size) || React.createElement("span", null, "◈"),
      );
    }

    function SettingsInner(props) {
      const t = props.t;
      const [state, setState] = React.useState({ phase: "loading", data: null, error: null });
      const [selectedId, setSelectedId] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [yamlDraft, setYamlDraft] = React.useState("");
      const [useYaml, setUseYaml] = React.useState(false);
      const [tab, setTab] = React.useState(TAB_PERSONA);
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const [confirm, setConfirm] = React.useState(null);
      const [createOpen, setCreateOpen] = React.useState(false);
      const [backupOpen, setBackupOpen] = React.useState(false);
      const [backupBusy, setBackupBusy] = React.useState(false);
      const [backupKeepDraft, setBackupKeepDraft] = React.useState("20");
      const [create, setCreate] = React.useState({ id: "", name: "", description: "", order: 0, template: "standard" });
      const [listQuery, setListQuery] = React.useState("");
      const [toolQuery, setToolQuery] = React.useState("");
      const [toolOrigin, setToolOrigin] = React.useState("all");
      const [promptQuery, setPromptQuery] = React.useState("");
      const [promptOrigin, setPromptOrigin] = React.useState("all");
      const [overlayDraft, setOverlayDraft] = React.useState(null);
      const noticeTimer = React.useRef(undefined);
      const stateRef = React.useRef(null); const draftRef = React.useRef(null); const selectedRef = React.useRef(null); const overlayRef = React.useRef(null);
      React.useEffect(() => { stateRef.current = state.data; }, [state.data]);
      React.useEffect(() => { draftRef.current = draft; }, [draft]);
      React.useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
      React.useEffect(() => { overlayRef.current = overlayDraft; }, [overlayDraft]);

      function flash(text, kind) { if (noticeTimer.current) clearTimeout(noticeTimer.current); setNotice({ text, kind: kind || "ok" }); noticeTimer.current = setTimeout(() => setNotice(null), 4500); }
      function findPreset(source, id) { if (!source || !id) return undefined; return (source.presets || []).find((p) => p.id === id); }
      function fieldsOf(preset) { if (!preset) return null; return { name: preset.name || "", description: preset.description || "", order: Number.isSafeInteger(preset.order) ? preset.order : 0, plugins: clone(preset.plugins || []) }; }
      function dirtyOf() { return Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(fieldsOf(selected))); }
      function yamlDirtyOf() { return Boolean(selected && yamlDraft !== (selected.pluginsYaml || "")); }
      function isDirty() { return dirtyOf() || yamlDirtyOf(); }
      function overlayOf(preset) {
        const overlay = preset && preset.overlay ? clone(preset.overlay) : {};
        return {
          enabled: overlay.enabled !== false,
          tools: overlay.tools || { mode: "all", allow: [], deny: [] },
          prompts: overlay.prompts || { mode: "all", allow: [], deny: [] },
        };
      }
      function setSelectedPreset(preset) { setDraft(fieldsOf(preset)); setYamlDraft(preset.pluginsYaml || ""); setUseYaml(false); setOverlayDraft(overlayOf(preset)); setTab(TAB_PERSONA); }
      function scrollEditorIntoView() {
        if (typeof window === "undefined" || typeof document === "undefined" || !window.matchMedia("(max-width: 980px)").matches) return;
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        requestAnimationFrame(() => { const editor = document.querySelector(".dspm_editor"); if (editor) editor.scrollIntoView({ behavior, block: "start" }); });
      }
      function applySelection(id) {
        const preset = findPreset(state.data, id);
        if (!preset) return;
        setSelectedId(id);
        setSelectedPreset(preset);
        scrollEditorIntoView();
      }
      function selectPreset(id) {
        if (id === selectedId) { scrollEditorIntoView(); return; }
        const preset = findPreset(state.data, id);
        if (!preset) return;
        if (isDirty()) {
          setConfirm({ kind: "switch", nextId: id, title: t("unsaved"), body: t("unsavedSwitch"), confirmLabel: t("discard"), cancelLabel: t("keepEditing") });
          return;
        }
        applySelection(id);
      }
      function openCreate(force = false) {
        if (!force && isDirty()) {
          setConfirm({ kind: "create", title: t("unsaved"), body: t("unsavedSwitch"), confirmLabel: t("discard"), cancelLabel: t("keepEditing") });
          return;
        }
        setCreate({ id: "", name: "", description: "", order: (data.presets || []).length, template: "standard" });
        setCreateOpen(true);
      }
      async function load(options) {
        const opts = options || {};
        if (!opts.silent) setState((s) => ({ ...s, phase: s.data ? "ready" : "loading", error: null }));
        try {
          const data = await api("?catalog=1");
          const previousSelected = selectedRef.current;
          let nextId = opts.preferredId || previousSelected;
          if (!nextId || !findPreset(data, nextId)) nextId = data.defaultId || (data.presets[0] && data.presets[0].id) || null;
          setState({ phase: "ready", data, error: null }); setSelectedId(nextId);
          const preset = findPreset(data, nextId);
          setDraft(fieldsOf(preset)); setYamlDraft(preset ? preset.pluginsYaml || "" : ""); setUseYaml(false); setOverlayDraft(overlayOf(preset));
          return data;
        } catch (error) { setState((s) => ({ phase: s.data ? "ready" : "error", data: s.data, error: error.message || String(error) })); return undefined; }
      }
      React.useEffect(() => { load({}); }, []);
      const data = state.data; const selected = findPreset(data, selectedId); const catalog = data && data.catalog ? data.catalog : { tools: [] };
      const dirty = isDirty();
      const overlayDirty = Boolean(overlayDraft && selected && JSON.stringify(overlayDraft) !== JSON.stringify(overlayOf(selected)));
      React.useEffect(() => { if (backupOpen && data && data.backup && Number.isSafeInteger(data.backup.keep)) setBackupKeepDraft(String(data.backup.keep)); }, [backupOpen, data && data.backup && data.backup.keep]);
      React.useEffect(() => {
        if (!dirty) return undefined;
        const handler = (event) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
      }, [dirty]);

      function updateDraft(patch) { setDraft((current) => ({ ...current, ...patch })); }
      function resetDraft() {
        if (!selected) return;
        setDraft(fieldsOf(selected));
        setYamlDraft(selected.pluginsYaml || "");
        setUseYaml(false);
        setOverlayDraft(overlayOf(selected));
        flash(t("cancel"));
      }
      function updatePluginRow(index, patch) { setDraft((current) => { const plugins = clone(current.plugins || []); plugins[index] = { ...plugins[index], ...patch }; return { ...current, plugins }; }); }
      function removePluginRow(index) { setDraft((current) => { const plugins = clone(current.plugins || []); plugins.splice(index, 1); return { ...current, plugins }; }); }
      function addPersona() { setDraft((current) => ({ ...current, plugins: [...(current.plugins || []), { id: "persona", name: "@deepseek-ai/dsh-persona", config: { prefix: "", complete: false, includeRuntimeContext: true } }] })); setUseYaml(false); }
      function personaIndexOf() { return (draft.plugins || []).findIndex((row) => row && row.name === "@deepseek-ai/dsh-persona"); }
      function setPersonaField(field, value) { const idx = personaIndexOf(); if (idx < 0) return; setDraft((current) => { const plugins = clone(current.plugins); const row = { ...plugins[idx], config: { ...(plugins[idx].config || {}), [field]: value } }; plugins[idx] = row; return { ...current, plugins }; }); }
      async function syncGeneration() {
        try {
          const latest = await api("");
          setState((current) => current.data ? { ...current, data: { ...current.data, generation: latest.generation, backup: latest.backup ?? current.data.backup } } : current);
          return latest.generation;
        } catch {
          return data && Number.isSafeInteger(data.generation) ? data.generation : 0;
        }
      }
      async function reloadWith(id) { return await load({ preferredId: id, silent: true }); }
      async function save() {
        if (!selected || !draft || busy) return;
        if (selected.broken || selected.pluginError) { flash(selected.broken || selected.pluginError, "bad"); return; }
        if (!draft.name.trim()) { flash(t("nameRequired"), "bad"); return; }
        setBusy(true);
        try {
          const generation = await syncGeneration();
          const body = { id: selected.id, name: draft.name, description: draft.description, order: draft.order, generation };
          if (useYaml) body.pluginsYaml = yamlDraft; else body.plugins = draft.plugins;
          const result = await api("", { method: "PUT", body });
          await reloadWith(selected.id);
          flash(result.application === "restart-required" ? t("statusRestart") : t("saved"));
        } catch (error) { await syncGeneration(); flash(error.code === "STALE" ? t("stale") : (error.message || String(error)), "bad"); }
        finally { setBusy(false); }
      }
      function askReset() { if (!selected || busy) return; setConfirm({ kind: "reset", title: t("reset"), body: t("resetConfirmBody"), confirmLabel: t("remove"), cancelLabel: t("cancel"), danger: true, id: selected.id, mode: selected.mode }); }
      async function performReset() {
        if (!confirm || confirm.kind !== "reset") return;
        setBusy(true);
        try { const generation = await syncGeneration(); const result = await api("", { method: "DELETE", body: { id: confirm.id, generation } }); setConfirm(null); await load({ silent: true }); flash(result.removed === false ? t("empty") : (result.application === "restart-required" ? t("statusRestart") : t("resetDone"))); }
        catch (error) { await syncGeneration(); flash(error.message || String(error), "bad"); }
        finally { setBusy(false); }
      }
      async function setBackupPolicy(enabled) {
        if (backupBusy || !data || !data.backup || data.backup.configEnabled === false) return;
        setBackupBusy(true);
        try {
          const result = await api("/backups/policy", { method: "PUT", body: { enabled } });
          setState((current) => current.data ? { ...current, data: { ...current.data, backup: { ...current.data.backup, enabled: result.enabled, configEnabled: result.configEnabled, keep: result.keep ?? current.data.backup.keep } } } : current);
          flash(enabled ? t("backupEnabledDone") : t("backupDisabledDone"));
        } catch (error) {
          flash(error.message || String(error), "bad");
        } finally {
          setBackupBusy(false);
        }
      }

      async function setBackupKeep() {
        if (!data || !data.backup || backupBusy) return;
        const keep = Number(backupKeepDraft);
        if (!Number.isSafeInteger(keep) || keep < 1 || keep > 500) { flash(t("backupKeepInvalid"), "bad"); setBackupKeepDraft(String(data.backup.keep || 20)); return; }
        if (keep === data.backup.keep) return;
        setBackupBusy(true);
        try {
          const result = await api("/backups/policy", { method: "PUT", body: { keep } });
          setState((current) => current.data ? { ...current, data: { ...current.data, backup: { ...current.data.backup, enabled: result.enabled, configEnabled: result.configEnabled, keep: result.keep } } } : current);
          flash(t("backupKeepDone"));
        } catch (error) { flash(error.message || String(error), "bad"); }
        finally { setBackupBusy(false); }
      }

      async function performRestore() {
        if (!confirm || confirm.kind !== "restore") return;
        const names = confirm.names || (confirm.name ? [confirm.name] : []);
        setBusy(true);
        try {
          await syncGeneration();
          const result = await api("/backups/restore", { method: "POST", body: { names } });
          setConfirm(null);
          await load({ silent: true });
          flash(result.application === "restart-required" ? t("restoreRestart") : t("restoreDone"));
        } catch (error) {
          await syncGeneration();
          flash(error.message || String(error), "bad");
        } finally {
          setBusy(false);
        }
      }

      function resolveConfirm() {
        if (!confirm) return;
        if (confirm.kind === "reset") { performReset(); return; }
        if (confirm.kind === "restore") { performRestore(); return; }
        const nextId = confirm.nextId;
        const kind = confirm.kind;
        setConfirm(null);
        if (kind === "switch" && nextId) applySelection(nextId);
        else if (kind === "create") openCreate(true);
      }
      async function saveOverlay() {
        if (!selected || !overlayDraft || busy) return;
        setBusy(true);
        try { const generation = await syncGeneration(); await api("/overlay", { method: "PUT", body: { id: selected.id, ...overlayDraft, generation } }); await reloadWith(selected.id); flash(t("overlaySaved")); }
        catch (error) { await syncGeneration(); flash(error.message || String(error), "bad"); }
        finally { setBusy(false); }
      }
      async function resetFilterPart(part) {
        if (!selected || !overlayDraft || busy) return;
        if ((overlayDraft[part]?.mode ?? "all") === "all") return;
        setBusy(true);
        try {
          const generation = await syncGeneration();
          const next = { ...overlayDraft, [part]: { mode: "all", allow: [], deny: [] } };
          const toolsMode = next.tools?.mode ?? "all";
          const promptsMode = next.prompts?.mode ?? "all";
          if (toolsMode === "all" && promptsMode === "all") {
            await api("/overlay", { method: "DELETE", body: { id: selected.id, generation } });
            flash(t("overlayCleared"));
          } else {
            await api("/overlay", { method: "PUT", body: { id: selected.id, ...next, generation } });
            flash(part === "prompts" ? t("promptCleared") : t("filterCleared"));
          }
          await reloadWith(selected.id);
        } catch (error) { await syncGeneration(); flash(error.message || String(error), "bad"); }
        finally { setBusy(false); }
      }
      async function createPreset() {
        if (busy) return;
        if (!create.id.trim() || !create.name.trim()) { flash(!create.id.trim() ? t("idRequired") : t("nameRequired"), "bad"); return; }
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(create.id.trim())) { flash(t("idFormat"), "bad"); return; }
        const template = findPreset(data, create.template);
        const plugins = create.template === "__blank__" ? [] : clone(template ? template.plugins : []);
        setBusy(true);
        try {
          const generation = await syncGeneration();
          const result = await api("", { method: "POST", body: { id: create.id.trim(), name: create.name.trim(), description: create.description, order: create.order, plugins, generation } });
          setCreateOpen(false);
          const loaded = await reloadWith(result.preset.id);
          const present = findPreset(loaded, result.preset.id);
          if (result.application === "restart-required" || !present) flash(t("createdRestart"));
          else flash(t("created"));
        } catch (error) { await syncGeneration(); flash(error.message || String(error), "bad"); }
        finally { setBusy(false); }
      }
      function switchOverlayMode(mode) { setOverlayDraft((current) => ({ ...current, tools: { ...current.tools, mode } })); }
      function toggleOverlayTool(name, checked) { setOverlayDraft((current) => { const key = current.tools.mode === "allow" ? "allow" : "deny"; const set = new Set(current.tools[key] || []); if (checked) set.add(name); else set.delete(name); return { ...current, tools: { ...current.tools, [key]: [...set] } }; }); }
      function setAllVisible(tools, checked) { setOverlayDraft((current) => { if (current.tools.mode === "all") return current; const key = current.tools.mode === "allow" ? "allow" : "deny"; const set = new Set(current.tools[key] || []); for (const tool of tools) { if (checked) set.add(tool.name); else set.delete(tool.name); } return { ...current, tools: { ...current.tools, [key]: [...set] } }; }); }
      function switchPromptMode(mode) { setOverlayDraft((current) => ({ ...current, prompts: { ...current.prompts, mode } })); }
      function togglePromptSection(name, checked) { setOverlayDraft((current) => { const key = current.prompts.mode === "allow" ? "allow" : "deny"; const set = new Set(current.prompts[key] || []); if (checked) set.add(name); else set.delete(name); return { ...current, prompts: { ...current.prompts, [key]: [...set] } }; }); }
      function setAllPromptSections(rows, checked) { setOverlayDraft((current) => { if (current.prompts.mode === "all") return current; const key = current.prompts.mode === "allow" ? "allow" : "deny"; const set = new Set(current.prompts[key] || []); for (const row of rows) { if (row.protected) continue; if (checked) set.add(row.name); else set.delete(row.name); } return { ...current, prompts: { ...current.prompts, [key]: [...set] } }; }); }

      if (state.phase === "loading") return React.createElement("div", { className: "dspm_root dspm_center" }, React.createElement(Spinner, null), React.createElement("span", null, t("loading")));
      if (state.phase === "error") return React.createElement("div", { className: "dspm_root" }, React.createElement("div", { className: "dspm_error" }, React.createElement("strong", null, t("loadFailed")), React.createElement("p", null, state.error || t("apiUnavailable")), React.createElement(Btn, { variant: "primary", onClick: () => load({}) }, t("retry"))));
      const warnings = (data && data.warnings) || [];
      const list = (data && data.presets ? data.presets : []).filter((preset) => { const q = listQuery.trim().toLowerCase(); return !q || (preset.name || "").toLowerCase().includes(q) || preset.id.toLowerCase().includes(q); });
      return React.createElement("div", { className: "dspm_root" },
        React.createElement("div", { className: "dspm_header" },
          React.createElement("div", { className: "dspm_titleBlock" },
            React.createElement("span", { className: "dspm_titleMark", "aria-hidden": "true" }),
            React.createElement("div", null, React.createElement("h1", { className: "dspm_title" }, t("title")), React.createElement("p", { className: "dspm_intro" }, t("intro"))),
          ),
          React.createElement("div", { className: "dspm_headerActions" },
            React.createElement("span", { className: "dspm_backupStatus" }, data.backup && data.backup.enabled ? fmt(t("backupOn"), { n: (data.backup.recent || []).length, keep: data.backup.keep }) : t("backupOff")),
            React.createElement(Btn, { variant: "ghost", onClick: () => setBackupOpen(true), disabled: !data.backup || !data.backup.enabled }, t("backups")),
            React.createElement(Btn, { variant: "ghost", onClick: () => load({ preferredId: selectedId, silent: true }) }, t("refresh")),
            React.createElement(Btn, { variant: "primary", onClick: openCreate, disabled: busy }, t("create")))),
        warnings.length > 0 ? React.createElement("div", { className: "dspm_warnings" }, React.createElement("strong", null, t("warnings")), React.createElement("ul", null, warnings.map((w, i) => React.createElement("li", { key: i }, w)))) : null,
        React.createElement(Notice, { notice, onClose: () => setNotice(null) }),
        React.createElement("div", { className: "dspm_layout" },
          React.createElement("aside", { className: "dspm_list dspm_spine" },
            React.createElement("div", { className: "dspm_search" }, React.createElement("span", { className: "dspm_searchIcon" }, iconOf("IconSearchOutlineRegular", 14) || "⌕"), React.createElement("input", { className: "dspm_input dspm_searchInput", value: listQuery, placeholder: t("listSearch"), "aria-label": t("listSearch"), onChange: (e) => setListQuery(e.currentTarget.value) })),
            list.length === 0 ? React.createElement("div", { className: "dspm_listEmpty" }, (data.presets || []).length === 0 ? t("emptyBody") : t("noPreset")) : list.map((preset) => React.createElement("button", { key: preset.id, type: "button", className: clsx("dspm_listItem", preset.id === selectedId && "dspm_listItemActive"), onClick: () => selectPreset(preset.id) },
              React.createElement("span", { className: "dspm_listTop" }, React.createElement("span", { className: "dspm_listName" }, preset.name), preset.isDefault ? React.createElement(Badge, { kind: "brand" }, t("defaultBadge")) : null, preset.missing ? React.createElement(Badge, { kind: "bad" }, t("missing")) : preset.managed ? React.createElement(Badge, { kind: "warn" }, preset.mode === "create" ? t("custom") : t("managed")) : preset.builtIn ? React.createElement(Badge, { kind: "muted" }, t("builtIn")) : null, preset.broken ? React.createElement(Badge, { kind: "bad" }, t("broken")) : null),
              React.createElement("span", { className: "dspm_listDesc" }, preset.description || preset.id),
              React.createElement("span", { className: "dspm_listMeta" }, React.createElement("span", { className: clsx("dspm_stateDot", preset.broken ? "dspm_stateDotOff" : "dspm_stateDotOn") }), React.createElement("span", null, preset.id), preset.overlay && preset.overlay.tools && preset.overlay.tools.mode !== "all" ? React.createElement("span", null, " · " + t("filterTab")) : null),
            )),
            React.createElement("div", { className: "dspm_listFooter" }, React.createElement(Btn, { variant: "ghost", onClick: openCreate, disabled: busy }, t("create")))),
          React.createElement("section", { className: "dspm_editor" },
            !selected || !draft ? React.createElement("div", { className: "dspm_empty" }, React.createElement("h3", null, t("emptyTitle")), React.createElement("p", null, t("emptyBody"))) : React.createElement(Editor, { t, data, selected, draft, dirty, tab, setTab, busy, updateDraft, resetDraft, updatePluginRow, removePluginRow, addPersona, setPersonaField, yamlDraft, setYamlDraft, useYaml, setUseYaml, save, askReset, overlayDraft, overlayDirty, saveOverlay, resetFilterPart, switchOverlayMode, toggleOverlayTool, setAllVisible, toolQuery, setToolQuery, toolOrigin, setToolOrigin, switchPromptMode, togglePromptSection, setAllPromptSections, promptQuery, setPromptQuery, promptOrigin, setPromptOrigin, catalog })),
          React.createElement(ContextRail, { t, selected, draft, data, overlayDraft, catalog, dirty }),
        ),
        React.createElement(Confirm, { open: Boolean(confirm), title: confirm ? confirm.title : "", confirmLabel: confirm ? confirm.confirmLabel : "", cancelLabel: confirm ? confirm.cancelLabel : "", danger: Boolean(confirm && confirm.danger), busy, onCancel: () => setConfirm(null), onConfirm: resolveConfirm }, React.createElement("p", null, confirm ? confirm.body : "")),
        React.createElement(Confirm, { open: backupOpen, title: t("backupTitle"), confirmLabel: t("close"), cancelLabel: "", busy: false, onCancel: () => setBackupOpen(false), onConfirm: () => setBackupOpen(false) },
          React.createElement("div", { className: "dspm_backupPolicy" },
            React.createElement("span", { className: "dspm_label" }, t("backupPolicy")),
            React.createElement(Toggle, { checked: Boolean(data.backup && data.backup.enabled), disabled: backupBusy || !data.backup || data.backup.configEnabled === false, label: t("backupPolicy"), onChange: setBackupPolicy }),
            React.createElement("span", { className: "dspm_hint" }, backupBusy ? t("backupSaving") : data.backup && data.backup.configEnabled === false ? t("backupConfigOff") : (data.backup && data.backup.enabled ? fmt(t("backupOn"), { n: data.backup.recent ? data.backup.recent.length : 0, keep: data.backup.keep }) : t("backupOff"))),
            React.createElement("label", { className: "dspm_backupKeep" },
              React.createElement("span", { className: "dspm_hint" }, t("backupKeepLabel")),
              React.createElement("input", { className: "dspm_input dspm_keepInput", type: "number", min: 1, max: 500, value: backupKeepDraft, disabled: backupBusy, onChange: (event) => setBackupKeepDraft(event.currentTarget.value), onBlur: setBackupKeep, onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); setBackupKeep(); } } }),
            ),
          ),
          React.createElement("p", { className: "dspm_hintBlock" }, t("backupHint")),
          !(data.backup && data.backup.recent && data.backup.recent.length) ? React.createElement("p", { className: "dspm_muted" }, t("backupEmpty")) : React.createElement("div", { className: "dspm_backupList" }, data.backup.recent.map((item) => React.createElement("div", { key: item.name, className: "dspm_backupRow" },
            React.createElement("div", { className: "dspm_backupTop" },
              React.createElement(Badge, { kind: item.kinds && item.kinds.includes("patch") ? "neutral" : "warn" }, item.kinds ? item.kinds.join(" + ") : item.kind),
              React.createElement("span", { className: "dspm_toolName" }, formatBackupTime(item.at)),
            ),
            React.createElement("div", { className: "dspm_backupBottom" }, React.createElement("span", { className: "dspm_muted" }, (item.files ? item.files.length : 1) + " files · " + formatBytes(item.bytes)),
              React.createElement(Btn, { variant: "ghost", className: "dspm_dangerBtn", onClick: () => { setBackupOpen(false); const files = item.files || [item.name]; setConfirm({ kind: "restore", names: files, title: t("restoreTitle"), body: fmt(t("restoreBody"), { name: formatBackupTime(item.at) }), confirmLabel: t("rollback"), cancelLabel: t("cancel") }); } }, t("rollback")),
            ),
          ))),
        ),
        React.createElement(Confirm, { open: createOpen, title: t("createTitle"), confirmLabel: t("create"), cancelLabel: t("cancel"), busy, onCancel: () => setCreateOpen(false), onConfirm: createPreset },
          React.createElement("p", null, t("createBody")),
          React.createElement("div", { className: "dspm_grid2" },
            React.createElement(Field, { label: t("createFrom") }, React.createElement("select", { className: "dspm_input", value: create.template, onChange: (e) => setCreate({ ...create, template: e.currentTarget.value }) }, React.createElement("option", { value: "__blank__" }, t("createBlank")), (data.presets || []).map((p) => React.createElement("option", { key: p.id, value: p.id }, p.name + " (" + p.id + ")"))),),
            React.createElement(Field, { label: t("createOrder") }, React.createElement("input", { className: "dspm_input", type: "number", value: create.order, onChange: (e) => setCreate({ ...create, order: Number(e.currentTarget.value) }) })),
          ),
          React.createElement(Field, { label: t("createId"), hint: t("createIdHint") }, React.createElement("input", { className: "dspm_input", value: create.id, placeholder: "my-preset", onChange: (e) => setCreate({ ...create, id: e.currentTarget.value }) })),
          React.createElement(Field, { label: t("createName") }, React.createElement("input", { className: "dspm_input", value: create.name, onChange: (e) => setCreate({ ...create, name: e.currentTarget.value }) })),
          React.createElement(Field, { label: t("createDescription") }, React.createElement("input", { className: "dspm_input", value: create.description, onChange: (e) => setCreate({ ...create, description: e.currentTarget.value }) })),
        ),
      );
    }

    function Editor(props) {
      const { t, data, selected, draft, dirty, tab, setTab, busy, updateDraft, resetDraft, updatePluginRow, removePluginRow, addPersona, setPersonaField, yamlDraft, setYamlDraft, useYaml, setUseYaml, save, askReset, overlayDraft, overlayDirty, saveOverlay, resetFilterPart, switchOverlayMode, toggleOverlayTool, setAllVisible, toolQuery, setToolQuery, toolOrigin, setToolOrigin, switchPromptMode, togglePromptSection, setAllPromptSections, promptQuery, setPromptQuery, promptOrigin, setPromptOrigin, catalog } = props;
      const personaIndex = personaIndexOf(draft.plugins || []);
      const persona = personaIndex >= 0 ? draft.plugins[personaIndex] : null;
      const personaConfig = persona && persona.config ? persona.config : {};
      const tools = (catalog.tools || []).filter((tool) => tool.origin !== "transport");
      const overlayTools = overlayDraft ? overlayDraft.tools : { mode: "all", allow: [], deny: [] };
      const selectedNames = new Set(overlayTools.mode === "allow" ? overlayTools.allow : overlayTools.deny);
      const query = toolQuery.trim().toLowerCase();
      const filtered = tools.filter((tool) => { if (toolOrigin !== "all" && tool.origin !== toolOrigin) return false; if (!query) return true; return tool.name.toLowerCase().includes(query) || (tool.description || "").toLowerCase().includes(query); });
      const promptSections = catalog.promptSections || [];
      const overlayPrompts = overlayDraft ? overlayDraft.prompts : { mode: "all", allow: [], deny: [] };
      const selectedPrompts = new Set(overlayPrompts.mode === "allow" ? overlayPrompts.allow : overlayPrompts.deny);
      const promptQ = promptQuery.trim().toLowerCase();
      const filteredPrompts = promptSections.filter((section) => {
        if (promptOrigin === "global" && !(section.availableIn || []).includes("global")) return false;
        if (promptOrigin === "preset" && !(section.availableIn || []).includes(`agent-preset:${selected.id}`)) return false;
        if (!promptQ) return true;
        return section.name.toLowerCase().includes(promptQ) || (section.preview || "").toLowerCase().includes(promptQ);
      });
      const tabs = [{ id: TAB_PERSONA, value: TAB_PERSONA, label: t("personaTab") }, { id: TAB_COMPOSITION, value: TAB_COMPOSITION, label: t("compositionTab") }, { id: TAB_FILTER, value: TAB_FILTER, label: t("filterTab") }, { id: TAB_PROMPTS, value: TAB_PROMPTS, label: t("promptsTab") }, { id: TAB_PREVIEW, value: TAB_PREVIEW, label: t("previewTab") }, { id: TAB_ADVANCED, value: TAB_ADVANCED, label: t("advancedTab") }];
      return React.createElement("div", { className: "dspm_editorInner" },
        React.createElement("div", { className: "dspm_identity" },
          React.createElement("div", { className: "dspm_identityMain" },
            React.createElement("div", { className: "dspm_identityTitleRow" },
              React.createElement("h2", { className: "dspm_identityTitle" }, draft.name || selected.name),
              React.createElement("code", { className: "dspm_identityId" }, selected.id),
              selected.missing ? React.createElement(Badge, { kind: "bad" }, t("missing")) : selected.managed ? React.createElement(Badge, { kind: "warn" }, selected.mode === "create" ? t("custom") : t("managed")) : selected.builtIn ? React.createElement(Badge, { kind: "muted" }, t("builtIn")) : null,
              (selected.broken || selected.pluginError) ? React.createElement(Badge, { kind: "bad" }, t("broken")) : null,
              dirty ? React.createElement(Badge, { kind: "warn" }, t("unsaved")) : null,
            ),
            React.createElement("p", { className: "dspm_identityDesc" }, draft.description || ""),
          ),
          React.createElement("div", { className: "dspm_identityActions" },
            (selected.managed || selected.mode === "create") ? React.createElement(Btn, { variant: "ghost", onClick: askReset, disabled: busy }, selected.mode === "create" ? t("deleteCustom") : t("resetOverride")) : null,
            React.createElement(Btn, { variant: "ghost", onClick: resetDraft, disabled: busy || !dirty }, t("cancel")),
            React.createElement(Btn, { variant: "primary", onClick: save, disabled: busy || !dirty || Boolean(selected.broken || selected.pluginError) }, busy ? t("saving") : t("save")),
          ),
        ),
        (selected.broken || selected.pluginError) ? React.createElement("div", { className: "dspm_banner dspm_bannerWarn" }, selected.broken || selected.pluginError) : null,
        selected.missing ? React.createElement("div", { className: "dspm_banner dspm_bannerWarn dspm_bannerAction" },
          React.createElement("span", null, t("missingBody")),
          React.createElement(Btn, { variant: "primary", onClick: save, disabled: busy }, t("repairMissing")),
        ) : null,
        selected.mode === "external" && !selected.managed ? React.createElement("div", { className: "dspm_banner" }, t("externalNote")) : null,
        React.createElement("div", { className: "dspm_metaGrid" },
          React.createElement(Field, { label: t("name") }, React.createElement("input", { className: "dspm_input", value: draft.name, maxLength: 80, onChange: (e) => updateDraft({ name: e.currentTarget.value }) })),
          React.createElement(Field, { label: t("description") }, React.createElement("input", { className: "dspm_input", value: draft.description || "", maxLength: 500, onChange: (e) => updateDraft({ description: e.currentTarget.value }) })),
          React.createElement(Field, { label: t("id"), help: t("idHint"), helpLabel: t("idHelpLabel"), helpAlign: "right" }, React.createElement("input", { className: "dspm_input", value: selected.id, readOnly: true })),
          React.createElement(Field, { label: t("order") }, React.createElement("input", { className: "dspm_input", type: "number", value: draft.order, onChange: (e) => updateDraft({ order: Number(e.currentTarget.value) }) })),
        ),
        React.createElement("div", { className: "dspm_tabBar", role: "tablist", "aria-label": t("title") },
          tabs.map((item) => React.createElement("button", {
            key: item.value,
            type: "button",
            role: "tab",
            "aria-selected": tab === item.value,
            className: clsx("dspm_tab", tab === item.value && "dspm_tabActive"),
            onClick: () => setTab(item.value),
          }, item.label)),
        ),
        React.createElement("div", { className: "dspm_tabBody", "data-tab": tab },
          tab === TAB_PERSONA ? React.createElement("div", { className: "dspm_section" },
            React.createElement("div", { className: "dspm_sectionHead" }, React.createElement("h4", null, t("personaTitle")), persona ? React.createElement("span", { className: "dspm_count" }, "@deepseek-ai/dsh-persona") : null),
            React.createElement("p", { className: "dspm_hintBlock" }, t("personaHint")),
            persona ? React.createElement("div", { className: "dspm_field" },
              React.createElement("span", { className: "dspm_label" }, t("prefix")),
              React.createElement("textarea", { className: "dspm_textarea", value: typeof personaConfig.prefix === "string" ? personaConfig.prefix : "", placeholder: t("personaPlaceholder"), "aria-label": t("personaTitle"), onChange: (e) => setPersonaField("prefix", e.currentTarget.value) }),
            ) : React.createElement("div", { className: "dspm_empty" }, React.createElement("p", null, t("personaMissing")), React.createElement(Btn, { variant: "primary", onClick: addPersona }, t("addPersona"))),
            persona ? React.createElement("div", { className: "dspm_grid2" },
              React.createElement("label", { className: "dspm_enable" }, React.createElement("input", { type: "checkbox", checked: personaConfig.complete === true, onChange: (e) => setPersonaField("complete", e.currentTarget.checked) }), React.createElement("span", null, t("complete"))),
              React.createElement("label", { className: "dspm_enable" }, React.createElement("input", { type: "checkbox", checked: personaConfig.includeRuntimeContext !== false, onChange: (e) => setPersonaField("includeRuntimeContext", e.currentTarget.checked) }), React.createElement("span", null, t("includeRuntimeContext"))),
            ) : null,
            persona ? React.createElement("div", { className: "dspm_hintStack" },
              React.createElement("p", { className: "dspm_hintBlock" }, t("completeHint")),
              React.createElement("p", { className: "dspm_hintBlock" }, t("includeRuntimeContextHint")),
            ) : null,
          ) : tab === TAB_COMPOSITION ? React.createElement("div", { className: "dspm_section" },
            React.createElement("div", { className: "dspm_sectionHead" }, React.createElement("h4", null, t("compositionTitle")), React.createElement("span", { className: "dspm_count" }, (draft.plugins || []).length + " rows")),
            React.createElement("p", { className: "dspm_hintBlock" }, t("compositionHint")),
            React.createElement("div", { className: "dspm_rowTree" }, (draft.plugins || []).map((row, index) => React.createElement(PluginRow, { key: (row.id || row.name || "row") + ":" + index, t, row, index, updatePluginRow, removePluginRow }))),
          ) : tab === TAB_PROMPTS ? React.createElement(PromptFilterPane, {
            t,
            selected,
            overlayDraft,
            busy,
            overlayDirty,
            saveOverlay,
            resetFilterPart,
            switchPromptMode,
            togglePromptSection,
            setAllPromptSections,
            promptQuery,
            setPromptQuery,
            promptOrigin,
            setPromptOrigin,
            promptSections,
            filteredPrompts,
            selectedPrompts,
            overlayPrompts,
            complete: Boolean(personaConfig.complete),
          }) : tab === TAB_PREVIEW ? React.createElement(PreviewPane, { key: selected.id, t, selected }) : tab === TAB_ADVANCED ? React.createElement("div", { className: "dspm_section dspm_advancedPane" },
            React.createElement("div", { className: "dspm_advancedBar" },
              React.createElement("div", { className: "dspm_advancedTitle" }, React.createElement("h4", null, t("yaml")), React.createElement(Badge, { kind: useYaml ? "mcp" : "muted" }, useYaml ? t("sourceYaml") : t("sourceStructure")), React.createElement("span", { className: "dspm_hint" }, t("yamlHintShort"))),
              React.createElement("div", { className: "dspm_tabsLine" },
                React.createElement(Btn, { variant: "ghost", className: !useYaml ? "dspm_sourceActive" : "", "aria-pressed": !useYaml, title: t("sourceHint"), onClick: () => setUseYaml(false) }, t("useStructure")),
                React.createElement(Btn, { variant: "ghost", className: useYaml ? "dspm_sourceActive" : "", "aria-pressed": useYaml, title: t("sourceHint"), onClick: () => setUseYaml(true) }, t("applyYaml")),
              ),
            ),
            React.createElement("div", { className: "dspm_yamlFrame" }, React.createElement("textarea", { className: "dspm_textarea dspm_yaml", value: yamlDraft, spellCheck: false, "aria-label": t("yaml"), onChange: (e) => { setYamlDraft(e.currentTarget.value); setUseYaml(true); } })),
          ) : React.createElement("div", { className: "dspm_section dspm_filterPane" },
            React.createElement("div", { className: "dspm_filterHeader" },
            React.createElement("div", { className: "dspm_filterTop" },
              React.createElement("div", { className: "dspm_sectionHead" },
                React.createElement("div", { className: "dspm_filterTitleRow" },
                  React.createElement("h4", null, t("filterTitle")),
                  React.createElement(HelpTip, { text: t("filterHint"), label: t("filterHelpLabel") }),
                ),
                React.createElement("span", { className: "dspm_count" }, fmt(t("selectedCount"), { n: selectedNames.size, total: tools.length })),
              ),
              React.createElement("div", { className: "dspm_editorActions dspm_filterActions" },
                React.createElement(Btn, { variant: "primary", onClick: saveOverlay, disabled: busy || !overlayDirty }, t("filterSave")),
                React.createElement(Btn, { variant: "ghost", onClick: () => resetFilterPart("tools"), disabled: busy || overlayTools.mode === "all" }, t("filterClear")),
              ),
            ),
            React.createElement("div", { className: "dspm_filterModeRow" },
              React.createElement("span", { className: "dspm_label" }, t("filterMode")),
              React.createElement("select", { className: "dspm_input", value: overlayTools.mode, onChange: (e) => switchOverlayMode(e.currentTarget.value) }, React.createElement("option", { value: "all" }, t("modeAll")), React.createElement("option", { value: "allow" }, t("modeAllow")), React.createElement("option", { value: "deny" }, t("modeDeny"))),
              React.createElement("span", { className: "dspm_hint" }, overlayTools.mode === "all" ? t("filterModeAllHint") : overlayTools.mode === "allow" ? t("filterModeAllowHint") : t("filterModeDenyHint")),
            ),
            React.createElement("div", { className: "dspm_toolbar" },
              React.createElement("div", { className: "dspm_search dspm_grow" }, React.createElement("span", { className: "dspm_searchIcon" }, iconOf("IconSearchOutlineRegular", 14) || "⌕"), React.createElement("input", { className: "dspm_input dspm_searchInput", value: toolQuery, placeholder: t("toolsSearch"), "aria-label": t("toolsSearch"), onChange: (e) => setToolQuery(e.currentTarget.value) })),
              React.createElement("select", { className: "dspm_input dspm_originSelect", value: toolOrigin, "aria-label": t("originAll"), onChange: (e) => setToolOrigin(e.currentTarget.value) }, React.createElement("option", { value: "all" }, t("originAll")), React.createElement("option", { value: "mcp" }, t("originMcp")), React.createElement("option", { value: "builtin" }, t("originBuiltin")), React.createElement("option", { value: "plugin" }, t("originPlugin"))),
              React.createElement(Btn, { variant: "ghost", disabled: overlayTools.mode === "all", onClick: () => setAllVisible(filtered, true) }, t("selectAll")), React.createElement(Btn, { variant: "ghost", disabled: overlayTools.mode === "all", onClick: () => setAllVisible(filtered, false) }, t("selectNone")),
            ),
            ),
            filtered.length === 0 ? React.createElement("div", { className: "dspm_empty" }, React.createElement("h3", null, t("noTools")), React.createElement("p", null, t("noToolsBody"))) : React.createElement("div", { className: "dspm_toolList" }, filtered.map((tool) => React.createElement("label", { key: tool.name, className: clsx("dspm_toolRow", selectedNames.has(tool.name) && "dspm_toolRowChecked") }, React.createElement("input", { type: "checkbox", className: "dspm_check", checked: selectedNames.has(tool.name), disabled: overlayTools.mode === "all", onChange: (e) => toggleOverlayTool(tool.name, e.currentTarget.checked) }), React.createElement("span", { className: "dspm_toolMain" }, React.createElement("span", { className: "dspm_toolName" }, tool.name), React.createElement("span", { className: "dspm_toolDesc" }, tool.description || ""), React.createElement("span", { className: "dspm_toolMeta" }, React.createElement(Badge, { kind: tool.origin === "mcp" ? "mcp" : tool.origin === "builtin" ? "brand" : "neutral" }, originLabel(t, tool)), tool.availableIn && tool.availableIn.length ? React.createElement("span", { className: "dspm_avail" }, tool.availableIn.map((id) => id.startsWith("agent-preset:") ? id.slice(13) : "global").join(", ")) : null))))),
          ),
        ),
      );
    }

    function PromptFilterPane(props) {
      const { t, selected, overlayDraft, busy, overlayDirty, saveOverlay, resetFilterPart, switchPromptMode, togglePromptSection, setAllPromptSections, promptQuery, setPromptQuery, promptOrigin, setPromptOrigin, promptSections, filteredPrompts, selectedPrompts, overlayPrompts, complete } = props;
      const mode = overlayPrompts.mode;
      return React.createElement("div", { className: "dspm_section dspm_filterPane" },
        React.createElement("div", { className: "dspm_filterHeader" },
          React.createElement("div", { className: "dspm_filterTop" },
            React.createElement("div", { className: "dspm_sectionHead" },
              React.createElement("div", { className: "dspm_filterTitleRow" },
                React.createElement("h4", null, t("promptFilterTitle")),
                React.createElement(HelpTip, { text: t("promptFilterHint"), label: t("promptHelpLabel") }),
              ),
              React.createElement("span", { className: "dspm_count" }, fmt(t("selectedCount"), { n: selectedPrompts.size, total: promptSections.length })),
            ),
            React.createElement("div", { className: "dspm_editorActions dspm_filterActions" },
              React.createElement(Btn, { variant: "primary", onClick: saveOverlay, disabled: busy || !overlayDirty }, t("promptSave")),
              React.createElement(Btn, { variant: "ghost", onClick: () => resetFilterPart("prompts"), disabled: busy || overlayPrompts.mode === "all" }, t("promptClear")),
            ),
          ),
          complete ? React.createElement("div", { className: "dspm_banner dspm_bannerWarn" }, t("promptCompleteWarning")) : null,
          React.createElement("div", { className: "dspm_filterModeRow" },
            React.createElement("span", { className: "dspm_label" }, t("promptMode")),
            React.createElement("select", { className: "dspm_input", value: mode, onChange: (e) => switchPromptMode(e.currentTarget.value) },
              React.createElement("option", { value: "all" }, t("promptModeAll")),
              React.createElement("option", { value: "allow" }, t("promptModeAllow")),
              React.createElement("option", { value: "deny" }, t("promptModeDeny")),
            ),
            React.createElement("span", { className: "dspm_hint" }, mode === "all" ? t("promptModeAllHint") : mode === "allow" ? t("promptModeAllowHint") : t("promptModeDenyHint")),
          ),
          React.createElement("div", { className: "dspm_toolbar" },
            React.createElement("div", { className: "dspm_search dspm_grow" },
              React.createElement("span", { className: "dspm_searchIcon" }, iconOf("IconSearchOutlineRegular", 14) || "⌕"),
              React.createElement("input", { className: "dspm_input dspm_searchInput", value: promptQuery, placeholder: t("promptSearch"), "aria-label": t("promptSearch"), onChange: (e) => setPromptQuery(e.currentTarget.value) }),
            ),
            React.createElement("select", { className: "dspm_input dspm_originSelect", value: promptOrigin, "aria-label": t("promptOriginAll"), onChange: (e) => setPromptOrigin(e.currentTarget.value) },
              React.createElement("option", { value: "all" }, t("promptOriginAll")),
              React.createElement("option", { value: "global" }, t("promptOriginGlobal")),
              React.createElement("option", { value: "preset" }, t("promptOriginPreset")),
            ),
            React.createElement(Btn, { variant: "ghost", disabled: mode === "all", onClick: () => setAllPromptSections(filteredPrompts, true) }, t("promptSelectAll")),
            React.createElement(Btn, { variant: "ghost", disabled: mode === "all", onClick: () => setAllPromptSections(filteredPrompts, false) }, t("promptSelectNone")),
          ),
        ),
        filteredPrompts.length === 0 ? React.createElement("div", { className: "dspm_empty" },
          React.createElement("h3", null, t("noPrompts")),
          React.createElement("p", null, t("noPromptsBody")),
        ) : React.createElement("div", { className: "dspm_toolList" }, filteredPrompts.map((section) => {
          const checked = section.protected ? true : selectedPrompts.has(section.name);
          const disabled = mode === "all" || section.protected;
          return React.createElement("label", { key: section.name, className: clsx("dspm_toolRow", checked && "dspm_toolRowChecked") },
            React.createElement("input", { type: "checkbox", className: "dspm_check", checked, disabled, onChange: (e) => togglePromptSection(section.name, e.currentTarget.checked) }),
            React.createElement("span", { className: "dspm_toolMain" },
              React.createElement("span", { className: "dspm_toolName" }, section.name),
              React.createElement("span", { className: "dspm_toolDesc" }, section.preview || t("promptDynamic")),
              React.createElement("span", { className: "dspm_toolMeta" },
                React.createElement(Badge, { kind: section.protected ? "warn" : "neutral" }, section.protected ? t("promptProtected") : section.origin === "global" ? t("promptOriginGlobal") : section.origin),
                section.availableIn && section.availableIn.length ? React.createElement("span", { className: "dspm_avail" }, section.availableIn.map((id) => id.startsWith("agent-preset:") ? id.slice(13) : "global").join(", ")) : null,
              ),
            ),
          );
        })),
      );
    }

    function PreviewPane(props) {
      const { t, selected } = props;
      const [phase, setPhase] = React.useState("loading");
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState("");
      const [tick, setTick] = React.useState(0);
      const [parts, setParts] = React.useState({});

      React.useEffect(() => {
        let cancelled = false;
        setPhase("loading");
        setError("");
        setParts({});
        api("/preview?id=" + encodeURIComponent(selected.id)).then((result) => {
          if (cancelled) return;
          setData(result.preview);
          setPhase("ready");
        }).catch((failure) => {
          if (cancelled) return;
          setError(failure.message || String(failure));
          setPhase("error");
        });
        return () => { cancelled = true; };
      }, [selected.id, tick]);

      function partKey(part, name) { return part + ":" + (name || "") + "@" + tick; }

      function loadPart(part, name) {
        const key = partKey(part, name);
        if (parts[key] && (parts[key].phase === "loading" || parts[key].phase === "ready")) return;
        setParts((current) => ({ ...current, [key]: { phase: "loading" } }));
        const query = "/preview?id=" + encodeURIComponent(selected.id) + "&part=" + encodeURIComponent(part) + (name ? "&name=" + encodeURIComponent(name) : "");
        api(query).then((result) => {
          setParts((current) => ({ ...current, [key]: { phase: "ready", data: result } }));
        }).catch((failure) => {
          setParts((current) => ({ ...current, [key]: { phase: "error", error: failure.message || String(failure) } }));
        });
      }

      function disclosure(part, name, summary, renderBody, className) {
        const key = partKey(part, name);
        const entry = parts[key];
        let content;
        if (!entry || entry.phase === "loading") {
          content = React.createElement("div", { className: "dspm_previewLoading" }, React.createElement(Spinner, null), React.createElement("span", null, t("previewLoading")));
        } else if (entry.phase === "error") {
          content = React.createElement("p", { className: "dspm_previewErrorText" }, entry.error);
        } else {
          content = renderBody(entry);
        }
        return React.createElement("details", {
          key: key,
          className: "dspm_previewDisclosure" + (className ? " " + className : ""),
          onToggle: (event) => { if (event.currentTarget.open) loadPart(part, name); },
        },
          React.createElement("summary", { className: "dspm_previewDisclosureSummary" }, summary),
          React.createElement("div", { className: "dspm_previewDisclosureBody" }, content),
        );
      }

      function rowSummary(index, name, badges, line, meta) {
        return [
          index === null ? null : React.createElement("span", { key: "index", className: "dspm_previewIndex" }, String(index + 1).padStart(2, "0")),
          React.createElement("span", { key: "main", className: "dspm_previewRowMain" },
            React.createElement("span", { className: "dspm_previewNameLine" }, React.createElement("code", { key: "name" }, name), ...(badges || [])),
            React.createElement("span", { className: "dspm_previewRowLine" }, line || t("previewContextEmpty")),
          ),
          React.createElement("span", { key: "meta", className: "dspm_previewRowMeta" }, meta),
          React.createElement("span", { key: "chevron", className: "dspm_previewChevron", "aria-hidden": "true" }, "⌄"),
        ];
      }

      function slimSummary(label, meta) {
        return [
          React.createElement("span", { key: "label", className: "dspm_previewSlimLabel" }, label),
          React.createElement("span", { key: "meta", className: "dspm_previewRowMeta" }, meta),
          React.createElement("span", { key: "chevron", className: "dspm_previewChevron", "aria-hidden": "true" }, "⌄"),
        ];
      }

      function block(title, meta, content, className) {
        return React.createElement("section", { className: "dspm_previewBlock" + (className ? " " + className : "") },
          React.createElement("header", { className: "dspm_previewBlockHead" },
            React.createElement("h4", null, title),
            meta ? React.createElement("span", { className: "dspm_previewBlockMeta" }, meta) : null,
          ),
          content,
        );
      }

      if (phase === "loading") return React.createElement("div", { className: "dspm_previewPane dspm_previewPane--loading" }, React.createElement(Spinner, null), React.createElement("span", null, t("previewLoading")));
      if (phase === "error" || !data) return React.createElement("div", { className: "dspm_previewPane dspm_previewPane--error" },
        React.createElement("strong", null, t("previewError")),
        React.createElement("p", null, error || t("previewEmpty")),
        React.createElement(Btn, { variant: "primary", onClick: () => setTick((value) => value + 1) }, t("previewRefresh")),
      );

      const sections = data.prompt.sections || [];
      const contexts = data.prompt.contexts || [];
      const items = data.tools.items || [];
      const activeContexts = contexts.filter((row) => row.active).length;
      const filteredSections = sections.filter((row) => row.filtered).length;
      const hiddenTools = data.tools.counts.hidden || 0;
      const overlayTools = data.tools.overlay.tools;
      const overlayNames = (overlayTools.mode === "allow" ? overlayTools.allow : overlayTools.deny) || [];
      const overlayEnabled = data.tools.overlay.enabled !== false;
      const overlayLabel = !overlayEnabled
        ? t("previewFilterDisabled")
        : overlayTools.mode === "all"
          ? t("previewFilterAll")
          : overlayTools.mode === "allow"
            ? (overlayNames.length ? fmt(t("previewFilterAllow"), { n: overlayNames.length }) : t("previewFilterAllowEmpty"))
            : (overlayNames.length ? fmt(t("previewFilterDeny"), { n: overlayNames.length }) : t("previewFilterDenyEmpty"));
      const overlayShown = overlayNames.slice(0, 8);
      const overlayMore = overlayNames.length - overlayShown.length;
      const overlayNamesText = overlayShown.join(t("previewNameSeparator")) + (overlayMore > 0 ? " " + fmt(t("previewMoreNames"), { n: overlayMore }) : "");
      const warnings = data.warnings || [];
      const notes = data.notes || [];
      return React.createElement("div", { className: "dspm_previewPane" },
        React.createElement("header", { className: "dspm_previewHeader" },
          React.createElement("div", { className: "dspm_previewHeaderMain" },
            React.createElement("div", { className: "dspm_previewTitleLine" },
              React.createElement("h4", null, t("previewTitle")),
              React.createElement("code", null, data.id),
              React.createElement(Badge, { kind: "muted" }, t("previewStaticBadge")),
              data.mode !== "builtin" ? React.createElement(Badge, { kind: "neutral" }, data.mode) : null,
            ),
            React.createElement("p", { className: "dspm_hintBlock" }, t("previewHint")),
          ),
          React.createElement(Btn, { variant: "ghost", onClick: () => setTick((value) => value + 1) }, t("previewRefresh")),
        ),
        React.createElement("div", { className: "dspm_previewStats" },
          React.createElement("div", { className: "dspm_previewStat" }, React.createElement("strong", null, sections.length), React.createElement("span", null, t("previewSections"))),
          React.createElement("div", { className: "dspm_previewStat" }, React.createElement("strong", null, activeContexts, React.createElement("small", null, " / " + contexts.length)), React.createElement("span", null, t("previewContexts"))),
          React.createElement("div", { className: "dspm_previewStat" }, React.createElement("strong", null, data.tools.counts.visible, React.createElement("small", null, " / " + data.tools.counts.total)), React.createElement("span", null, t("previewTools"))),
          React.createElement("div", { className: "dspm_previewStat" }, React.createElement("strong", null, data.prompt.renderedChars), React.createElement("span", null, t("previewStatChars"))),
        ),
        warnings.length ? React.createElement("div", { className: "dspm_previewWarnings", role: "note" },
          React.createElement("strong", null, t("previewWarningsTitle")),
          warnings.map((warning) => React.createElement("p", { key: warning }, warning)),
        ) : null,
        notes.length ? React.createElement("ul", { className: "dspm_previewNotes" }, notes.map((note) => React.createElement("li", { key: note }, note))) : null,
        block(t("previewRendered"), fmt(t("previewChars"), { n: data.prompt.renderedChars }),
          React.createElement("div", { className: "dspm_previewPrompt" },
            React.createElement("pre", { className: "dspm_previewCode" }, data.prompt.renderedPreview),
            data.prompt.renderedTruncated ? React.createElement("p", { className: "dspm_previewMicroHint" }, t("previewRenderedTruncated")) : null,
            disclosure("prompt", null, slimSummary(t("previewFullPrompt"), fmt(t("previewChars"), { n: data.prompt.renderedChars })), (entry) => React.createElement("pre", { className: "dspm_previewFull" }, entry.data.text), "dspm_previewDisclosure--slim"),
          ),
        ),
        block(t("previewSections"), fmt(t("previewSectionCount"), { n: sections.length }) + (filteredSections ? "（" + fmt(t("previewFilteredCount"), { n: filteredSections }) + "）" : ""),
          sections.length === 0 ? React.createElement("p", { className: "dspm_previewEmpty" }, t("previewNoSections")) : React.createElement("div", { className: "dspm_previewManifest" }, sections.map((section, index) => {
            const badges = [
              React.createElement(Badge, { key: "origin", kind: "neutral" }, section.origin),
              section.protected ? React.createElement(Badge, { key: "protected", kind: "warn" }, t("previewProtected")) : null,
              section.filtered ? React.createElement(Badge, { key: "filtered", kind: "bad" }, t("previewFiltered")) : null,
            ].filter(Boolean);
            return disclosure("section", section.name, rowSummary(index, section.name, badges, section.preview, fmt(t("previewChars"), { n: section.chars })),
              (entry) => [
                section.filtered ? React.createElement("p", { key: "filtered", className: "dspm_previewFilteredHint" }, t("previewFilteredHint")) : null,
                React.createElement("pre", { key: "text", className: "dspm_previewFull" }, entry.data.text || t("previewContextEmpty")),
              ],
              "dspm_previewDisclosure--manifest" + (section.filtered ? " isFiltered" : ""),
            );
          })),
        ),
        block(t("previewContexts"), fmt(t("previewContextCount"), { active: activeContexts, total: contexts.length }),
          contexts.length === 0 ? React.createElement("p", { className: "dspm_previewEmpty" }, t("previewNoContexts")) : React.createElement("div", { className: "dspm_previewManifest" }, contexts.map((context, index) => {
            const badges = [
              React.createElement(Badge, { key: "state", kind: context.active ? "ok" : "muted" }, context.active ? t("previewActive") : t("previewContextEmpty")),
            ];
            return disclosure("context", context.name, rowSummary(index, context.name, badges, context.preview, fmt(t("previewChars"), { n: context.chars })),
              (entry) => React.createElement("pre", { className: "dspm_previewFull" }, entry.data.text || t("previewContextEmpty")),
              "dspm_previewDisclosure--manifest",
            );
          })),
        ),
        block(t("previewTools"), fmt(t("previewToolCount"), { visible: data.tools.counts.visible, total: data.tools.counts.total }) + (hiddenTools ? "（" + fmt(t("previewHiddenCount"), { n: hiddenTools }) + "）" : ""),
          React.createElement("div", { className: "dspm_previewToolMeta" },
            React.createElement("span", { className: "dspm_previewToolFilter" },
              React.createElement("span", { className: "dspm_previewToolFilterLabel" }, t("previewToolFilter")),
              React.createElement("span", { className: "dspm_previewToolFilterState" }, overlayLabel),
              overlayEnabled && overlayTools.mode !== "all" && overlayNames.length
                ? React.createElement("span", { className: "dspm_previewToolNames", title: overlayNames.join(", ") }, overlayNamesText)
                : null,
            ),
            React.createElement("span", null, fmt(t("previewCapabilitiesLine"), { plugins: data.capabilities.pluginRows, enabled: data.capabilities.enabledPluginRows, mcp: data.capabilities.mcpTools })),
          ),
          items.length === 0 ? React.createElement("p", { className: "dspm_previewEmpty" }, t("previewNoTools")) : React.createElement("div", { className: "dspm_previewManifest" }, items.map((item) => {
            const kind = item.visibility === "hidden" ? "bad" : item.visibility === "guard-only" ? "warn" : item.visibility === "unknown" ? "muted" : "neutral";
            const label = item.visibility === "hidden" ? t("previewHidden") : item.visibility === "guard-only" ? t("previewGuardOnly") : item.visibility === "unknown" ? t("previewUnknown") : t("previewVisible");
            const badges = [
              React.createElement(Badge, { key: "origin", kind: "neutral" }, item.origin),
              React.createElement(Badge, { key: "visibility", kind }, label),
            ];
            return disclosure("tool", item.name, rowSummary(null, item.name, badges, item.description, fmt(t("previewParams"), { n: item.parameterCount })),
              (entry) => [
                item.description ? React.createElement("p", { key: "description", className: "dspm_previewToolDescription" }, item.description) : null,
                React.createElement("pre", { key: "schema", className: "dspm_previewFull" }, JSON.stringify(entry.data.schema, null, 2)),
              ],
              "dspm_previewDisclosure--tool",
            );
          })),
        ),
        React.createElement("details", { className: "dspm_previewDisclosure dspm_previewDisclosure--slim dspm_previewDisclosure--variables" },
          React.createElement("summary", { className: "dspm_previewDisclosureSummary" }, slimSummary(fmt(t("previewVariablesCount"), { n: Object.keys(data.prompt.variables || {}).length }), "")),
          React.createElement("div", { className: "dspm_previewDisclosureBody" }, React.createElement("pre", { className: "dspm_previewFull" }, JSON.stringify(data.prompt.variables || {}, null, 2))),
        ),
      );
    }

    function PluginRow(props) {
      const { t, row, index, updatePluginRow, removePluginRow } = props;
      const disabled = row.disabled === true;
      const jsDisabled = isJsDisabled(row.disabled);
      const name = row.name || "";
      const isTool = name.includes("/dsh-tool-") || name.includes("/dsh-skill") || name.includes("tool-plugin-manager");
      return React.createElement("div", { className: clsx("dspm_toolRow", disabled && "dspm_rowDisabled") },
        React.createElement("span", { className: "dspm_toolMain" },
          React.createElement("span", { className: "dspm_toolName" }, (row.id ? row.id + " · " : "") + name),
          React.createElement("span", { className: "dspm_toolMeta" }, row.group ? React.createElement(Badge, { kind: "muted" }, t("rowGroup")) : null, jsDisabled ? React.createElement(Badge, { kind: "warn" }, t("rowCondition") + ": " + row.disabled.__jsExpr) : null, disabled ? React.createElement(Badge, { kind: "muted" }, t("rowDisabled")) : null),
        ),
        React.createElement("label", { className: "dspm_enable" }, jsDisabled ? null : React.createElement(Toggle, { checked: !disabled, label: name, onChange: (checked) => updatePluginRow(index, { disabled: checked ? undefined : true }) }), isTool ? React.createElement("span", { className: "dspm_rowGroupLabel" }, "tool") : null),
      );
    }

    function personaIndexOf(plugins) { return (plugins || []).findIndex((row) => row && row.name === "@deepseek-ai/dsh-persona"); }

    const CSS = `.dspm_page{min-height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dspm_dragBand{height:18px;flex:0 0 auto}
.dspm_pageInner{width:100%;max-width:1440px;margin:0 auto;padding:20px 28px 32px;box-sizing:border-box}
.dspm_root{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dspm_center{display:flex;align-items:center;justify-content:center;gap:8px;min-height:180px;color:var(--dsw-alias-label-secondary)}
.dspm_header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dspm_headerActions{display:flex;gap:8px;flex:0 0 auto;align-items:center;flex-wrap:wrap}
.dspm_backupStatus{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dspm_sidebarIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px;line-height:0;vertical-align:middle}
.dspm_sidebarIcon svg{display:block;vertical-align:middle}
.dspm_list{display:flex;flex-direction:column;overflow:hidden;min-width:0}
.dspm_search{display:flex;align-items:center;gap:6px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;padding:0 8px;background:var(--dsw-alias-bg-layer-1)}
.dspm_searchIcon{display:inline-flex;color:var(--dsw-alias-label-tertiary);flex:0 0 auto}
.dspm_searchInput{border:0!important;background:transparent!important;padding-left:0!important;min-width:0;height:30px!important}.dspm_searchInput:focus,.dspm_searchInput:focus-visible{outline:none!important;box-shadow:none!important;border-color:transparent!important}.dspm_search:focus-within{border-color:var(--dsw-alias-state-business-primary);outline:none;box-shadow:none}
.dspm_input{width:100%;box-sizing:border-box;height:32px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:0 9px;font:inherit;font-size:13px;outline:none}
.dspm_input:focus,.dspm_input:focus-visible{outline:none;box-shadow:none;border-color:var(--dsw-alias-state-business-primary)}
select.dspm_input{cursor:pointer}
.dspm_listItem{display:flex;flex-direction:column;gap:3px;text-align:left;border:0;background:transparent;color:inherit;padding:10px 12px;cursor:pointer;font:inherit;min-width:0}
.dspm_listItem:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dspm_listItemActive{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-interactive-bg-hover))}
.dspm_listTop{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
.dspm_listName{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.dspm_listDesc{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dspm_listMeta{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-tertiary);font-size:11px;flex-wrap:wrap}
.dspm_listEmpty{padding:16px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dspm_listFooter{padding:8px 0;border-top:0.5px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-start}
.dspm_editor{min-height:520px;overflow:hidden;min-width:0}
.dspm_editorInner{display:flex;flex-direction:column;gap:12px;padding:14px}
.dspm_editorActions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dspm_enable{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.dspm_tabBody{min-width:0}
.dspm_section{display:flex;flex-direction:column;gap:10px;min-width:0;padding-top:4px}
.dspm_sectionHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dspm_sectionHead h4{margin:0;font-size:13px;font-weight:600}
.dspm_count{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dspm_hintBlock{margin:0;padding:8px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dspm_hintStack{display:flex;flex-direction:column;gap:6px}
.dspm_textarea{width:100%;box-sizing:border-box;min-height:260px;resize:vertical;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);padding:10px 11px;font:inherit;font-size:13px;line-height:20px;outline:none;white-space:pre-wrap}
.dspm_textarea:focus,.dspm_textarea:focus-visible{outline:none;box-shadow:none;border-color:var(--dsw-alias-state-business-primary)}
.dspm_yaml{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;min-height:320px;max-height:calc(100vh - 430px);white-space:pre;overflow:auto;tab-size:2;resize:vertical}
.dspm_advancedPane{min-height:0}
.dspm_advancedBar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;flex:0 0 auto}
.dspm_advancedTitle{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dspm_advancedTitle h4{margin:0;font-size:13px;font-weight:600}
.dspm_advancedTitle .dspm_hint{line-height:16px}
.dspm_yamlFrame{display:flex;min-height:0;flex:1 1 auto;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.dspm_yamlFrame .dspm_yaml{flex:1 1 auto;min-height:320px;border:0;border-radius:0;background:transparent;max-height:calc(100vh - 430px)}
.dspm_grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dspm_field{display:flex;flex-direction:column;gap:4px;min-width:0}
.dspm_label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dspm_hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dspm_toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dspm_grow{flex:1 1 220px}
.dspm_originSelect{flex:0 0 auto;width:auto;max-width:160px}
.dspm_toolList{display:flex;flex-direction:column;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;overflow:hidden;max-height:520px;overflow-y:auto}
.dspm_toolRow{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-top:0.5px solid var(--dsw-alias-border-l2);cursor:pointer;min-width:0}
.dspm_toolRow:first-child{border-top:0}
.dspm_toolRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dspm_toolRowChecked{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent)}
.dspm_check{margin-top:2px;flex:0 0 auto;accent-color:var(--dsw-alias-state-business-primary)}
.dspm_toolMain{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.dspm_toolName{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;overflow-wrap:anywhere}
.dspm_toolDesc{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dspm_toolMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
.dspm_avail{color:var(--dsw-alias-label-tertiary);font-size:10px}
.dspm_badge{display:inline-flex;align-items:center;border-radius:4px;padding:0 5px;height:18px;font-size:10px;line-height:18px;font-weight:500;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dspm_badge_neutral{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary)}
.dspm_badge_brand{background:color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%,transparent);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color)}
.dspm_badge_mcp{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.dspm_badge_ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary)) 10%,transparent);color:var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary))}
.dspm_badge_warn{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b26a00) 12%,transparent);color:var(--dsw-alias-state-warning-primary,#b26a00)}
.dspm_badge_muted{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-tertiary)}
.dspm_badge_bad{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c0392b) 10%,transparent);color:var(--dsw-alias-state-error-primary,#c0392b)}
.dspm_stateDot{width:6px;height:6px;border-radius:50%;display:inline-block;flex:0 0 auto}
.dspm_stateDotOn{background:var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary))}
.dspm_stateDotOff{background:var(--dsw-alias-border-l3,var(--dsw-alias-label-tertiary))}
.dspm_bannerAction{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dspm_banner{padding:8px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);font-size:12px}
.dspm_bannerWarn{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b26a00) 10%,transparent);color:var(--dsw-alias-state-warning-primary,#b26a00)}
.dspm_rowTree{display:flex;flex-direction:column;gap:2px}
.dspm_rowTree .dspm_toolRow{border:0;border-top:0.5px solid var(--dsw-alias-border-l2);border-radius:0;padding:6px 8px}
.dspm_rowTree .dspm_toolRow:first-child{border-top:0}
.dspm_rowGroupLabel{font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace}
.dspm_rowDisabled{opacity:.6}
.dspm_tabsLine{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.dspm_empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:220px;text-align:center;padding:20px}
.dspm_empty h3{margin:0;font-size:14px}
.dspm_empty p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;max-width:520px}
.dspm_notice{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary)) 10%,transparent);color:var(--dsw-alias-state-success-primary,var(--dsw-alias-state-business-primary));font-size:12px}
.dspm_notice[data-kind=bad]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c0392b) 10%,transparent);color:var(--dsw-alias-state-error-primary,#c0392b)}
.dspm_noticeClose{border:0;background:transparent;color:inherit;cursor:pointer;font-size:14px;line-height:1}
.dspm_error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border:0.5px solid var(--dsw-alias-state-error-primary,#c0392b);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c0392b) 7%,transparent)}
.dspm_error p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dspm_warnings{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dspm_warnings ul{margin:0;padding-left:18px}
button.dspm_btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:29px;box-sizing:border-box;padding:0 11px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;line-height:1;white-space:nowrap;box-shadow:none;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,color .12s ease,opacity .12s ease}
button.dspm_btn--md{height:32px;padding:0 13px;font-size:13px}
button.dspm_btn--primary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:#fff}
button.dspm_btn--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 86%,#000);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 86%,#000)}
button.dspm_btn--outline{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
button.dspm_btn--outline:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
button.dspm_btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding-left:8px;padding-right:8px}
button.dspm_btn--ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
button.dspm_btn:disabled{opacity:.42;cursor:not-allowed}
button.dspm_btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dspm_identityActions button.dspm_btn--ghost{color:var(--dsw-alias-label-tertiary)}
.dspm_identityActions button.dspm_btn--ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dspm_headerActions button.dspm_btn--ghost{color:var(--dsw-alias-label-secondary)}
.dspm_spinner{display:inline-flex;animation:dspm-spin 1s linear infinite}
@keyframes dspm-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dspm_spinner{animation:none}}
.dspm_modal{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px}
.dspm_modalBody{display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto;font-size:13px;line-height:20px}
.dspm_modalBody p{margin:0}
.dspm_modalTitle{margin:0 0 4px;font-size:15px}
.dspm_modalFooter{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.dspm_overlay{position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.dspm_overlay .dspm_modal{position:relative;inset:auto;z-index:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);padding:16px;min-width:min(460px,90vw);box-shadow:0 18px 50px rgba(0,0,0,.25)}
.dspm_dangerBtn{color:var(--dsw-alias-state-error-primary,#c0392b)}
.dspm_backupList{display:flex;flex-direction:column;gap:4px;max-height:360px;overflow:auto;border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px}
.dspm_backupRow{display:flex;flex-direction:column;gap:2px;padding:4px 6px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dspm_backupTop{display:flex;align-items:center;gap:6px;min-width:0}
.dspm_backupBottom{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dspm_backupRow:last-child{border-bottom:0}
.dspm_muted{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dspm_fallbackSwitch{width:28px;height:16px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);position:relative;cursor:pointer;padding:0}
.dspm_fallbackThumb{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .15s ease}
.dspm_fallbackThumb[data-on="1"]{transform:translateX(12px)}

.dspm_titleBlock{display:flex;align-items:flex-start;gap:14px;min-width:0;flex:1 1 auto;max-width:620px;--dspm-title-line:34px}
.dspm_titleMark{width:4px;height:var(--dspm-title-line);border-radius:0;background:var(--dsw-alias-state-business-primary);flex:0 0 auto;margin-top:0;align-self:flex-start}
.dspm_title{margin:0;font-size:27px;line-height:34px;letter-spacing:-.02em;font-weight:650}
.dspm_intro{max-width:600px;margin-top:3px}
.dspm_layout{display:grid;grid-template-columns:272px minmax(0,1fr) 238px;gap:0;border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:0}
.dspm_spine{background:transparent;border:0;border-radius:0;border-right:0.5px solid var(--dsw-alias-border-l2);min-height:540px;padding:10px 16px 10px 0}
.dspm_spine>.dspm_search{margin:0 0 10px}
.dspm_spine .dspm_listItem{border-top:0.5px solid var(--dsw-alias-border-l2);border-radius:0;padding:11px 10px 11px 12px;position:relative}
.dspm_spine .dspm_listItem:first-of-type{border-top:0}
.dspm_spine .dspm_listItemActive{box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent)}
.dspm_spine .dspm_listItemActive::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:2px;background:var(--dsw-alias-state-business-primary)}
.dspm_spine .dspm_listFooter{border-top:0.5px solid var(--dsw-alias-border-l2);padding:10px 0 0;justify-content:flex-start}
.dspm_editor{background:transparent;border:0;border-radius:0;min-height:540px;padding-left:22px}
.dspm_editorInner{padding:0}
.dspm_contextRail{border-left:0.5px solid var(--dsw-alias-border-l2);padding-left:18px;min-height:540px;position:sticky;top:18px;align-self:start;display:flex;flex-direction:column;gap:18px}
.dspm_railBlock{display:flex;flex-direction:column;gap:7px}
.dspm_railBlock h3{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dspm_facts{margin:0;display:flex;flex-direction:column;gap:0}
.dspm_fact{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;padding:5px 0;border-top:0.5px solid var(--dsw-alias-border-l2);font-size:12px}
.dspm_fact:first-child{border-top:0;padding-top:0}
.dspm_fact dt{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dspm_fact dd{margin:0;min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dspm_fact code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-primary)}
.dspm_railMuted{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dspm_railImpact p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dspm_railImpact p+p{margin-top:4px}
.dspm_railDirty{display:flex;align-items:center;gap:6px;padding:7px 8px;border:0.5px dashed var(--dsw-alias-state-warning-primary,#b26a00);border-radius:4px;color:var(--dsw-alias-state-warning-primary,#b26a00);font-size:11px}
.dspm_stateDotWarn{background:var(--dsw-alias-state-warning-primary,#b26a00)}
.dspm_identity{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:nowrap;padding:12px 14px 11px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.dspm_identityMain{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.dspm_identityTitleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dspm_identityTitle{margin:0;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dspm_identityId{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2);border-radius:3px;padding:1px 5px;white-space:nowrap}
.dspm_identityDesc{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;min-height:17px}
.dspm_identityActions{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding-top:2px}
.dspm_metaGrid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1.4fr) minmax(120px,.7fr) 84px;gap:10px}
.dspm_tabBar{display:flex;align-items:stretch;gap:22px;border-bottom:0.5px solid var(--dsw-alias-border-l2);margin-top:2px}
.dspm_tab{position:relative;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;padding:8px 1px 9px;cursor:pointer}
.dspm_tab:hover{color:var(--dsw-alias-label-primary)}
.dspm_tabActive{color:var(--dsw-alias-label-primary);font-weight:600}
.dspm_tabActive::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--dsw-alias-state-business-primary)}
.dspm_tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}
.dspm_section{padding-top:4px}
.dspm_field input.dspm_input[readonly]{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.dspm_input:focus-visible,.dspm_textarea:focus-visible{outline:none}
@media (max-width:1180px){.dspm_metaGrid{grid-template-columns:1fr 1fr}.dspm_identityTitle{font-size:20px;line-height:26px}.dspm_titleBlock{--dspm-title-line:26px}}
@media (min-width:981px) and (max-width:1250px){.dspm_layout{grid-template-columns:272px minmax(0,1fr)}.dspm_contextRail{display:none}.dspm_editor{padding-right:0}}
@media (max-width:980px){.dspm_identity{flex-wrap:wrap}.dspm_identityActions{padding-top:0}}
@media (max-width:980px){.dspm_metaGrid{grid-template-columns:1fr 1fr}.dspm_titleBlock{--dspm-title-line:31px}.dspm_layout{grid-template-columns:1fr}.dspm_spine{border-right:0;border-bottom:0.5px solid var(--dsw-alias-border-l2);padding:0 0 12px;min-height:0}.dspm_editor{padding-left:0;padding-top:16px}.dspm_listFooter{justify-content:flex-end}.dspm_title{font-size:24px;line-height:31px}.dspm_headerActions{width:100%}}

.dspm_layout{padding-top:16px}
.dspm_spine{padding-top:0;padding-right:18px}
.dspm_editor{padding:0 22px 26px 22px}
.dspm_contextRail{padding:0 0 26px 20px}
.dspm_rowTree{max-height:clamp(240px,calc(100vh - 430px),520px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:6px}
.dspm_contextRail{top:34px}
@media (max-width:1250px){.dspm_editor{padding-right:0}}
@media (max-width:980px){.dspm_layout{padding-top:12px}.dspm_editor{padding:0 0 22px}.dspm_contextRail{padding:0}}

.dspm_editorInner{height:calc(100vh - 210px);min-height:520px;overflow:hidden}
.dspm_tabBody{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:4px}
.dspm_advancedPane{height:100%;min-height:0;display:flex;flex-direction:column}
.dspm_advancedPane .dspm_yamlFrame{flex:1 1 auto;min-height:0}
.dspm_advancedPane .dspm_yaml{height:100%;min-height:0;max-height:none;resize:none;border:0;border-radius:0;background:transparent}
@media (max-width:980px){.dspm_editorInner{height:auto;min-height:0;overflow:visible}.dspm_tabBody{overflow:visible}.dspm_advancedPane{height:auto}.dspm_advancedPane .dspm_yaml{height:320px}}

.dspm_tabBody{padding-bottom:28px}
.dspm_editorInner{padding-bottom:22px}
@media (min-width:981px) and (max-width:1380px){
  .dspm_layout{grid-template-columns:272px minmax(0,1fr)}
  .dspm_contextRail{display:none}
  .dspm_editor{padding:0 16px 26px 22px}
  .dspm_editorInner{height:auto;min-height:0;overflow:visible;padding-bottom:26px}
  .dspm_tabBody{overflow:visible;padding-bottom:30px}
  .dspm_advancedPane{height:auto;min-height:0}
  .dspm_advancedPane .dspm_yaml{height:420px;min-height:320px;max-height:60vh;resize:vertical}
}
@media (max-width:980px){
  .dspm_editor{padding:0 0 24px}
  .dspm_layout{padding-top:12px}
  .dspm_pageInner{padding-bottom:40px}
  .dspm_advancedPane .dspm_yaml{height:360px}
}

.dspm_editorInner{height:calc(100vh - 280px);min-height:360px;overflow:hidden}
.dspm_tabBody{overflow-y:auto;padding-bottom:26px}
.dspm_tabBody[data-tab="advanced"]{overflow:hidden;padding-bottom:0}
.dspm_tabBody[data-tab="advanced"] .dspm_advancedPane{height:100%;min-height:0}
@media (min-width:981px) and (max-width:1380px){
  .dspm_layout{grid-template-columns:272px minmax(0,1fr)}
  .dspm_contextRail{display:none}
  .dspm_editor{padding:0 16px 26px 22px}
  .dspm_editorInner{height:calc(100vh - 280px);min-height:360px;overflow:hidden}
  .dspm_tabBody{overflow-y:auto;padding-bottom:26px}
  .dspm_tabBody[data-tab="advanced"]{overflow:hidden;padding-bottom:0}
  .dspm_advancedPane{height:100%;min-height:0}
  .dspm_advancedPane .dspm_yaml{height:100%;min-height:0;max-height:none;resize:none}
}

@media (max-height:820px){
  .dspm_editorInner{gap:8px}
  .dspm_identity{padding:8px 12px 7px}
  .dspm_identityDesc{display:none}
  .dspm_tabBar{margin-top:0}
  .dspm_metaGrid{gap:6px}
  .dspm_section{gap:8px}
  .dspm_tabBody{padding-bottom:22px}
}

.dspm_rowTree{max-height:none!important;overflow:visible!important;padding-right:0}
.dspm_toolList{max-height:none!important;overflow:visible!important}
.dspm_tabBody[data-tab="filter"],.dspm_tabBody[data-tab="prompts"]{padding-bottom:28px}

.dspm_filterActions{justify-content:flex-end;padding-bottom:2px}

@media (min-width:1381px){.dspm_editorInner{height:calc(100vh - 220px);min-height:360px}}

.dspm_sourceActive{color:var(--dsw-alias-state-business-primary)!important;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)!important;border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent)!important;border-radius:4px}

.dspm_labelRow{display:flex;align-items:center;gap:5px;min-width:0}
.dspm_help{position:relative;display:inline-flex;align-items:center}
.dspm_helpBtn{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:help}
.dspm_helpBtn:hover,.dspm_helpBtn[aria-expanded="true"]{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent)}
.dspm_helpBtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dspm_helpTip{position:absolute;left:0;top:calc(100% + 6px);z-index:1400;width:260px;max-width:70vw;padding:8px 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11px;line-height:17px;font-weight:400;box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:normal;text-align:left}
.dspm_filterPane{min-height:0}
.dspm_filterHeader{position:relative;flex:0 0 auto;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1);padding-bottom:8px}

.dspm_tabBody[data-tab="filter"],.dspm_tabBody[data-tab="prompts"]{display:flex;flex-direction:column;overflow:hidden!important;padding-bottom:0}
.dspm_tabBody[data-tab="filter"]>.dspm_section,.dspm_tabBody[data-tab="prompts"]>.dspm_section{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px}
.dspm_filterPane .dspm_toolList{flex:1 1 auto;min-height:120px;max-height:none!important;overflow-y:auto!important;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:4px}

.dspm_tabBody[data-tab="preview"]{padding-bottom:36px}
.dspm_previewPane{display:flex;flex-direction:column;min-width:0;padding-right:4px}
.dspm_previewPane--loading{flex-direction:row;align-items:center;gap:8px;padding:28px 0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dspm_previewPane--error{gap:8px;padding:20px 0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dspm_previewPane--error strong{color:var(--dsw-alias-label-primary);font-size:13px}
.dspm_previewPane--error p{margin:0}
.dspm_previewPane--error button{align-self:flex-start;margin-top:4px}
.dspm_previewHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:2px 0 14px}
.dspm_previewHeaderMain{min-width:0}
.dspm_previewTitleLine{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.dspm_previewTitleLine h4{margin:0;font-size:15px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dspm_previewTitleLine code{font:11px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);padding:1px 5px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-1)}
.dspm_previewPane .dspm_hintBlock{margin:5px 0 0;max-width:980px;line-height:17px}
.dspm_previewStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.dspm_previewStat{min-width:0;padding:10px 12px;border-right:0.5px solid var(--dsw-alias-border-l2)}
.dspm_previewStat:last-child{border-right:0}
.dspm_previewStat strong{display:block;color:var(--dsw-alias-label-primary);font-size:18px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums}
.dspm_previewStat strong small{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:400}
.dspm_previewStat span{display:block;margin-top:1px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dspm_previewWarnings{margin-top:12px;padding:8px 10px 8px 12px;border-left:2px solid var(--dsw-alias-state-warning-primary);border-radius:0 6px 6px 0;background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 7%,transparent)}
.dspm_previewWarnings strong{display:block;margin-bottom:3px;color:var(--dsw-alias-label-primary);font-size:11px;font-weight:600}
.dspm_previewWarnings p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dspm_previewWarnings p+p{margin-top:3px}
.dspm_previewNotes{margin:9px 0 0;padding:0 0 0 16px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dspm_previewNotes li+li{margin-top:2px}
.dspm_previewBlock{margin-top:20px;padding-top:14px;border-top:0.5px solid var(--dsw-alias-border-l2);min-width:0}
.dspm_previewBlockHead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.dspm_previewBlockHead h4{margin:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:19px;font-weight:600}
.dspm_previewBlockMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}
.dspm_previewPrompt{display:flex;flex-direction:column;gap:8px;min-width:0}
.dspm_previewCode,.dspm_previewFull{margin:0;min-width:0;white-space:pre-wrap;word-break:break-word;font:11px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:10px 12px}
.dspm_previewCode{max-height:none;overflow:visible}
.dspm_previewFull{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}
.dspm_previewMicroHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dspm_previewManifest{display:flex;flex-direction:column;min-width:0}
.dspm_previewDisclosure{border-top:0.5px solid var(--dsw-alias-border-l2);min-width:0}
.dspm_previewDisclosure:first-child{border-top:0}
.dspm_previewDisclosureSummary{display:flex;align-items:flex-start;gap:10px;min-width:0;padding:9px 2px;list-style:none;cursor:pointer}
.dspm_previewDisclosureSummary::-webkit-details-marker{display:none}
.dspm_previewDisclosureSummary:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 4%,transparent)}
.dspm_previewDisclosure[open]>summary{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 5%,transparent)}
.dspm_previewDisclosureSummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;border-radius:4px}
.dspm_previewIndex{flex:0 0 22px;text-align:right;color:var(--dsw-alias-label-tertiary);font:11px/17px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.dspm_previewRowMain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.dspm_previewNameLine{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.dspm_previewNameLine code{min-width:0;color:var(--dsw-alias-label-primary);font:11px/17px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
.dspm_previewNameLine .dspm_badge{flex:0 0 auto}
.dspm_previewRowLine{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dspm_previewDisclosure.isFiltered .dspm_previewRowLine{color:var(--dsw-alias-label-tertiary);text-decoration:line-through;text-decoration-thickness:1px}
.dspm_previewRowMeta{flex:0 0 auto;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dspm_previewChevron{flex:0 0 14px;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:17px;text-align:center;transform-origin:center;transition:transform .15s ease}
.dspm_previewDisclosure[open] .dspm_previewChevron{transform:rotate(180deg)}
.dspm_previewDisclosureBody{padding:0 2px 12px 34px;min-width:0}
.dspm_previewDisclosure--tool .dspm_previewDisclosureBody{padding-left:2px}
.dspm_previewDisclosure--slim>.dspm_previewDisclosureSummary{padding-left:2px}
.dspm_previewDisclosure--slim>.dspm_previewDisclosureBody{padding-left:2px}
.dspm_previewSlimLabel{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}
.dspm_previewDisclosure--variables{margin-top:18px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.dspm_previewFilteredHint{margin:0 0 7px;color:var(--dsw-alias-state-warning-primary);font-size:11px;line-height:16px}
.dspm_previewToolMeta{display:flex;gap:6px 14px;flex-wrap:wrap;margin:-1px 0 8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dspm_previewToolFilter{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-width:0}
.dspm_previewToolFilterLabel{color:var(--dsw-alias-label-primary);font-weight:600;white-space:nowrap}
.dspm_previewToolFilterState{color:var(--dsw-alias-label-secondary);white-space:normal}
.dspm_previewToolNames{min-width:0;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
.dspm_previewToolDescription{margin:0 0 7px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;white-space:pre-wrap;word-break:break-word}
.dspm_previewEmpty{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dspm_previewLoading{display:flex;align-items:center;gap:7px;padding:6px 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dspm_previewErrorText{margin:0;color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary));font-size:11px;line-height:17px}
.dspm_badText{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary))}
@media (max-width:720px){.dspm_previewHeader{flex-direction:column;gap:8px}.dspm_previewStats{grid-template-columns:1fr 1fr}.dspm_previewStat:nth-child(2){border-right:0}.dspm_previewStat:nth-child(-n+2){border-bottom:0.5px solid var(--dsw-alias-border-l2)}.dspm_previewDisclosureBody{padding-left:34px}}
@media (prefers-reduced-motion:reduce){.dspm_previewChevron{transition:none}}
.dspm_filterTop{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:29px}
.dspm_filterTitleRow{display:flex;align-items:center;gap:5px}
.dspm_filterModeRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dspm_filterModeRow .dspm_input{flex:0 0 auto;width:auto;min-width:190px;max-width:300px}
.dspm_filterModeRow .dspm_hint{flex:1 1 220px;min-width:0}

.dspm_helpTip--right{left:auto;right:0}
.dspm_helpTip{max-width:min(260px,calc(100vw - 40px));max-height:calc(100vh - 24px);overflow:auto}

.dspm_backupPolicy{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0}

.dspm_backupKeep{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.dspm_keepInput{width:64px!important;height:26px!important;padding:0 6px!important;font-size:12px}

@media (max-width:980px){
.dspm_page{flex:1 1 auto;height:100%;min-height:0!important;max-height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.dspm_pageInner{flex:0 0 auto;padding:16px 16px 32px;min-width:0}
.dspm_root{min-width:0}
.dspm_header{gap:10px}
.dspm_titleBlock{max-width:100%;gap:10px;--dspm-title-line:28px}
.dspm_title{font-size:22px;line-height:28px}
.dspm_intro{font-size:12px;line-height:18px;max-width:none}
.dspm_headerActions{width:100%;gap:6px}
.dspm_backupStatus{white-space:normal;line-height:16px}
.dspm_layout{grid-template-columns:minmax(0,1fr);padding-top:12px;min-width:0}
.dspm_spine{width:100%;min-width:0;min-height:0;border-right:0;border-bottom:0.5px solid var(--dsw-alias-border-l2);padding:0 0 12px;overflow:visible!important}
.dspm_spine .dspm_listFooter{display:none}
.dspm_editor{width:100%;min-width:0;min-height:0;overflow:visible!important;padding:14px 0 24px;scroll-margin-top:12px}
.dspm_editorInner{height:auto!important;min-height:0!important;overflow:visible!important;padding-bottom:0!important;gap:10px}
.dspm_tabBody{overflow:visible!important;padding-bottom:24px;min-width:0}
.dspm_tabBody[data-tab="advanced"]{overflow:visible!important;padding-bottom:24px}
.dspm_advancedPane{height:auto!important;min-height:0}
.dspm_advancedPane .dspm_yaml{height:320px!important;min-height:240px;max-height:60vh;resize:vertical}
.dspm_metaGrid{grid-template-columns:1fr;gap:8px}
.dspm_identity{flex-wrap:wrap;padding:10px 12px;gap:8px}
.dspm_identityTitle{white-space:normal;overflow:visible;text-overflow:clip}
.dspm_identityId{white-space:normal;overflow-wrap:anywhere}
.dspm_sectionHead{flex-wrap:wrap}
.dspm_count{white-space:normal}
.dspm_identityActions{width:100%;justify-content:flex-start;flex-wrap:wrap;padding-top:0}
.dspm_tabBar{flex-wrap:wrap;gap:0 18px;margin-top:0;overflow:visible}
.dspm_tab{font-size:12px;padding:9px 0 10px}
.dspm_tabBody[data-tab="filter"],.dspm_tabBody[data-tab="prompts"]{display:block;overflow:visible!important;padding-bottom:24px}
.dspm_tabBody[data-tab="filter"]>.dspm_section,.dspm_tabBody[data-tab="prompts"]>.dspm_section{height:auto;min-height:0;display:block}
.dspm_filterPane{display:block;min-height:0}
.dspm_filterHeader{position:static;background:transparent;padding-bottom:0}
.dspm_filterPane .dspm_toolList{flex:0 0 auto;min-height:0;overflow:visible!important;max-height:none!important;padding-right:0}
.dspm_filterModeRow{flex-direction:column;align-items:stretch;gap:6px}
.dspm_filterModeRow .dspm_input{width:100%!important;min-width:0!important;max-width:none!important}
.dspm_filterModeRow .dspm_hint{flex:0 1 auto;min-width:0}
.dspm_filterTop{min-height:0;align-items:flex-start}
.dspm_filterActions{justify-content:flex-start}
.dspm_toolbar>.dspm_search{flex:1 1 100%}
.dspm_originSelect{max-width:none}
.dspm_rowTree{max-height:none!important;overflow:visible!important;padding-right:0}
.dspm_toolList{max-height:none!important;overflow:visible!important}
button.dspm_btn{height:34px;padding:0 12px;font-size:13px}
button.dspm_btn--md{height:36px}
.dspm_input{height:36px;font-size:14px}
.dspm_searchInput{height:34px!important}
}
@media (max-width:560px){
.dspm_pageInner{padding:14px 12px 28px}
.dspm_titleBlock{gap:9px;--dspm-title-line:27px}
.dspm_title{font-size:21px;line-height:27px}
.dspm_intro{font-size:11.5px;line-height:17px}
.dspm_spine .dspm_listItem{padding:9px 8px}
.dspm_listDesc{display:none}
.dspm_listItemActive .dspm_listDesc{display:block}
.dspm_listName{font-size:14px}
.dspm_listMeta{font-size:10.5px}
.dspm_tabBar{gap:0 16px}
}
`;

    function injectCss() { if (typeof document === "undefined") return; const tagId = "dsh-preset-editor/client.css"; if (document.querySelector('style[data-plugin-css="' + tagId + '"]')) return; const tag = document.createElement("style"); tag.dataset.plugin = "dsh-preset-editor"; tag.dataset.pluginCss = tagId; tag.textContent = CSS; document.head.appendChild(tag); }

    const inject = ["slots"];
    function apply(ctx) {
      injectCss();
      let disposeLocale;
      try { disposeLocale = registerLocale(ctx); if (typeof disposeLocale === "function") ctx.effect(() => disposeLocale, "preset-editor: locale dictionary"); } catch (_) { disposeLocale = undefined; }
      const t = copyFor(ctx);
      if (!ctx.slots) return;
      try {
        ctx.slots.inject("main", () => ctx.slots.inject("sidebar.panellist", () => {
          const stopMain = ctx.slots.register({
            name: "main",
            key: PRESET_PANEL_ID,
            inject: () => ({ t }),
          }, MainPanel);
          const stopIcon = ctx.slots.register({
            name: "sidebar.panellist",
            id: PRESET_PANEL_ID,
            order: 32,
            label: () => t("nav"),
            locale: NS,
          }, SidebarIcon);
          return () => { stopIcon(); stopMain(); };
        }));
      } catch (_) {
        // Older shells without native sidebar panel seats: keep a Settings section fallback? No — the requested location is the sidebar.
      }
    }
    exports.apply = apply;
    exports.inject = inject;
    exports.MainPanel = MainPanel;
    exports.SidebarIcon = SidebarIcon;
    return module.exports;
  }
});
