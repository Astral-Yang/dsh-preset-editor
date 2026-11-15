/**
 * Authenticated management API.
 *
 * Every route is registered through `ctx.connection.fetch`, the DSH shared
 * `/api` channel. The transport applies browser authentication, the Host/Origin
 * fence, and owner-Peer admission before a handler runs. Writes additionally
 * require the same-origin `x-dsh-preset-action: 1` header, which a cross-origin
 * page cannot send without a preflight this route never answers.
 *
 * All paths are fixed; identifiers travel in the body or query, so route
 * registration never depends on user data.
 *
 * @module dsh-preset-editor/http
 */

import { buildSessionCatalog, buildSessionInfo, buildToolCatalog, workspaceIndex } from './catalog.js'
import { runProbe } from './probe.js'
import { PresetError } from './store.js'
import { cloneJson, messageOf } from './util.js'

/** Exact route paths. */
export const ROUTES = Object.freeze({
  state: '/api/preset-editor/state',
  presets: '/api/preset-editor/presets',
  duplicate: '/api/preset-editor/duplicate',
  defaultPreset: '/api/preset-editor/default',
  workspace: '/api/preset-editor/workspace',
  session: '/api/preset-editor/session',
  probe: '/api/preset-editor/probe',
  health: '/api/preset-editor/health',
})

/** Maximum accepted JSON body. */
const MAX_BODY_BYTES = 1024 * 1024

/** JSON response with no-store and no-sniff. */
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Read and bound a JSON object body. */
export async function readJson(request) {
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new PresetError('BODY_TOO_LARGE', '请求体过大', 413)
  }
  let parsed
  try {
    parsed = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    throw new PresetError('INVALID_JSON', '请求体不是合法 JSON', 400)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PresetError('INVALID_JSON', '请求体必须是 JSON 对象', 400)
  }
  return parsed
}

/** Reject a write without the same-origin action fence. */
export function assertWrite(request) {
  if (request.headers.get('x-dsh-preset-action') !== '1') {
    throw new PresetError('CSRF', '缺少管理操作请求头', 403)
  }
  const type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new PresetError('CONTENT_TYPE', '管理写操作必须使用 application/json', 415)
  }
}

/** Executed result body for one route. */
export async function respond(handler) {
  try {
    return json(await handler())
  } catch (error) {
    if (error instanceof PresetError) {
      return json({ ok: false, code: error.code, error: error.message, details: error.details ?? null }, error.status)
    }
    return json({ ok: false, code: 'INTERNAL', error: messageOf(error) }, 500)
  }
}

/** Read a string field, allowing null explicitly. */
function nullableString(value, field, max = 200) {
  if (value === null) return null
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new PresetError('INVALID_INPUT', `${field} 必须是非空字符串或 null`, 400)
  }
  return value
}

/** Read one generation hint. */
function generationOf(body) {
  if (body.generation === undefined || body.generation === null) return undefined
  if (!Number.isSafeInteger(body.generation) || body.generation < 0) {
    throw new PresetError('INVALID_INPUT', 'generation 必须是非负整数', 400)
  }
  return body.generation
}

/** Build the full management state payload. */
async function statePayload(scope, manager, runtime, config, catalogWanted) {
  const state = manager.store.snapshot()
  const { workspaces } = workspaceIndex(scope.get?.('workspaceRegistry'))
  const presets = manager.list().map((preset) => ({
    ...preset,
    usage: manager.usage(preset.id),
  }))
  const assigned = state.workspaces
  const workspaceRows = workspaces.map((workspace) => {
    const presetId = assigned[workspace.id] ?? null
    const resolved = manager.resolve('', workspace.id)
    return {
      ...workspace,
      presetId,
      effectivePresetId: resolved.preset?.id ?? null,
    }
  })
  const sessionRows = buildSessionCatalog(null, scope, manager)
  const payload = {
    ok: true,
    version: 1,
    generation: state.generation,
    presets,
    defaultPresetId: state.defaultPresetId,
    workspaces: workspaceRows,
    sessions: sessionRows.sessions,
    runtime: runtime.inspect(),
    warnings: manager.store.warnings,
    config: {
      diagnostics: config.diagnostics,
      refreshDebounceMs: config.refreshDebounceMs,
      maxPresets: config.maxPresets,
      maxPersonaChars: config.maxPersonaChars,
    },
  }
  if (catalogWanted) {
    payload.catalog = await buildToolCatalog(scope, scope, runtime.logger)
  }
  return payload
}

/**
 * Register the plugin's routes.
 * @param {object} scope - injected Host context carrying `connection`.
 * @param {object} options - runtime, manager, config, logger.
 * @returns {() => Promise<void>} disposer for every route.
 */
