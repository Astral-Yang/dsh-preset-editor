/**
 * Per-Agent application of the selected preset.
 *
 * Two independent DSH public mechanisms are used, never a prompt-only
 * imitation:
 *   1. `agent.ctx.tools.guard(...)` is a monotonic execution gate. It runs for
 *      every call in the Agent scope (including nested PTC calls) and denies a
 *      disallowed tool before its body.
 *   2. `agent.ctx.tools.restrict(...)` narrows the model-visible schema set so
 *      the model does not see tools the preset excludes. Restriction is
 *      best-effort visibility; the guard remains authoritative when a tool is
 *      registered only in the Agent's own scope or the restriction call cannot
 *      name a stale tool.
 *
 * Persona text is one agent-scoped `system-prompt` section at order 1, after
 * the deployment persona prefix (0) and before first-party tool guidance. It
 * is registered with `interpolate: false`, so user text containing `{{...}}` is
 * literal and cannot break prompt assembly.
 *
 * @module dsh-preset-editor/runtime
 */

import { messageOf } from './util.js'
import { RUN_CODE_NAME, toolNamesForAgent, workspaceIndex } from './catalog.js'

/** Prompt section name owned by this plugin. */
export const PERSONA_SECTION = 'preset-editor:persona'

/** Prompt section order; deployment persona prefix is 0. */
export const PERSONA_ORDER = 1

/** Bound one denial reason. */
function denialReason(preset, toolName) {
  const name = preset?.name || preset?.id || 'preset'
  return `预设「${name}」不允许调用工具「${toolName}」`
}

/** Build the restriction filter for a preset and the Agent's visible names. */
export function restrictionFor(preset, names) {
  if (!preset) return undefined
  const tools = preset.tools ?? { mode: 'all', allow: [], deny: [] }
  const available = new Set(names.filter((name) => name !== RUN_CODE_NAME))
  if (available.size === 0) return undefined
  if (tools.mode === 'allow') {
    const allow = tools.allow.filter((name) => available.has(name))
    if (allow.length === 0) return { deny: [...available] }
    return { allow }
  }
  if (tools.mode === 'deny') {
    const deny = tools.deny.filter((name) => available.has(name))
    if (deny.length === 0) return undefined
    return { deny }
  }
  return undefined
}

/** Whether a preset permits one tool call. */
export function permitsTool(preset, toolName) {
  if (!preset) return true
  if (toolName === RUN_CODE_NAME) return true
  const tools = preset.tools ?? { mode: 'all', allow: [], deny: [] }
  if (tools.mode === 'allow') return tools.allow.includes(toolName)
  if (tools.mode === 'deny') return !tools.deny.includes(toolName)
  return true
}

/** Runtime owner for all live Agent attachments. */
export class PresetRuntime {
  /**
   * @param {object} options - runtime options.
   * @param {object} options.scope - injected Context with agent services.
   * @param {import('./manager.js').PresetManager} options.manager - domain manager.
   * @param {object} options.config - normalized config.
   * @param {{ info: Function, warn: Function, error: Function, debug: Function }} options.logger - logger.
   */
  constructor({ scope, manager, config, logger }) {
    this.scope = scope
    this.manager = manager
    this.config = config
    this.logger = logger
    /** @type {Map<string, object>} */
    this.entries = new Map()
    this.changeTimer = undefined
    this.suppressChanges = 0
    this.disposed = false
    this.cwdCache = new Map()
  }

  /** Attach every Agent that is already live when the plugin (re)loads. */
  async attachExisting() {
    let agents = []
    try {
      const registry = this.scope.get?.('agents')
      agents = typeof registry?.list === 'function' ? registry.list() : []
    } catch (error) {
      this.logger.warn(`preset-editor: 枚举现有 Agent 失败：${messageOf(error)}`)
      return
    }
    for (const agent of agents) {
      try {
        await this.attach(agent, 'startup')
      } catch (error) {
        this.logger.warn(`preset-editor: 附加现有会话 ${agent?.id ?? '?'} 失败：${messageOf(error)}`)
      }
    }
  }

