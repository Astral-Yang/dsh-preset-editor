/**
 * Read-only composition preview for one native Agent preset.
 *
 * The preview is intentionally a *preset-scope* snapshot: it assembles the
 * preset's prompt sections, static runtime contexts, variables and tool
 * declarations without a live Agent. Runtime contexts that require a Session
 * (cwd, sandbox, approval, ...) are therefore empty and are labelled as such.
 *
 * @module dsh-preset-editor/preview
 */

import { classifyTool, PROTECTED_PROMPT_SECTIONS, RUN_CODE_NAME } from './catalog.js'
import { promptFilterFor, permitsPrompt } from './native-runtime.js'
import { permitsTool } from './runtime.js'
import { PresetError } from './store.js'
import { messageOf } from './util.js'

/** Short preview budget for one section/context. */
export const SECTION_PREVIEW_CHARS = 240
/** Short preview budget for the rendered prompt. */
export const PROMPT_PREVIEW_CHARS = 1600
/** Hard cap for an on-demand full text response. */
export const MAX_FULL_CHARS = 200000

function clip(text, max) {
  const value = typeof text === 'string' ? text : ''
  return value.length > max ? value.slice(0, max) : value
}

function originOf(name) {
  const separator = String(name).indexOf(':')
  return separator > 0 ? String(name).slice(0, separator) : 'global'
}

function parameterCount(schema) {
  const properties = schema && typeof schema === 'object' ? schema.properties : undefined
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.keys(properties).length
    : 0
}

/**
 * Best-effort mirror of DSH's prompt interpolation. Unknown or malformed
 * references are preserved and reported instead of failing the whole preview;
 * the runtime itself remains authoritative and may reject them.
 */
function interpolateText(input, variables) {
  const text = typeof input?.text === 'string' ? input.text : ''
  if (input?.interpolate === false) return { text, warnings: [], unresolved: [] }
  const warnings = []
  const unresolved = []
  let result = ''
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const rest = text.slice(open)
    const group = /^\{\{([^{}]*)\}\}/.exec(rest)
    if (group === null) {
      if (text.indexOf('}}', open + 2) >= 0) warnings.push(`提示词段/上下文 "${input?.name ?? '?'}" 的变量引用格式不正确`)
      result += text.slice(last, open + 2)
      last = open + 2
      continue
    }
    const name = group[1]
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      warnings.push(`提示词段/上下文 "${input?.name ?? '?'}" 的变量引用 {{${name}}} 格式不正确`)
      result += text.slice(last, open + group[0].length)
    } else if (!Object.hasOwn(variables ?? {}, name) || variables?.[name] === undefined) {
      unresolved.push(name)
      result += text.slice(last, open + group[0].length)
    } else {
      result += text.slice(last, open) + String(variables[name])
    }
    last = open + group[0].length
  }
  return { text: result + text.slice(last), warnings, unresolved }
}

function sectionRows(assembly, promptFilter) {
  const warnings = []
  const unresolved = new Set()
  const rows = (assembly?.sections ?? []).map((section, index) => {
    const allowed = permitsPrompt(promptFilter, section?.name)
    const interpolated = interpolateText(section, assembly?.variables)
    warnings.push(...interpolated.warnings)
    for (const name of interpolated.unresolved) unresolved.add(name)
    return {
      index,
      name: String(section?.name ?? ''),
      origin: originOf(section?.name),
      protected: PROTECTED_PROMPT_SECTIONS.has(section?.name),
      filtered: !allowed,
      chars: interpolated.text.length,
      preview: clip(interpolated.text, SECTION_PREVIEW_CHARS),
      text: interpolated.text,
    }
  }).filter((row) => row.name.length > 0)
  return { rows, warnings, unresolved: [...unresolved] }
}

function contextRows(assembly) {
  const warnings = []
  const unresolved = new Set()
  const rows = (assembly?.contexts ?? []).map((context, index) => {
    const interpolated = interpolateText(context, assembly?.variables)
    warnings.push(...interpolated.warnings)
    for (const name of interpolated.unresolved) unresolved.add(name)
    return {
      index,
      name: String(context?.name ?? ''),
      chars: interpolated.text.length,
      active: interpolated.text.length > 0,
      preview: clip(interpolated.text, SECTION_PREVIEW_CHARS),
      text: interpolated.text,
    }
  }).filter((row) => row.name.length > 0)
  return { rows, warnings, unresolved: [...unresolved] }
}

