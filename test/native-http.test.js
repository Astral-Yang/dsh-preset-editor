import test from 'node:test'
import assert from 'node:assert/strict'

import { installNativeRoutes, NATIVE_ROUTES } from '../lib/native-http.js'

function harness() {
  const routes = []
  const calls = []
  const native = {
    store: { generation: 2, warnings: [] },
    async listBackups() { return [] },
    async restoreBackup(name) { calls.push(['restore', name]); return { restored: name, kind: 'patch', application: 'applied', generation: 4 } },
    async list() { return { presets: [{ id: 'standard', name: 'standard' }], defaultId: 'standard', warnings: [] } },
    async save(input, generation) { calls.push(['save', input, generation]); return { preset: { id: input.id }, application: 'applied', generation: 3 } },
    async reset(id, generation) { calls.push(['reset', id, generation]); return { removed: true, application: 'applied', generation: 3 } },
    async setOverlay(id, input, generation) { calls.push(['setOverlay', id, input, generation]); return { overlay: { tools: { mode: 'deny' } }, generation: 3 } },
    async clearOverlay(id, generation) { calls.push(['clearOverlay', id, generation]); return { generation: 3 } },
  }
  const runtime = { refreshAll() {}, }
  const scope = {
    connection: { fetch: { register(route) { routes.push(route); return async () => {} } } },
    get(name) { if (name === 'tools') return { definitions: () => [] }; return undefined },
  }
  installNativeRoutes(scope, { native, runtime, config: { diagnostics: true, backup: true, backupKeep: 20 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
  async function call(method, path, { body, write = true } = {}) {
    const routePath = path.split('?')[0]
    const route = routes.find((item) => item.path === routePath && item.methods.includes(method))
    assert.ok(route, `missing ${method} ${path}`)
    const request = new Request('http://localhost' + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json', ...(write ? { 'x-dsh-preset-action': '1' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const response = await route.fetch(request)
    return { status: response.status, body: await response.json() }
  }
  return { routes, calls, call }
}

test('native routes combine methods on one path and list state', async () => {
  const h = harness()
  assert.equal(h.routes.length, 4)
  const state = await h.call('GET', NATIVE_ROUTES.native + '?catalog=1', { write: false })
  assert.equal(state.status, 200)
  assert.equal(state.body.presets[0].id, 'standard')
  assert.deepEqual(state.body.catalog.tools, [])
})

test('native write routes require the action header and dispatch by method', async () => {
  const h = harness()
  const denied = await h.call('POST', NATIVE_ROUTES.native, { body: { id: 'x' }, write: false })
  assert.equal(denied.status, 403)
  const created = await h.call('POST', NATIVE_ROUTES.native, { body: { id: 'x', name: 'X', plugins: [] } })
  assert.equal(created.status, 200)
  assert.equal(h.calls[0][0], 'save')
  const reset = await h.call('DELETE', NATIVE_ROUTES.native, { body: { id: 'x', generation: 2 } })
  assert.equal(reset.status, 200)
  assert.equal(h.calls[1][0], 'reset')
})

test('native overlay routes set and clear', async () => {
  const h = harness()
  const set = await h.call('PUT', NATIVE_ROUTES.overlay, { body: { id: 'standard', enabled: true, tools: { mode: 'deny', deny: ['bash'] }, generation: 2 } })
  assert.equal(set.status, 200)
  assert.equal(h.calls[0][0], 'setOverlay')
  const clear = await h.call('DELETE', NATIVE_ROUTES.overlay, { body: { id: 'standard', generation: 3 } })
  assert.equal(clear.status, 200)
  assert.equal(h.calls[1][0], 'clearOverlay')
})

test('native backup restore requires the action header and dispatches', async () => {
  const h = harness()
  const denied = await h.call('POST', NATIVE_ROUTES.restore, { body: { name: 'patch-x.yml' }, write: false })
  assert.equal(denied.status, 403)
  const restored = await h.call('POST', NATIVE_ROUTES.restore, { body: { name: 'patch-x.yml' } })
  assert.equal(restored.status, 200)
  assert.equal(h.calls[0][0], 'restore')
  assert.equal(restored.body.restored, 'patch-x.yml')
})

test('native invalid bodies map to structured errors', async () => {
  const h = harness()
  const missing = await h.call('PUT', NATIVE_ROUTES.native, { body: { id: '', name: 'X', plugins: [] } })
  assert.equal(missing.status, 400)
  assert.equal(missing.body.code, 'INVALID_INPUT')
})
