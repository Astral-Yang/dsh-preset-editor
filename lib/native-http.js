/**
 * Authenticated management API for native Agent presets and their overlays.
 * @module dsh-preset-editor/native-http
 */

import { buildToolCatalog } from './catalog.js'
import { assertWrite, json, readJson, respond } from './http.js'
import { PresetError } from './store.js'
import { messageOf } from './util.js'

export const NATIVE_ROUTES = Object.freeze({
  native: '/api/preset-manager/native',
  overlay: '/api/preset-manager/native/overlay',
  backups: '/api/preset-manager/native/backups',
  restore: '/api/preset-manager/native/backups/restore',
})

function generationOf(body) {
  if (body.generation === undefined || body.generation === null) return undefined
  if (!Number.isSafeInteger(body.generation) || body.generation < 0) throw new PresetError('INVALID_INPUT', 'generation 必须是非负整数', 400)
  return body.generation
}

function stringOf(value, field, max = 200) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new PresetError('INVALID_INPUT', `${field} 无效`, 400)
  return value
}

/** Register native preset routes. */
export function installNativeRoutes(scope, { native, runtime, config, logger }) {
  const connection = scope.connection
  if (typeof connection?.fetch?.register !== 'function') return () => Promise.resolve()
  const disposers = []

  const register = (path, methods, fetch) => {
    disposers.push(connection.fetch.register({ path, methods, requestBody: 'buffered', fetch }))
  }

  register(NATIVE_ROUTES.native, ['GET', 'POST', 'PUT', 'DELETE'], (request) => respond(async () => {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const payload = await native.list()
      if (url.searchParams.get('catalog') === '1') payload.catalog = await buildToolCatalog(scope, scope, logger)
      payload.backup = {
        enabled: config.backup !== false,
        keep: config.backupKeep,
        recent: (await native.listBackups()).slice(0, config.backupKeep),
      }
      return { ok: true, ...payload, generation: native.store.generation, warnings: native.store.warnings }
    }
    assertWrite(request)
    const body = await readJson(request)
    const id = stringOf(body.id, 'id', 128)
    if (request.method === 'DELETE') {
      const result = await native.reset(id, generationOf(body))
      runtime.refreshAll()
      return { ok: true, ...result }
    }
    const result = await native.save({ ...body, id }, generationOf(body), { createOnly: request.method === 'POST' })
    runtime.refreshAll()
    return { ok: true, ...result }
  }))

  register(NATIVE_ROUTES.backups, ['GET'], () => respond(async () => ({
    ok: true,
    enabled: config.backup !== false,
    keep: config.backupKeep,
    backups: await native.listBackups(),
  })))

  register(NATIVE_ROUTES.restore, ['POST'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    const name = stringOf(body.name, 'name', 256)
    const result = await native.restoreBackup(name)
    runtime.refreshAll()
    return { ok: true, ...result }
  }))

  register(NATIVE_ROUTES.overlay, ['PUT', 'DELETE'], (request) => respond(async () => {
    assertWrite(request)
    const body = await readJson(request)
    const id = stringOf(body.id, 'id', 128)
    if (request.method === 'DELETE') {
      const result = await native.clearOverlay(id, generationOf(body))
      runtime.refreshAll()
      return { ok: true, ...result }
    }
    const result = await native.setOverlay(id, body, generationOf(body))
    runtime.refreshAll()
    return { ok: true, ...result }
  }))

  logger.debug?.(`preset-manager: 已注册 ${disposers.length} 条原生预设路由`)
  return async () => {
    for (const dispose of disposers) {
      try { await dispose() } catch (error) { logger.warn(`preset-manager: 移除原生预设路由失败：${messageOf(error)}`) }
    }
  }
}