function renderPrompt(rows) {
  return rows
    .filter((row) => !row.filtered && row.text.length > 0)
    .map((row) => row.text)
    .join('\n\n')
}

function toolRows(assembly, overlay, restrictableNames) {
  const toolFilter = overlay && overlay.enabled !== false ? overlay.tools : null
  const warnings = []
  const items = (assembly?.tools ?? []).map((schema) => {
    const name = String(schema?.name ?? '')
    const allowed = permitsTool({ tools: toolFilter ?? { mode: 'all', allow: [], deny: [] } }, name)
    const restrictable = restrictableNames === null ? name !== RUN_CODE_NAME : restrictableNames.has(name)
    let visibility = 'visible'
    if (!allowed) {
      if (restrictable === false) visibility = 'guard-only'
      else if (restrictable === true) visibility = 'hidden'
      else visibility = 'unknown'
    }
    const classified = classifyTool(name)
    return {
      name,
      description: typeof schema?.description === 'string' ? schema.description : '',
      origin: classified.origin,
      server: classified.server,
      parameterCount: parameterCount(schema?.parameters),
      allowed,
      restrictable,
      visibility,
      guard: allowed ? 'allow' : 'deny',
      schema,
    }
  }).filter((item) => item.name.length > 0)
  const counts = { total: items.length, visible: 0, hidden: 0, guardOnly: 0, unknown: 0 }
  for (const item of items) {
    if (item.visibility === 'visible') counts.visible += 1
    else if (item.visibility === 'hidden') counts.hidden += 1
    else if (item.visibility === 'guard-only') counts.guardOnly += 1
    else counts.unknown += 1
  }
  return { items, counts, warnings }
}

function overlayView(overlay) {
  return {
    enabled: !overlay || overlay.enabled !== false,
    tools: overlay?.tools ?? { mode: 'all', allow: [], deny: [] },
    prompts: overlay?.prompts ?? { mode: 'all', allow: [], deny: [] },
  }
}

function capabilityView(preset, toolItems) {
  const rows = Array.isArray(preset?.plugins) ? preset.plugins : []
  return {
    pluginRows: rows.length,
    enabledPluginRows: rows.filter((row) => row && row.disabled !== true).length,
    mcpTools: toolItems.filter((item) => item.origin === 'mcp').length,
  }
}

/**
 * Build the full preview data for one native preset.
 * @param {object} options - ctx, scope, native, id, logger.
 * @returns {Promise<object>} full preview data (text/schema retained).
 */