  /** Resolve a Session's workspace without ever blocking Agent creation for long. */
  async workspaceFor(agent) {
    const sessionId = String(agent?.id ?? '')
    const cwd = typeof agent?.session?.header?.cwd === 'string' ? agent.session.header.cwd : ''
    let index
    try {
      index = workspaceIndex(this.scope.get?.('workspaceRegistry'))
    } catch {
      index = { bySession: new Map(), workspaces: [] }
    }
    const known = index.bySession.get(sessionId)
    if (known) return known

    if (!cwd) return null
    const cached = this.cwdCache.get(cwd)
    if (cached && Date.now() - cached.at < 30_000) return cached.id
    try {
      const registry = this.scope.get?.('workspaceRegistry')
      if (typeof registry?.resolveByPath !== 'function') return null
      const workspace = await Promise.race([
        registry.resolveByPath(cwd),
        new Promise((resolve) => setTimeout(() => resolve(undefined), 1500)),
      ])
      const id = workspace === undefined || workspace === null ? null : String(workspace.id)
      this.cwdCache.set(cwd, { id, at: Date.now() })
      return id
    } catch {
      return null
    }
  }

  /** Find the parent Session's effective preset for a subagent. */
  parentPreference(agent, workspaceId) {
    const parentSession = agent?.session?.header?.parentSession
    if (typeof parentSession !== 'string' || parentSession.length === 0) return undefined
    const parentEntry = this.entries.get(parentSession)
    if (parentEntry) return parentEntry.preset?.id ?? null
    try {
      const index = workspaceIndex(this.scope.get?.('workspaceRegistry'))
      const parentWorkspace = index.bySession.get(parentSession) ?? workspaceId ?? null
      const resolved = this.manager.resolve(parentSession, parentWorkspace)
      return resolved.preset?.id ?? null
    } catch {
      return undefined
    }
  }

  /**
   * Attach one live Agent. Safe to call twice; the first entry wins.
   * @param {object} agent - live Agent.
   * @param {string} source - creation source for diagnostics.
   * @returns {Promise<object | undefined>} runtime entry.
   */
  async attach(agent, source = 'unknown') {
    if (this.disposed || !agent || typeof agent.id !== 'string') return undefined
    const existing = this.entries.get(agent.id)
    if (existing) return existing

    const workspaceId = await this.workspaceFor(agent)
    const parentPreference = this.parentPreference(agent, workspaceId)
    let resolved
    try {
      resolved = await this.manager.attachSession(
        agent.id,
        workspaceId,
        parentPreference === undefined ? {} : { preferredPresetId: parentPreference, preferredOrigin: 'parent' },
      )
    } catch (error) {
      this.logger.warn(`preset-editor: 解析会话 ${agent.id} 的预设失败：${messageOf(error)}`)
      resolved = this.manager.resolve(agent.id, workspaceId)
    }

    const entry = {
      agent,
      sessionId: agent.id,
      workspaceId,
      preset: resolved.preset ?? null,
      source: resolved.source,
      fallback: resolved.fallback,
      promptDisposer: undefined,
      guardDisposer: undefined,
      restrictionDisposer: undefined,
      attachedAt: Date.now(),
      attachSource: source,
    }
    this.entries.set(agent.id, entry)

    // Enforcement first: even if visibility restriction fails, the guard denies.
    this.#installGuard(entry)
    this.#installPrompt(entry)
    this.#applyRestriction(entry)
    return entry
  }

