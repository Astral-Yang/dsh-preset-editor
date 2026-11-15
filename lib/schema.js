/**
 * Persistent document schema, migration, and request validation.
 *
 * The document is versioned and normalized field by field so a damaged or
 * forward-migrated file cannot crash the host. Request validation is strict:
 * the management API reports every field error instead of partially applying a
 * write.
 *
 * @module dsh-preset-editor/schema
 */

import { boundedString, isPlainObject, nowIso, slugify } from './util.js'

/** Current on-disk format. */
export const STATE_VERSION = 1

/** Tool-selection modes accepted by a preset. */
export const TOOL_MODES = Object.freeze(['all', 'allow', 'deny'])

/** Assignment modes accepted for one Session. */
export const SESSION_MODES = Object.freeze(['manual', 'follow', 'none'])

/** Display-name ceiling. */
export const MAX_NAME = 80

/** Description ceiling. */
export const MAX_DESCRIPTION = 500

/** Tool-name ceiling. */
export const MAX_TOOL_NAME = 160

/** Per-list tool ceiling. */
export const MAX_TOOLS = 5000

/** Id ceiling. */
export const MAX_ID = 64

/** Return an empty, valid document. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    generation: 0,
    presets: [],
    defaultPresetId: null,
    workspaces: {},
    sessions: {},
    updatedAt: 0,
  }
}

/** Whether a string is a usable tool name (non-empty printable ASCII, no spaces). */
export function isToolName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_TOOL_NAME
    && /^[\x21-\x7e]+$/.test(value)
}

/** Whether a string is a usable preset id. */
export function isPresetId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value) && value.length <= MAX_ID
}

/** Normalize an id-like or bounded label without interpreting it. */
function boundedId(value, max = 200) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : ''
}

/** Convert a tool list to unique, valid names; invalid entries are reported. */
export function normalizeToolList(value, warnings, label) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    warnings.push(`${label} 必须是字符串数组，已忽略`)
    return []
  }
  const seen = new Set()
  const result = []
  for (const item of value) {
    if (!isToolName(item)) {
      warnings.push(`${label} 中的 ${JSON.stringify(item)} 不是合法工具名，已忽略`)
      continue
    }
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
    if (result.length >= MAX_TOOLS) {
      warnings.push(`${label} 超过 ${MAX_TOOLS} 项，已截断`)
      break
    }
  }
  return result
}

/** Normalize one preset from a persisted document. */
function normalizeStoredPreset(raw, warnings, index) {
  if (!isPlainObject(raw)) {
    warnings.push(`预设 #${index + 1} 不是对象，已忽略`)
    return undefined
  }
  const id = boundedId(raw.id, MAX_ID)
  if (!isPresetId(id)) {
    warnings.push(`预设 #${index + 1} 的 id 无效，已忽略`)
    return undefined
  }
  const name = boundedString(raw.name, MAX_NAME)
  if (!name) {
    warnings.push(`预设 ${id} 缺少名称，已忽略`)
    return undefined
  }
  const tools = isPlainObject(raw.tools) ? raw.tools : {}
  const mode = TOOL_MODES.includes(tools.mode) ? tools.mode : 'all'
  if (tools.mode !== undefined && !TOOL_MODES.includes(tools.mode)) {
    warnings.push(`预设 ${id} 的工具模式无效，已回退为 all`)
  }
  const allow = normalizeToolList(tools.allow, warnings, `预设 ${id} 的 allow`)
  const deny = normalizeToolList(tools.deny, warnings, `预设 ${id} 的 deny`)
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso()
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt
  return {
    id,
    name,
    description: boundedString(raw.description, MAX_DESCRIPTION),
    persona: typeof raw.persona === 'string' ? raw.persona : '',
    tools: { mode, allow, deny },
    enabled: raw.enabled !== false,
    order: Number.isSafeInteger(raw.order) ? raw.order : index,
    createdAt,
    updatedAt,
  }
}

