/**
 * Preset domain operations over one {@link PresetStore}.
 *
 * This module owns identity, name uniqueness, usage accounting, fallback
 * resolution, and scope assignment. It knows nothing about Agents or tools.
 *
 * @module dsh-preset-editor/manager
 */

import { PresetError } from './store.js'
import { MAX_NAME, createPreset as buildPreset, validatePresetInput } from './schema.js'
import { cloneJson, nowIso } from './util.js'

/** Return whether a requested preset is usable in a preset's current state. */
function isUsable(preset) {
  return preset !== undefined && preset.enabled === true
}

/** Detach and sort a preset roster. */
function sortedPresets(state) {
  return [...state.presets].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  }).map((preset) => cloneJson(preset))
}

/**
 * Domain service over the persistent document.
 */
export class PresetManager {
  /**
   * @param {object} options - manager options.
   * @param {import('./store.js').PresetStore} options.store - persistence.
   * @param {{ maxPresets: number, maxPersonaChars: number }} options.limits - caps.
   * @param {{ warn: Function }} options.logger - logger.
   */
  constructor({ store, limits, logger }) {
    this.store = store
    this.limits = limits
    this.logger = logger
  }

  /** Full preset roster. */
  list() {
    return sortedPresets(this.store.getState())
  }

  /** One preset or undefined. */
  get(id) {
    const preset = this.store.getState().presets.find((item) => item.id === id)
    return preset === undefined ? undefined : cloneJson(preset)
  }

  /** Remove a Session assignment entry (used by diagnostics and tests). */
  forgetSession(sessionId) {
    return this.store.transact((draft) => {
      delete draft.sessions[sessionId]
    })
  }

  /** Names of presets currently in use. */
  usage(id) {
    const state = this.store.getState()
    const workspaces = Object.entries(state.workspaces)
      .filter(([, presetId]) => presetId === id)
      .map(([workspaceId]) => workspaceId)
    const sessions = Object.entries(state.sessions)
      .filter(([, assignment]) => assignment.mode === 'manual' && assignment.presetId === id)
      .map(([sessionId]) => sessionId)
    return {
      default: state.defaultPresetId === id,
      workspaces,
      sessions,
      total: (state.defaultPresetId === id ? 1 : 0) + workspaces.length + sessions.length,
    }
  }