export function installHttpRoutes(scope, { manager, runtime, config, logger }) {
  const connection = scope.connection
  if (typeof connection?.fetch?.register !== 'function') return () => Promise.resolve()
  const disposers = []

  const register = (path, methods, fetch) => {
    disposers.push(connection.fetch.register({
      path,
      methods,
      requestBody: 'buffered',
      fetch,
    }))
  }

  register(ROUTES.state, ['GET'], (request) => respond(async () => {
    const url = new URL(request.url)
    const catalog = url.searchParams.get('catalog') === '1'
    return statePayload(scope, manager, runtime, config, catalog)
  }))

  register(ROUTES.health, ['GET'], () => respond(async () => ({
    ok: true,
    version: 1,
    generation: manager.store.generation,
    runtime: runtime.inspect(),
    warnings: manager.store.warnings,
  })))

  register(ROUTES.presets, ['POST', 'PUT', 'DELETE'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    if (request.method === 'POST') {
      const result = await manager.create(body.preset ?? body, generationOf(body))
      runtime.refreshAll()
      return result
    }
    const id = nullableString(body.id, 'id', 128)
    if (!id) throw new PresetError('INVALID_INPUT', '缺少预设 id', 400)
    if (request.method === 'PUT') {
      const result = await manager.update(id, body.preset ?? body, generationOf(body))
      runtime.refreshAll()
      return result
    }
    const result = await manager.remove(id, {
      force: body.force === true,
      reassignTo: body.reassignTo === undefined ? undefined : body.reassignTo,
    }, generationOf(body))
    runtime.refreshAll()
    return result
  }))

  register(ROUTES.duplicate, ['POST'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    const id = nullableString(body.id, 'id', 128)
    if (!id) throw new PresetError('INVALID_INPUT', '缺少预设 id', 400)
    const result = await manager.duplicate(id, generationOf(body))
    runtime.refreshAll()
    return result
  }))

  register(ROUTES.defaultPreset, ['PUT'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    const presetId = body.presetId === undefined || body.presetId === null ? null : nullableString(body.presetId, 'presetId', 128)
    const generation = await manager.setDefault(presetId, generationOf(body))
    runtime.refreshAll()
    return { ok: true, generation }
  }))

  register(ROUTES.workspace, ['PUT'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    const workspaceId = nullableString(body.workspaceId, 'workspaceId', 200)
    const presetId = body.presetId === undefined || body.presetId === null ? null : nullableString(body.presetId, 'presetId', 128)
    const generation = await manager.setWorkspace(workspaceId, presetId, generationOf(body))
    runtime.refreshAll()
    return { ok: true, generation }
  }))

  register(ROUTES.session, ['GET', 'PUT', 'DELETE'], (request) => respond(async () => {
    const url = new URL(request.url)
    const queryId = url.searchParams.get('id') ?? ''
    if (request.method === 'GET') {
      if (!queryId) throw new PresetError('INVALID_INPUT', '缺少会话 id', 400)
      return buildSessionInfo(scope, scope, manager, queryId)
    }
    assertWrite(request)
    const body = await readJson(request)
    const sessionId = nullableString(body.sessionId, 'sessionId', 200)
    if (!sessionId) throw new PresetError('INVALID_INPUT', '缺少会话 id', 400)
    if (request.method === 'PUT') {
      const mode = body.mode === 'manual' || body.mode === 'follow' || body.mode === 'none' ? body.mode : null
      if (!mode) throw new PresetError('INVALID_INPUT', 'mode 必须是 manual / follow / none', 400)
      const presetId = mode === 'manual' ? nullableString(body.presetId, 'presetId', 128) : null
      const result = await manager.setSession(sessionId, { mode, presetId }, generationOf(body))
      runtime.refreshSession(sessionId)
      return { ok: true, ...result }
    }
    const generation = await manager.clearSession(sessionId, generationOf(body))
    runtime.refreshSession(sessionId)
    return { ok: true, generation }
  }))

  register(ROUTES.probe, ['POST'], (request) => respond(async () => {
    assertWrite(request)
    if (!config.diagnostics) throw new PresetError('DIAGNOSTICS_DISABLED', '诊断接口未启用', 403)
    const body = await readJson(request)
    const sessionId = nullableString(body.sessionId, 'sessionId', 200)
    let agent
    try {
      agent = scope.get?.('agents')?.get?.(sessionId)
    } catch {
      agent = undefined
    }
    if (!agent) throw new PresetError('SESSION_NOT_LIVE', '会话当前没有活动 Agent', 409)
    const result = await runProbe(scope, agent)
    return { ok: true, sessionId, probe: result }
  }))

  logger.debug?.(`preset-editor: 已注册 ${disposers.length} 条管理路由`)
  return async () => {
    for (const dispose of disposers) {
      try {
        await dispose()
      } catch (error) {
        logger.warn(`preset-editor: 移除管理路由失败：${messageOf(error)}`)
      }
    }
  }
}

/** Detach a state payload for tests. */
export function cloneStatePayload(payload) {
  return cloneJson(payload)
}