/** Normalize one Session assignment from a persisted document. */
function normalizeStoredSession(raw, limits, warnings) {
  if (raw === null) return { presetId: null, mode: 'follow', origin: 'legacy', at: 0 }
  if (typeof raw === 'string') {
    return { presetId: boundedId(raw, MAX_ID), mode: 'manual', origin: 'legacy', at: 0 }
  }
  if (!isPlainObject(raw)) return undefined
  const mode = SESSION_MODES.includes(raw.mode) ? raw.mode : (typeof raw.presetId === 'string' ? 'manual' : 'none')
  const presetId = typeof raw.presetId === 'string' && raw.presetId.length > 0
    ? boundedId(raw.presetId, MAX_ID)
    : null
  if (mode === 'manual' && presetId === null) return { presetId: null, mode: 'none', origin: 'legacy', at: 0 }
  if (mode !== 'manual' && presetId !== null) {
    warnings.push('会话分配模式与 presetId 不一致，已按 presetId 推断')
  }
  const effectiveMode = presetId !== null ? 'manual' : mode
  return {
    presetId: effectiveMode === 'manual' ? presetId : null,
    mode: effectiveMode,
    origin: boundedString(raw.origin, 40) || (effectiveMode === 'follow' ? 'follow' : 'manual'),
    at: Number.isFinite(raw.at) ? Number(raw.at) : 0,
  }
}

/**
 * Normalize any persisted value into the current document.
 *
 * @param {unknown} value - parsed JSON.
 * @param {{ maxPresets: number, maxPersonaChars: number, maxSessionAssignments: number }} limits - deployment caps.
 * @returns {{ state: object, warnings: string[], future: boolean }}
 */
export function normalizeState(value, limits) {
  const warnings = []
  const raw = isPlainObject(value) ? value : {}
  const future = Number.isFinite(raw.version) && Number(raw.version) > STATE_VERSION
  if (future) {
    warnings.push(`状态文件版本 ${raw.version} 高于插件支持的 ${STATE_VERSION}；已按当前格式尽力读取，保存前请备份`)
  } else if (raw.version !== undefined && raw.version !== STATE_VERSION) {
    warnings.push(`状态文件版本 ${raw.version} 已迁移到 ${STATE_VERSION}`)
  }
  if (!isPlainObject(value)) {
    warnings.push('状态文件不是 JSON 对象，已使用空配置')
  }

  const seen = new Set()
  const presets = []
  if (Array.isArray(raw.presets)) {
    for (const [index, item] of raw.presets.entries()) {
      const preset = normalizeStoredPreset(item, warnings, index)
      if (!preset) continue
      if (seen.has(preset.id)) {
        warnings.push(`重复的预设 id ${preset.id}，已保留第一项`)
        continue
      }
      if (preset.persona.length > limits.maxPersonaChars) {
        warnings.push(`预设 ${preset.id} 的人格文本超过 ${limits.maxPersonaChars} 字符，已截断`)
        preset.persona = preset.persona.slice(0, limits.maxPersonaChars)
      }
      seen.add(preset.id)
      presets.push(preset)
      if (presets.length >= limits.maxPresets) {
        warnings.push(`预设数量超过上限 ${limits.maxPresets}，其余已忽略`)
        break
      }
    }
  } else if (raw.presets !== undefined) {
    warnings.push('presets 必须是数组，已忽略')
  }

  const defaultPresetId = typeof raw.defaultPresetId === 'string' && raw.defaultPresetId.length > 0
    ? boundedId(raw.defaultPresetId, MAX_ID)
    : null

  const workspaces = {}
  if (isPlainObject(raw.workspaces)) {
    for (const [key, item] of Object.entries(raw.workspaces)) {
      const workspaceId = boundedId(key, 200)
      if (!workspaceId) {
        warnings.push('忽略无效的工作区 id')
        continue
      }
      workspaces[workspaceId] = typeof item === 'string' && item.length > 0 ? boundedId(item, MAX_ID) : null
    }
  } else if (raw.workspaces !== undefined) {
    warnings.push('workspaces 必须是对象，已忽略')
  }

  const sessionEntries = []
  if (isPlainObject(raw.sessions)) {
    for (const [key, item] of Object.entries(raw.sessions)) {
      const sessionId = boundedId(key, 200)
      if (!sessionId) {
        warnings.push('忽略无效的会话 id')
        continue
      }
      const assignment = normalizeStoredSession(item, limits, warnings)
      if (assignment) sessionEntries.push([sessionId, assignment])
    }
  } else if (raw.sessions !== undefined) {
    warnings.push('sessions 必须是对象，已忽略')
  }
  sessionEntries.sort((left, right) => right[1].at - left[1].at)
  const sessions = {}
  for (const [sessionId, assignment] of sessionEntries.slice(0, limits.maxSessionAssignments)) {
    sessions[sessionId] = assignment
  }
  if (sessionEntries.length > limits.maxSessionAssignments) {
    warnings.push(`会话分配超过上限 ${limits.maxSessionAssignments}，已按最近使用时间保留`)
  }

  const state = {
    version: STATE_VERSION,
    generation: Number.isSafeInteger(raw.generation) && raw.generation >= 0 ? raw.generation : 0,
    presets,
    defaultPresetId,
    workspaces,
    sessions,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  }
  return { state, warnings, future }
}