  /** Register the monotonic execution gate in the Agent scope. */
  #installGuard(entry) {
    try {
      const tools = entry.agent.ctx.get('tools')
      if (typeof tools?.guard !== 'function') return
      entry.guardDisposer = tools.guard((execution) => {
        const name = execution?.name
        if (typeof name !== 'string' || name === RUN_CODE_NAME) return undefined
        const sessionId = String(execution?.agent?.id ?? entry.sessionId)
        const preset = this.presetForSession(sessionId)
        if (!preset || permitsTool(preset, name)) return undefined
        return denialReason(preset, name)
      })
    } catch (error) {
      this.logger.warn(`preset-editor: 安装工具执行守卫失败（会话 ${entry.sessionId}）：${messageOf(error)}`)
    }
  }

  /** Register the literal persona section in the Agent scope. */
  #installPrompt(entry) {
    try {
      const systemPrompt = entry.agent.ctx.get('systemPrompt')
      if (typeof systemPrompt?.section !== 'function') return
      entry.promptDisposer = systemPrompt.section({
        name: PERSONA_SECTION,
        order: PERSONA_ORDER,
        interpolate: false,
        text: (context) => {
          const sessionId = String(context?.agent?.id ?? entry.sessionId)
          const preset = this.presetForSession(sessionId)
          return preset?.persona?.trim() ? preset.persona.trim() : ''
        },
      })
    } catch (error) {
      this.logger.warn(`preset-editor: 安装人格提示词失败（会话 ${entry.sessionId}）：${messageOf(error)}`)
    }
  }

  /** Recompute and install the visibility restriction. */
  #applyRestriction(entry) {
    this.suppressChanges += 1
    try {
      try {
        entry.restrictionDisposer?.()
      } catch {
        // The previous agent may already be disposed.
      }
      entry.restrictionDisposer = undefined
      if (!entry.preset) return
      let names
      try {
        names = [...toolNamesForAgent(this.scope, entry.agent)]
      } catch {
        names = []
      }
      const filter = restrictionFor(entry.preset, names)
      if (!filter) return
      try {
        const tools = entry.agent.ctx.get('tools')
        if (typeof tools?.restrict === 'function') {
          entry.restrictionDisposer = tools.restrict(filter)
        }
      } catch (error) {
        // Visibility is best-effort. The monotonic guard above still denies the
        // call; log loudly because the model may still see the tool schema.
        this.logger.warn(`preset-editor: 应用工具可见性限制失败（会话 ${entry.sessionId}）：${messageOf(error)}`)
      }
    } finally {
      this.suppressChanges -= 1
    }
  }

  /** Resolve a preset for a Session, including a defensive on-demand fallback. */
  presetForSession(sessionId) {
    const entry = this.entries.get(String(sessionId))
    if (entry) return entry.preset
    try {
      const index = workspaceIndex(this.scope.get?.('workspaceRegistry'))
      return this.manager.resolve(String(sessionId), index.bySession.get(String(sessionId)) ?? null).preset
    } catch {
      return null
    }
  }

  /**
   * Re-resolve one Session after a management write.
   * @param {string} sessionId - target Session.
   */
  refreshSession(sessionId) {
    const entry = this.entries.get(String(sessionId))
    if (!entry) return
    const resolved = this.manager.resolve(entry.sessionId, entry.workspaceId)
    entry.preset = resolved.preset
    entry.source = resolved.source
    entry.fallback = resolved.fallback
    this.#applyRestriction(entry)
  }

  /** Re-resolve every live Session. */
  refreshAll() {
    for (const entry of [...this.entries.values()]) {
      try {
        this.refreshSession(entry.sessionId)
      } catch (error) {
        this.logger.warn(`preset-editor: 刷新会话 ${entry.sessionId} 失败：${messageOf(error)}`)
      }
    }
  }

  /** Schedule one debounced refresh after a tool-registration change. */
  scheduleRefresh() {
    if (this.disposed) return
    if (this.suppressChanges > 0) return
    if (this.changeTimer !== undefined) clearTimeout(this.changeTimer)
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined
      if (this.disposed) return
      this.refreshAll()
    }, this.config.refreshDebounceMs)
    if (typeof this.changeTimer?.unref === 'function') this.changeTimer.unref()
  }

  /** Detach one disposed Agent. */
  detach(agent) {
    const sessionId = String(agent?.id ?? '')
    const entry = this.entries.get(sessionId)
    if (!entry) return
    for (const key of ['guardDisposer', 'promptDisposer', 'restrictionDisposer']) {
      try {
        entry[key]?.()
      } catch {
        // Agent disposal owns the final unwind.
      }
    }
    this.entries.delete(sessionId)
  }

  /** Remove every registration this plugin installed on live Agents. */
  dispose() {
    this.disposed = true
    if (this.changeTimer !== undefined) clearTimeout(this.changeTimer)
    this.changeTimer = undefined
    for (const sessionId of [...this.entries.keys()]) {
      this.detach({ id: sessionId })
    }
    this.entries.clear()
  }

  /** Snapshot for diagnostics. */
  inspect() {
    return [...this.entries.values()].map((entry) => ({
      sessionId: entry.sessionId,
      workspaceId: entry.workspaceId,
      presetId: entry.preset?.id ?? null,
      source: entry.source,
      fallback: entry.fallback ?? null,
      attachedAt: entry.attachedAt,
      attachSource: entry.attachSource,
    }))
  }
}