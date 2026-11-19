/**
 * Per-Agent application of a native Agent preset's optional tool and prompt
 * filter overlays.
 *
 * The Agent's native preset composition remains the source of truth for tools
 * and prompt. This runtime adds only the user's additional filters:
 *   - `tools.guard` executes the tool filter at call time;
 *   - `tools.restrict` removes filtered tools from the visible schema;
 *   - the scoped `system-prompt/assemble` waterfall removes filtered prompt
 *     sections from the final assembly.
 *
 * It never registers a persona section: native presets own their persona.
 *
 * @module dsh-preset-editor/native-runtime
 */

import { messageOf } from './util.js'
import { PROTECTED_PROMPT_SECTIONS, RUN_CODE_NAME, toolNamesForAgent } from './catalog.js'
import { permitsTool, restrictionFor } from './runtime.js'

/** Active prompt filter for one overlay, or null when none applies. */
export function promptFilterFor(overlay) {
  if (!overlay || overlay.enabled === false) return null
  const prompts = overlay.prompts
  if (!prompts || prompts.mode === 'all') return null
  return prompts
}

/** Whether one prompt section survives the filter. */
export function permitsPrompt(filter, name) {
  if (!filter || filter.mode === 'all' || typeof name !== 'string' || name.length === 0) return true
  if (PROTECTED_PROMPT_SECTIONS.has(name)) return true
  if (filter.mode === 'allow') return Array.isArray(filter.allow) && filter.allow.includes(name)
  if (filter.mode === 'deny') return !Array.isArray(filter.deny) || !filter.deny.includes(name)
  return true
}

/** Runtime for native preset overlays. */
export class NativeOverlayRuntime {
  constructor({ scope, native, config, logger }) {
    this.scope = scope
    this.native = native
    this.config = config
    this.logger = logger
    this.entries = new Map()
    this.suppressChanges = 0
    this.changeTimer = undefined
    this.promptDisposer = undefined
    this.disposed = false
    this.#installPromptFilter()
  }