/**
 * Validate a management request for a preset's editable fields.
 *
 * @param {unknown} input - request body.
 * @param {{ maxPersonaChars: number }} limits - deployment caps.
 * @returns {{ ok: true, preset: object } | { ok: false, errors: string[] }}
 */
export function validatePresetInput(input, limits) {
  const errors = []
  if (!isPlainObject(input)) return { ok: false, errors: ['请求体必须是 JSON 对象'] }

  const name = boundedString(input.name, MAX_NAME)
  if (!name) errors.push('预设名称不能为空')
  if (typeof input.name === 'string' && input.name.trim().length > MAX_NAME) {
    errors.push(`预设名称不能超过 ${MAX_NAME} 字符`)
  }

  let description = ''
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') errors.push('描述必须是字符串')
    else {
      description = input.description.trim()
      if (description.length > MAX_DESCRIPTION) errors.push(`描述不能超过 ${MAX_DESCRIPTION} 字符`)
    }
  }

  let persona = ''
  if (input.persona !== undefined) {
    if (typeof input.persona !== 'string') errors.push('人格提示词必须是字符串')
    else {
      persona = input.persona
      if (persona.length > limits.maxPersonaChars) {
        errors.push(`人格提示词不能超过 ${limits.maxPersonaChars} 字符`)
      }
    }
  }

  let toolsInput = {}
  if (input.tools !== undefined) {
    if (!isPlainObject(input.tools)) errors.push('tools 必须是对象')
    else toolsInput = input.tools
  }
  const mode = toolsInput.mode === undefined ? 'all' : toolsInput.mode
  if (!TOOL_MODES.includes(mode)) errors.push(`工具模式必须是 ${TOOL_MODES.join(' / ')}`)

  const listErrors = []
  const allow = normalizeToolList(toolsInput.allow, listErrors, 'allow')
  const deny = normalizeToolList(toolsInput.deny, listErrors, 'deny')
  errors.push(...listErrors)
  if (mode === 'deny' && deny.length === 0) {
    // An empty deny list is a valid no-op, but it is almost always a mistake.
    // Keep it accepted and let the UI explain; no error is necessary.
  }

  let enabled = true
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') errors.push('enabled 必须是布尔值')
    else enabled = input.enabled
  }

  let order = 0
  if (input.order !== undefined) {
    if (!Number.isSafeInteger(input.order)) errors.push('order 必须是整数')
    else order = input.order
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    preset: {
      name,
      description,
      persona,
      tools: { mode, allow, deny },
      enabled,
      order,
    },
  }
}

/** Compute a unique display identifier for a new preset. */
export function makePresetId(name, existingIds) {
  const stem = slugify(name) || 'preset'
  let candidate = stem.slice(0, MAX_ID)
  if (!existingIds.has(candidate)) return candidate
  for (let index = 2; index < 10000; index += 1) {
    const suffix = `-${index}`
    candidate = `${stem.slice(0, MAX_ID - suffix.length)}${suffix}`
    if (!existingIds.has(candidate)) return candidate
  }
  return `preset-${Date.now().toString(36)}`
}

/** Build a new preset object from validated input. */
export function createPreset(input, existingIds) {
  const now = nowIso()
  return {
    id: makePresetId(input.name, existingIds),
    name: input.name,
    description: input.description,
    persona: input.persona,
    tools: input.tools,
    enabled: input.enabled,
    order: input.order,
    createdAt: now,
    updatedAt: now,
  }
}