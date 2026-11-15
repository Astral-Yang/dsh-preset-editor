/**
 * Tool, Agent-preset, workspace, and Session discovery for the management UI.
 *
 * Tool definitions in this DSH release carry no owner metadata, so source
 * classification is deliberately conservative:
 *   - `mcp__<server>__<tool>` is exact MCP naming;
 *   - a curated built-in list is best-effort for shipped tools;
 *   - everything else is reported as `plugin` (plugin or unknown).
 * The list is availability provenance, not an authorization decision.
 *
 * @module dsh-preset-editor/catalog
 */

import { messageOf, nowIso } from './util.js'

/** Shipped DSH tool names known to this plugin release. */
export const BUILTIN_TOOL_NAMES = new Set([
  'apply_patch', 'ask_user_question', 'bash', 'bash_persistent', 'cordis_inspect_list',
  'cordis_inspect_query', 'create_goal', 'edit', 'exit_plan_mode', 'get_goal', 'glob',
  'grep', 'interrupt_agent', 'job_kill', 'job_list', 'job_output', 'list_agents',
  'list_subagent_models', 'load_workspace_dependencies', 'present', 'pwsh', 'pwsh_persistent',
  'ralph', 'read', 'read_image', 'schedule_create', 'schedule_edit', 'schedule_list',
  'schedule_view', 'send_message', 'session_event_read', 'session_event_search',
  'session_event_trace', 'session_search', 'session_trace', 'skill', 'str_replace_editor',
  'subagent', 'subagent_fork', 'terminal_close', 'terminal_list', 'terminal_open',
  'terminal_read', 'terminal_send', 'terminal_signal', 'todo_write', 'update_goal',
  'web_fetch', 'web_search', 'workflow', 'working_directory', 'write',
])

/** Reserved PTC transport name. */
export const RUN_CODE_NAME = 'run_code'

/** Classify one tool name. */
export function classifyTool(name) {
  if (typeof name !== 'string') return { origin: 'unknown', label: '未知' }
  if (name.startsWith('mcp__')) {
    const rest = name.slice(5)
    const split = rest.indexOf('__')
    const server = split > 0 ? rest.slice(0, split) : ''
    return {
      origin: 'mcp',
      server: server || undefined,
      label: server ? `MCP · ${server}` : 'MCP',
    }
  }
  if (name === RUN_CODE_NAME) return { origin: 'transport', label: 'PTC 传输' }
  if (BUILTIN_TOOL_NAMES.has(name)) return { origin: 'builtin', label: 'DSH 内置' }
  return { origin: 'plugin', label: '插件 / 未知' }
}

/** Detach a tool description for the wire. */
function describeTool(name, definition, availableIn) {
  const classification = classifyTool(name)
  const description = typeof definition?.description === 'string' ? definition.description : ''
  return {
    name,
    origin: classification.origin,
    originLabel: classification.label,
    server: classification.server ?? null,
    description: description.length > 400 ? `${description.slice(0, 400)}…` : description,
    availableIn: [...availableIn].sort(),
  }
}

/**
 * Name set visible to one live Agent (restricted view included). This is the
 * exact scope key used by the tool registry: the Agent object itself.
 */
export function toolNamesForAgent(ctx, agent) {
  try {
    return new Set(ctx.tools.definitions(agent).map((tool) => tool.name).filter((name) => name !== RUN_CODE_NAME))
  } catch {
    return new Set()
  }
}

/** Read every tool visible in one scope key. */
function definitionsIn(ctx, scope) {
  try {
    return ctx.tools.definitions(scope)
  } catch {
    return []
  }
}

/**
 * Build the tool catalog across the global layer and every declared Agent
 * preset. Agent-preset scopes are leased and released immediately.
 */
export async function buildToolCatalog(ctx, scope, logger) {
  const tools = new Map()
  const activePresets = []
  const add = (definition, source) => {
    const name = definition?.name
    if (typeof name !== 'string' || name.length === 0 || name === RUN_CODE_NAME) return
    const current = tools.get(name)
    if (current) {
      current.availableIn.add(source)
      if (!current.definition.description && definition.description) current.definition = definition
    } else {
      tools.set(name, { definition, availableIn: new Set([source]) })
    }
  }

  for (const definition of definitionsIn(ctx, undefined)) add(definition, 'global')

  const presets = scope.get?.('agentPresets')
  if (presets && typeof presets.list === 'function' && typeof presets.acquireScope === 'function') {
    try {
      const roster = await presets.list()
      for (const preset of roster) activePresets.push({ id: preset.id, name: preset.name ?? preset.id, description: preset.description ?? '', failed: Boolean(preset.broken) })
      for (const preset of roster) {
        let lease
        try {
          lease = await presets.acquireScope(preset.id)
          for (const definition of definitionsIn(ctx, lease.key)) add(definition, `agent-preset:${preset.id}`)
        } catch (error) {
          logger?.warn(`preset-manager: 读取 Agent 预设 ${preset.id} 的工具失败：${messageOf(error)}`)
        } finally {
          try {
            await lease?.[Symbol.asyncDispose]?.()
          } catch {
            // A failed release must not hide the catalog.
          }
        }
      }
    } catch (error) {
      logger?.warn(`preset-manager: 枚举 Agent 预设失败：${messageOf(error)}`)
    }
  }

  return {
    tools: [...tools.entries()]
      .map(([name, value]) => describeTool(name, value.definition, value.availableIn))
      .sort((left, right) => left.name.localeCompare(right.name)),
    agentPresets: activePresets,
  }
}