export async function buildPresetPreview({ ctx, scope, native, id, logger }) {
  const registry = scope.get?.('agentPresets')
  const systemPrompt = ctx.systemPrompt ?? ctx.get?.('systemPrompt')
  if (!registry || typeof registry.acquireScope !== 'function') {
    throw new PresetError('PREVIEW_UNAVAILABLE', '当前部署没有 agentPresets 服务', 503)
  }
  if (!systemPrompt || typeof systemPrompt.assemble !== 'function') {
    throw new PresetError('PREVIEW_UNAVAILABLE', '当前部署没有 systemPrompt 服务', 503)
  }
  const preset = await native.read(id)
  const overlay = native.overlay(id) ?? preset?.overlay ?? null
  let lease
  let assembly
  try {
    lease = await registry.acquireScope(id)
    assembly = await systemPrompt.assemble({ scope: lease.key })
  } catch (error) {
    throw new PresetError('PREVIEW_FAILED', `组装 ${id} 的 prompt 失败：${messageOf(error)}`, 500)
  } finally {
    try { await lease?.[Symbol.asyncDispose]?.() } catch { /* release failure must not hide the preview */ }
  }

  const promptFilter = promptFilterFor(overlay)
  const sections = sectionRows(assembly, promptFilter)
  const contexts = contextRows(assembly)
  const rendered = renderPrompt(sections.rows)
  const warnings = [...sections.warnings, ...contexts.warnings]
  const notes = []
  const unresolvedVariables = [...new Set([...sections.unresolved, ...contexts.unresolved])]
  if (unresolvedVariables.length > 0) warnings.push(`未插值变量：${unresolvedVariables.map((name) => `{{${name}}}`).join(', ')}。预设级预览没有会话级变量值（例如 modelSelection/model）；实际发送时由会话填充。`)

  const tools = toolRows(assembly, overlay, null)
  warnings.push(...tools.warnings)

  const persona = (preset?.plugins ?? []).find((row) => row && row.name === '@deepseek-ai/dsh-persona')
  const personaComplete = persona?.config?.complete === true
  if (personaComplete) warnings.push('该预设的人格开启完整提示词模式（complete）；DSH 会把它恢复为唯一提示词段，其他提示词段的预览可能与实际发送不同。')
  if (contexts.rows.length === 0 || contexts.rows.every((row) => row.chars === 0)) notes.push('预设级快照没有可用的运行时上下文；当前目录、沙箱、审批等上下文需要真实会话/Agent 才会出现。')
  if (tools.items.length === 0) warnings.push('该预设没有返回工具声明；请确认工具执行器与预设作用域已加载。')
  if (preset?.pluginError) warnings.push(`预设组合读取失败：${preset.pluginError}`)
  notes.push('工具可见性为静态模拟：只反映预设作用域内的声明；Agent 额外注册的工具与实际工具集准入不在快照内。')

  return {
    id: preset.id,
    name: preset.name ?? preset.id,
    description: preset.description ?? '',
    mode: preset.mode ?? 'builtin',
    builtIn: Boolean(preset.builtIn),
    generatedAt: new Date().toISOString(),
    prompt: {
      rendered,
      chars: rendered.length,
      sections: sections.rows,
      contexts: contexts.rows,
      variables: assembly?.variables ?? {},
      filter: promptFilter,
      complete: personaComplete,
      unresolvedVariables,
    },
    tools: {
      overlay: overlayView(overlay),
      items: tools.items,
      counts: tools.counts,
    },
    capabilities: capabilityView(preset, tools.items),
    warnings: [...new Set(warnings)],
    notes: [...new Set(notes)],
  }
}

/** Project the full preview onto the lightweight summary returned by default. */
export function previewSummary(data) {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    mode: data.mode,
    builtIn: data.builtIn,
    generatedAt: data.generatedAt,
    prompt: {
      renderedPreview: clip(data.prompt.rendered, PROMPT_PREVIEW_CHARS),
      renderedChars: data.prompt.chars,
      renderedTruncated: data.prompt.chars > PROMPT_PREVIEW_CHARS,
      sections: data.prompt.sections.map(({ text, ...row }) => row),
      contexts: data.prompt.contexts.map(({ text, ...row }) => row),
      variables: data.prompt.variables,
      filter: data.prompt.filter,
      complete: data.prompt.complete,
      unresolvedVariables: data.prompt.unresolvedVariables,
    },
    tools: {
      overlay: data.tools.overlay,
      items: data.tools.items.map(({ schema, ...row }) => row),
      counts: data.tools.counts,
    },
    capabilities: data.capabilities,
    warnings: data.warnings,
    notes: data.notes,
  }
}

/** Select one on-demand full text/tool part from preview data. */
export function previewPart(data, part, name) {
  if (part === 'prompt') {
    const text = data.prompt.rendered
    return { part, name: null, text: clip(text, MAX_FULL_CHARS), chars: text.length, truncated: text.length > MAX_FULL_CHARS }
  }
  if (part === 'section' || part === 'context') {
    const list = part === 'section' ? data.prompt.sections : data.prompt.contexts
    const row = list.find((item) => item.name === name)
    if (!row) throw new PresetError('PREVIEW_PART_NOT_FOUND', `未找到 ${part} ${name}`, 404)
    return { part, name, text: clip(row.text, MAX_FULL_CHARS), chars: row.chars, truncated: row.chars > MAX_FULL_CHARS }
  }
  if (part === 'tool') {
    const row = data.tools.items.find((item) => item.name === name)
    if (!row) throw new PresetError('PREVIEW_PART_NOT_FOUND', `未找到工具 ${name}`, 404)
    return {
      part,
      name,
      description: row.description,
      origin: row.origin,
      parameterCount: row.parameterCount,
      allowed: row.allowed,
      visibility: row.visibility,
      schema: row.schema,
    }
  }
  throw new PresetError('INVALID_INPUT', `不支持的预览 part：${part}`, 400)
}