  /** Throw when the name collides case-insensitively. */
  #assertUniqueName(draft, name, excludeId = undefined) {
    const folded = name.toLocaleLowerCase('zh-Hans-CN')
    const conflict = draft.presets.find((preset) => preset.id !== excludeId
      && preset.name.toLocaleLowerCase('zh-Hans-CN') === folded)
    if (conflict) {
      throw new PresetError('DUPLICATE_NAME', `已存在同名预设「${conflict.name}」`, 409, { presetId: conflict.id })
    }
  }

  /** Ensure an id names a preset, optionally requiring it enabled. */
  #requirePreset(draft, id, { enabled = false } = {}) {
    const preset = draft.presets.find((item) => item.id === id)
    if (!preset) throw new PresetError('PRESET_NOT_FOUND', `预设 ${id} 不存在`, 404)
    if (enabled && !preset.enabled) {
      throw new PresetError('PRESET_DISABLED', `预设「${preset.name}」已停用`, 409, { presetId: id })
    }
    return preset
  }

  /** Create a preset. */
  async create(input, expectedGeneration = undefined) {
    const validated = validatePresetInput(input, this.limits)
    if (!validated.ok) throw new PresetError('INVALID_PRESET', validated.errors.join('；'), 400, { errors: validated.errors })
    const { state, result } = await this.store.transact((draft) => {
      this.#assertUniqueName(draft, validated.preset.name)
      if (draft.presets.length >= this.limits.maxPresets) {
        throw new PresetError('PRESET_LIMIT', `预设数量不能超过 ${this.limits.maxPresets}`, 409)
      }
      const order = draft.presets.reduce((max, item) => Math.max(max, item.order), -1) + 1
      const preset = buildPreset(
        { ...validated.preset, order: input.order !== undefined ? validated.preset.order : order },
        new Set(draft.presets.map((item) => item.id)),
      )
      draft.presets.push(preset)
      return preset
    }, expectedGeneration)
    return { preset: cloneJson(result), generation: state.generation }
  }

  /** Update editable fields; id and creation time are stable. */
  async update(id, input, expectedGeneration = undefined) {
    const validated = validatePresetInput(input, this.limits)
    if (!validated.ok) throw new PresetError('INVALID_PRESET', validated.errors.join('；'), 400, { errors: validated.errors })
    const { state, result } = await this.store.transact((draft) => {
      const preset = this.#requirePreset(draft, id)
      this.#assertUniqueName(draft, validated.preset.name, id)
      preset.name = validated.preset.name
      preset.description = validated.preset.description
      preset.persona = validated.preset.persona
      preset.tools = validated.preset.tools
      preset.enabled = validated.preset.enabled
      if (input.order !== undefined) preset.order = validated.preset.order
      preset.updatedAt = nowIso()
      return preset
    }, expectedGeneration)
    return { preset: cloneJson(result), generation: state.generation }
  }

  /** Duplicate a preset with a fresh identity. */
  async duplicate(id, expectedGeneration = undefined) {
    const { state, result } = await this.store.transact((draft) => {
      const source = this.#requirePreset(draft, id)
      let base = `${source.name} 副本`
      if (base.length > MAX_NAME) base = `${source.name.slice(0, MAX_NAME - 3)} 副本`
      let name = base
      for (let index = 2; index < 1000; index += 1) {
        const folded = name.toLocaleLowerCase('zh-Hans-CN')
        if (!draft.presets.some((item) => item.name.toLocaleLowerCase('zh-Hans-CN') === folded)) break
        name = `${base.slice(0, Math.max(1, MAX_NAME - String(index).length - 1))} ${index}`
      }
      const order = draft.presets.reduce((max, item) => Math.max(max, item.order), -1) + 1
      const copy = buildPreset(
        {
          name,
          description: source.description,
          persona: source.persona,
          tools: cloneJson(source.tools),
          enabled: source.enabled,
          order,
        },
        new Set(draft.presets.map((item) => item.id)),
      )
      draft.presets.push(copy)
      return copy
    }, expectedGeneration)
    return { preset: cloneJson(result), generation: state.generation }
  }

  /**
   * Delete a preset. In-use deletion needs `force` and either an explicit
   * replacement (`reassignTo`) or a fallback to the next scope.
   */
  async remove(id, { force = false, reassignTo = undefined } = {}, expectedGeneration = undefined) {
    const { state, result } = await this.store.transact((draft) => {
      const preset = this.#requirePreset(draft, id)
      const usage = {
        default: draft.defaultPresetId === id,
        workspaces: Object.entries(draft.workspaces).filter(([, presetId]) => presetId === id).map(([key]) => key),
        sessions: Object.entries(draft.sessions)
          .filter(([, assignment]) => assignment.mode === 'manual' && assignment.presetId === id)
          .map(([key]) => key),
      }
      usage.total = (usage.default ? 1 : 0) + usage.workspaces.length + usage.sessions.length
      if (usage.total > 0 && force !== true) {
        throw new PresetError('PRESET_IN_USE', `预设「${preset.name}」仍在使用中`, 409, { usage })
      }
      if (reassignTo !== undefined && reassignTo !== null && reassignTo !== id) {
        this.#requirePreset(draft, reassignTo, { enabled: true })
      }
      const replacement = reassignTo === undefined || reassignTo === null || reassignTo === id ? null : reassignTo
      if (draft.defaultPresetId === id) draft.defaultPresetId = replacement
      for (const [workspaceId, presetId] of Object.entries(draft.workspaces)) {
        if (presetId === id) draft.workspaces[workspaceId] = replacement
      }
      for (const assignment of Object.values(draft.sessions)) {
        if (assignment.mode === 'manual' && assignment.presetId === id) {
          assignment.presetId = replacement
          assignment.mode = replacement === null ? 'follow' : 'manual'
          assignment.origin = 'reassigned'
          assignment.at = Date.now()
        }
      }
      const index = draft.presets.findIndex((item) => item.id === id)
      if (index < 0) throw new PresetError('PRESET_NOT_FOUND', `预设 ${id} 不存在`, 404)
      draft.presets.splice(index, 1)
      return { deleted: preset, usage, replacement }
    }, expectedGeneration)
    return { ...cloneJson(result), generation: state.generation }
  }

  /** Set the global default (null means no global preset). */
  async setDefault(presetId, expectedGeneration = undefined) {
    const { state } = await this.store.transact((draft) => {
      if (presetId !== null) {
        if (typeof presetId !== 'string') throw new PresetError('INVALID_SCOPE', 'presetId 必须是字符串或 null', 400)
        this.#requirePreset(draft, presetId)
      }
      draft.defaultPresetId = presetId
    }, expectedGeneration)
    return state.generation
  }

  /** Set one workspace default (null inherits the global default). */
  async setWorkspace(workspaceId, presetId, expectedGeneration = undefined) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0 || workspaceId.length > 200) {
      throw new PresetError('INVALID_SCOPE', '工作区 id 无效', 400)
    }
    const { state } = await this.store.transact((draft) => {
      if (presetId !== null) {
        if (typeof presetId !== 'string') throw new PresetError('INVALID_SCOPE', 'presetId 必须是字符串或 null', 400)
        this.#requirePreset(draft, presetId)
      }
      if (presetId === null) delete draft.workspaces[workspaceId]
      else draft.workspaces[workspaceId] = presetId
    }, expectedGeneration)
    return state.generation
  }

  /** Set one Session assignment. */
  async setSession(sessionId, { mode, presetId }, expectedGeneration = undefined) {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 200) {
      throw new PresetError('INVALID_SCOPE', '会话 id 无效', 400)
    }
    if (!['manual', 'follow', 'none'].includes(mode)) {
      throw new PresetError('INVALID_SCOPE', '会话模式必须是 manual / follow / none', 400)
    }
    const { state, result } = await this.store.transact((draft) => {
      if (mode === 'manual') {
        if (typeof presetId !== 'string') throw new PresetError('INVALID_SCOPE', 'manual 模式需要 presetId', 400)
        this.#requirePreset(draft, presetId, { enabled: true })
      }
      const assignment = {
        presetId: mode === 'manual' ? presetId : null,
        mode,
        origin: 'manual',
        at: Date.now(),
      }
      draft.sessions[sessionId] = assignment
      return assignment
    }, expectedGeneration)
    return { assignment: cloneJson(result), generation: state.generation }
  }

  /** Remove one Session assignment, returning it to the resolved chain. */
  async clearSession(sessionId, expectedGeneration = undefined) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new PresetError('INVALID_SCOPE', '会话 id 无效', 400)
    }
    const { state } = await this.store.transact((draft) => {
      delete draft.sessions[sessionId]
    }, expectedGeneration)
    return state.generation
  }

  /**
   * Resolve the effective preset for a Session and workspace without writing.
   * @returns {{ preset: object|null, source: 'session'|'workspace'|'global'|'none', requestedSession: string|null, fallback: string|undefined }}
   */
  resolve(sessionId, workspaceId) {
    const state = this.store.getState()
    const assignment = sessionId ? state.sessions[sessionId] : undefined
    let fallback
    if (assignment?.mode === 'none') {
      return { preset: null, source: 'none', requestedSession: null, fallback: undefined }
    }
    if (assignment?.mode === 'manual' && assignment.presetId) {
      const preset = state.presets.find((item) => item.id === assignment.presetId)
      if (isUsable(preset)) {
        return { preset: cloneJson(preset), source: 'session', requestedSession: assignment.presetId, fallback: undefined }
      }
      fallback = preset === undefined
        ? `会话指定的预设 ${assignment.presetId} 已不存在`
        : `会话指定的预设「${preset.name}」已停用`
    }
    const workspacePresetId = workspaceId ? state.workspaces[workspaceId] : undefined
    if (workspacePresetId) {
      const preset = state.presets.find((item) => item.id === workspacePresetId)
      if (isUsable(preset)) {
        return {
          preset: cloneJson(preset),
          source: 'workspace',
          requestedSession: assignment?.presetId ?? null,
          fallback,
        }
      }
      fallback = preset === undefined
        ? `工作区预设 ${workspacePresetId} 已不存在`
        : `工作区预设「${preset.name}」已停用`
    }
    const defaultId = state.defaultPresetId
    if (defaultId) {
      const preset = state.presets.find((item) => item.id === defaultId)
      if (isUsable(preset)) {
        return {
          preset: cloneJson(preset),
          source: 'global',
          requestedSession: assignment?.presetId ?? null,
          fallback,
        }
      }
      fallback = preset === undefined
        ? `全局预设 ${defaultId} 已不存在`
        : `全局预设「${preset.name}」已停用`
    }
    return {
      preset: null,
      source: 'none',
      requestedSession: assignment?.presetId ?? null,
      fallback,
    }
  }

  /**
   * Resolve a Session that is being attached to a live Agent and pin the
   * creation-time choice. A Session already pinned keeps its assignment (and
   * its selected preset survives restarts); an explicit follow assignment is
   * pinned now; a Session with no assignment inherits and pins the workspace or
   * global default.
   *
   * @returns {Promise<{ preset: object|null, source: string, assignment: object, fallback: string|undefined }>}
   */
  async attachSession(sessionId, workspaceId, options = {}) {
    const existing = this.store.getState().sessions[sessionId]
    if (existing) {
      const resolved = this.resolve(sessionId, workspaceId)
      if (existing.at < Date.now() - 60_000) {
        this.store.transact((draft) => {
          const current = draft.sessions[sessionId]
          if (current) current.at = Date.now()
        }).catch((error) => this.logger.warn(`preset-editor: 更新会话 ${sessionId} 使用时间失败：${error?.message ?? error}`))
      }
      // Explicit `follow` is a standing instruction: it keeps resolving the
      // workspace/global chain after restart instead of being pinned.
      return { ...resolved, assignment: cloneJson(existing) }
    }

    const hasPreferred = Object.prototype.hasOwnProperty.call(options, 'preferredPresetId')
    let resolved = this.resolve(sessionId, workspaceId)
    let usedPreferred = false
    if (hasPreferred && existing === undefined) {
      const preferredId = options.preferredPresetId
      if (preferredId === null) {
        resolved = { preset: null, source: 'none', requestedSession: null, fallback: undefined }
        usedPreferred = true
      } else {
        const preset = this.store.getState().presets.find((item) => item.id === preferredId)
        if (isUsable(preset)) {
          resolved = {
            preset: cloneJson(preset),
            source: 'session',
            requestedSession: preferredId,
            fallback: undefined,
          }
          usedPreferred = true
        }
      }
    }
    const preset = resolved.preset
    let assignment
    if (resolved.source === 'none') {
      assignment = {
        presetId: null,
        mode: 'none',
        origin: usedPreferred ? (options.preferredOrigin ?? 'parent') : 'no-preset',
        at: Date.now(),
      }
    } else {
      assignment = {
        presetId: preset.id,
        mode: 'manual',
        origin: usedPreferred ? (options.preferredOrigin ?? 'parent') : resolved.source,
        at: Date.now(),
      }
    }
    if (existing?.mode === 'follow') assignment.origin = 'follow'
    try {
      await this.store.transact((draft) => {
        draft.sessions[sessionId] = assignment
      })
    } catch (error) {
      this.logger.warn(`preset-editor: 固定会话 ${sessionId} 的预设失败：${error?.message ?? error}`)
    }
    return { ...resolved, assignment }
  }

  /** Mark a Session as recently used without changing its selection. */
  touchSession(sessionId) {
    const state = this.store.getState()
    const assignment = state.sessions[sessionId]
    if (!assignment || assignment.at > Date.now() - 60_000) return
    this.store.transact((draft) => {
      const current = draft.sessions[sessionId]
      if (current) current.at = Date.now()
    }).catch(() => {})
  }
}