/** Map every live or accounted Session to its workspace. */
export function workspaceIndex(workspaceRegistry) {
  const bySession = new Map()
  const workspaces = []
  try {
    const list = typeof workspaceRegistry?.list === 'function' ? workspaceRegistry.list() : []
    for (const workspace of list) {
      workspaces.push({ id: String(workspace.id), title: workspace.title, path: workspace.path })
      for (const sessionId of workspace.sessionIds ?? []) bySession.set(String(sessionId), String(workspace.id))
    }
  } catch {
    // A missing registry means no workspace scope.
  }
  return { bySession, workspaces }
}

/** Read a Session title without failing the catalog. */
function titleOf(scope, session) {
  try {
    const title = scope.get?.('sessionTitle')?.get?.(session)?.title
    return typeof title === 'string' ? title : ''
  } catch {
    return ''
  }
}

/**
 * Build the session roster: live sessions from the Session store plus cold
 * sessions that still have a persisted assignment.
 */
export function buildSessionCatalog(ctx, scope, manager, { limit = 200 } = {}) {
  const { bySession, workspaces } = workspaceIndex(scope.get?.('workspaceRegistry'))
  const rows = []
  const seen = new Set()
  const live = []
  try {
    const sessions = scope.get?.('sessions')
    const list = typeof sessions?.list === 'function' ? sessions.list() : []
    for (const session of list) {
      const id = String(session.header?.id ?? session.id ?? '')
      if (!id) continue
      seen.add(id)
      live.push({
        id,
        title: titleOf(scope, session),
        cwd: typeof session.header?.cwd === 'string' ? session.header.cwd : '',
        workspaceId: bySession.get(id) ?? null,
        live: true,
        createdAt: Number.isFinite(session.header?.createdAt) ? session.header.createdAt : 0,
      })
    }
  } catch {
    // Live session enumeration is optional.
  }
  live.sort((left, right) => right.createdAt - left.createdAt)
  for (const row of live.slice(0, limit)) {
    const assignment = manager.store.getState().sessions[row.id]
    const resolved = manager.resolve(row.id, row.workspaceId)
    rows.push({
      ...row,
      assignment: assignment === undefined ? null : assignment,
      effectivePresetId: resolved.preset?.id ?? null,
      source: resolved.source,
      fallback: resolved.fallback ?? null,
    })
  }

  const assignments = manager.store.getState().sessions
  const cold = Object.entries(assignments)
    .filter(([sessionId]) => !seen.has(sessionId))
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, Math.max(0, limit - rows.length))
  for (const [sessionId, assignment] of cold) {
    const workspaceId = bySession.get(sessionId) ?? null
    const resolved = manager.resolve(sessionId, workspaceId)
    rows.push({
      id: sessionId,
      title: '',
      cwd: '',
      workspaceId,
      live: false,
      createdAt: 0,
      assignment,
      effectivePresetId: resolved.preset?.id ?? null,
      source: resolved.source,
      fallback: resolved.fallback ?? null,
    })
  }
  return { sessions: rows, workspaces }
}

/**
 * Build one Session's effective view for the header pill and write responses.
 * @param {object} ctx - Host context.
 * @param {object} scope - injected services context.
 * @param {import('./manager.js').PresetManager} manager - domain manager.
 * @param {string} sessionId - target Session id.
 */
export function buildSessionInfo(ctx, scope, manager, sessionId) {
  const { bySession, workspaces } = workspaceIndex(scope.get?.('workspaceRegistry'))
  const workspaceId = bySession.get(sessionId) ?? null
  const resolved = manager.resolve(sessionId, workspaceId)
  const assignment = manager.store.getState().sessions[sessionId] ?? null
  let live = false
  let title = ''
  let cwd = ''
  try {
    const session = scope.get?.('sessions')?.get?.(sessionId)
    if (session) {
      live = true
      title = titleOf(scope, session)
      cwd = typeof session.header?.cwd === 'string' ? session.header.cwd : ''
    }
  } catch {
    // Absent live Session: still report the persisted assignment.
  }
  return {
    sessionId,
    workspaceId,
    workspace: workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    live,
    title,
    cwd,
    assignment,
    effective: resolved.preset === null ? null : {
      id: resolved.preset.id,
      name: resolved.preset.name,
      description: resolved.preset.description,
      enabled: resolved.preset.enabled,
    },
    source: resolved.source,
    fallback: resolved.fallback ?? null,
    at: nowIso(),
  }
}