  /** Attach every Agent already live when the plugin (re)loads. */
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
        await this.attach(agent)
      } catch (error) {
        this.logger.warn(`preset-editor: 附加现有会话 ${agent?.id ?? '?'} 失败：${messageOf(error)}`)
      }
    }
  }

  /** Resolve the native preset id an Agent currently composes. */
  nativeIdOf(agent) {
    try {
      const presets = this.scope.get?.('agentPresets')
      if (!presets) return undefined
      if (typeof presets.composedPreset === 'function') {
        const id = presets.composedPreset(agent.ctx)
        if (typeof id === 'string' && id.length > 0) return id
      }
      if (typeof presets.presetForSession === 'function') {
        const id = presets.presetForSession(agent.session)
        if (typeof id === 'string' && id.length > 0) return id
      }
    } catch {
      // No native preset composition.
    }
    return undefined
  }

  /** Current overlay for one session, read from the live native state. */
  overlayFor(sessionId, nativeId) {
    if (!nativeId) return null
    try {
      return this.native.overlay(nativeId)
    } catch {
      return null
    }
  }

  /** Attach one live Agent. */
  async attach(agent) {
    if (this.disposed || !agent || typeof agent.id !== 'string') return undefined
    const existing = this.entries.get(agent.id)
    if (existing) return existing
    const nativeId = this.nativeIdOf(agent)
    const entry = {
      agent,
      sessionId: agent.id,
      nativeId,
      guardDisposer: undefined,
      restrictionDisposer: undefined,
      attachedAt: Date.now(),
    }
    this.entries.set(agent.id, entry)
    this.#installGuard(entry)
    this.#applyRestriction(entry)
    return entry
  }

  /** Monotonic execution guard driven by the current overlay. */
  #installGuard(entry) {
    try {
      const tools = entry.agent.ctx.get('tools')
      if (typeof tools?.guard !== 'function') return
      entry.guardDisposer = tools.guard((execution) => {
        const name = execution?.name
        if (typeof name !== 'string' || name === RUN_CODE_NAME) return undefined
        const sessionId = String(execution?.agent?.id ?? entry.sessionId)
        const current = this.entries.get(sessionId)
        const overlay = current ? this.overlayFor(sessionId, current.nativeId) : null
        if (!overlay || overlay.enabled === false) return undefined
        if (permitsTool({ tools: overlay.tools }, name)) return undefined
        const nativeName = current?.nativeId ?? 'native preset'
        return `原生预设「${nativeName}」的工具过滤不允许调用「${name}」`
      })
    } catch (error) {
      this.logger.warn(`preset-editor: 安装工具过滤守卫失败（会话 ${entry.sessionId}）：${messageOf(error)}`)
    }
  }

  /**
   * Remove filtered prompt sections from the final assembly. The listener is
   * registered once at the runtime scope with `prepend: true`: it must run
   * before other `system-prompt/assemble` listeners, then filter after their
   * `next()` returns. A per-Agent listener would run inside those listeners and
   * could miss sections appended by a global listener after its own `next()`.
   */
  #installPromptFilter() {
    try {
      if (typeof this.scope?.on !== 'function') return
      this.promptDisposer = this.scope.on('system-prompt/assemble', async (assembly, context, next) => {
        const result = typeof next === 'function' ? await next() : assembly
        const agent = context?.agent
        if (!agent || typeof agent.id !== 'string') return result
        const entry = this.entries.get(agent.id)
        if (!entry) return result
        const overlay = this.overlayFor(entry.sessionId, entry.nativeId)
        const filter = promptFilterFor(overlay)
        if (!filter || !result || !Array.isArray(result.sections)) return result
        return {
          ...result,
          sections: result.sections.filter((section) => permitsPrompt(filter, section?.name)),
        }
      }, { prepend: true, global: true })
    } catch (error) {
      this.logger.warn(`preset-editor: 安装提示词段过滤失败：${messageOf(error)}`)
    }
  }

  /** Recompute and install the visibility restriction. */
  #applyRestriction(entry) {
    this.suppressChanges += 1
    try {
      try {
        entry.restrictionDisposer?.()
      } catch {}
      entry.restrictionDisposer = undefined
      const overlay = this.overlayFor(entry.sessionId, entry.nativeId)
      if (!overlay || overlay.enabled === false) return
      let names
      try {
        names = [...toolNamesForAgent(this.scope, entry.agent)]
      } catch {
        names = []
      }
      const filter = restrictionFor({ tools: overlay.tools }, names)
      if (!filter) return
      try {
        const tools = entry.agent.ctx.get('tools')
        if (typeof tools?.restrict === 'function') entry.restrictionDisposer = tools.restrict(filter)
      } catch (error) {
        this.logger.warn(`preset-editor: 应用工具过滤可见性失败（会话 ${entry.sessionId}）：${messageOf(error)}`)
      }
    } finally {
      this.suppressChanges -= 1
    }
  }

  /** Re-resolve one session after a native preset switch or overlay edit. */
  refreshSession(sessionId) {
    const entry = this.entries.get(String(sessionId))
    if (!entry) return
    entry.nativeId = this.nativeIdOf(entry.agent)
    this.#applyRestriction(entry)
  }

  /** Re-resolve all live sessions. */
  refreshAll() {
    for (const entry of [...this.entries.values()]) {
      try {
        entry.nativeId = this.nativeIdOf(entry.agent)
        this.#applyRestriction(entry)
      } catch (error) {
        this.logger.warn(`preset-editor: 刷新会话 ${entry.sessionId} 失败：${messageOf(error)}`)
      }
    }
  }

  /** Debounced refresh after tool-registration changes. */
  scheduleRefresh() {
    if (this.disposed || this.suppressChanges > 0) return
    if (this.changeTimer !== undefined) clearTimeout(this.changeTimer)
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined
      if (!this.disposed) this.refreshAll()
    }, this.config.refreshDebounceMs)
    if (typeof this.changeTimer?.unref === 'function') this.changeTimer.unref()
  }

  /** Detach one disposed Agent. */
  detach(agent) {
    const sessionId = String(agent?.id ?? '')
    const entry = this.entries.get(sessionId)
    if (!entry) return
    for (const disposer of [entry.guardDisposer, entry.restrictionDisposer]) {
      try { disposer?.() } catch {}
    }
    this.entries.delete(sessionId)
  }

  dispose() {
    this.disposed = true
    if (this.changeTimer !== undefined) clearTimeout(this.changeTimer)
    this.changeTimer = undefined
    try { this.promptDisposer?.() } catch {}
    this.promptDisposer = undefined
    for (const sessionId of [...this.entries.keys()]) this.detach({ id: sessionId })
    this.entries.clear()
  }

  inspect() {
    return [...this.entries.values()].map((entry) => ({
      sessionId: entry.sessionId,
      nativePresetId: entry.nativeId ?? null,
      overlay: entry.nativeId ? Boolean(this.overlayFor(entry.sessionId, entry.nativeId)) : false,
      promptFilter: Boolean(promptFilterFor(entry.nativeId ? this.overlayFor(entry.sessionId, entry.nativeId) : null)),
      attachedAt: entry.attachedAt,
    }))
  }
}
