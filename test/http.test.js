import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PresetStore } from '../lib/store.js'
import { PresetManager } from '../lib/manager.js'
import { installHttpRoutes, ROUTES } from '../lib/http.js'

const LIMITS = { maxPresets: 5, maxPersonaChars: 1000, maxSessionAssignments: 20 }
const logger = { info() {}, warn() {}, error() {}, debug() {} }

async function setup({ diagnostics = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dspm-http-'))
  const store = new PresetStore({ file: join(dir, 'state.json'), limits: LIMITS, logger })
  store.loadSync()
  const manager = new PresetManager({ store, limits: LIMITS, logger })
  const runtime = { inspect: () => [{ sessionId: 's1', presetId: 'diana' }], refreshAll() {}, refreshSession() {}, logger }
  const routes = []
  const scope = {
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return async () => {}
        },
      },
    },
    get(name) {
      if (name === 'tools') return { definitions: () => [] }
      return undefined
    },
    inject() {},
  }
  const dispose = installHttpRoutes(scope, {
    manager,
    runtime,
    config: { diagnostics, refreshDebounceMs: 250, maxPresets: 5, maxPersonaChars: 1000 },
    logger,
  })
  async function call(method, path, { body, write = false } = {}) {
    const routePath = path.split('?')[0]
    const route = routes.find((item) => item.path === routePath && item.methods.includes(method))
    assert.ok(route, `missing route ${method} ${path}`)
    const request = new Request('http://localhost' + path, {
      method,
      headers: body === undefined ? {} : {
        'content-type': 'application/json',
        ...(write ? { 'x-dsh-preset-action': '1' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const response = await route.fetch(request)
    return { status: response.status, body: await response.json() }
  }
  async function teardown() {
    await dispose()
    await rm(dir, { recursive: true, force: true })
  }
  return { manager, routes, call, teardown }
}

test('state route returns a complete empty snapshot', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const result = await ctx.call('GET', ROUTES.state + '?catalog=1')
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.presets, [])
  assert.deepEqual(result.body.catalog.tools, [])
  assert.equal(result.body.generation, 0)
})

test('write routes require the same-origin action header', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const denied = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: 'A' } },
    write: false,
  })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.code, 'CSRF')

  const created = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: 'A', persona: 'hello', tools: { mode: 'all' } } },
    write: true,
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.preset.id, 'a')
})

test('state exposes preset usage and scope rows', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const created = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: 'Diana', tools: { mode: 'allow', allow: ['read'] } } },
    write: true,
  })
  const id = created.body.preset.id
  await ctx.call('PUT', ROUTES.defaultPreset, { body: { presetId: id }, write: true })
  const state = await ctx.call('GET', ROUTES.state)
  assert.equal(state.body.defaultPresetId, id)
  assert.equal(state.body.presets[0].usage.default, true)
  assert.equal(state.body.presets[0].usage.total, 1)
})

test('invalid bodies and unknown ids map to structured errors', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const invalid = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: '' } },
    write: true,
  })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.code, 'INVALID_PRESET')

  const missing = await ctx.call('PUT', ROUTES.presets, {
    body: { id: 'missing', preset: { name: 'X' } },
    write: true,
  })
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'PRESET_NOT_FOUND')
})

test('stale generation returns 409', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const created = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: 'A' } },
    write: true,
  })
  const stale = await ctx.call('PUT', ROUTES.presets, {
    body: { id: created.body.preset.id, preset: { name: 'A2' }, generation: 0 },
    write: true,
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'STALE')
})

test('diagnostics probe route is disabled by default', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const result = await ctx.call('POST', ROUTES.probe, {
    body: { sessionId: 's1' },
    write: true,
  })
  assert.equal(result.status, 403)
  assert.equal(result.body.code, 'DIAGNOSTICS_DISABLED')
})

test('session information is available for cold assignments', async (t) => {
  const ctx = await setup()
  t.after(ctx.teardown)
  const created = await ctx.call('POST', ROUTES.presets, {
    body: { preset: { name: 'Diana' } },
    write: true,
  })
  await ctx.call('PUT', ROUTES.session, {
    body: { sessionId: 's1', mode: 'manual', presetId: created.body.preset.id },
    write: true,
  })
  const info = await ctx.call('GET', ROUTES.session + '?id=s1')
  assert.equal(info.status, 200)
  assert.equal(info.body.effective.id, created.body.preset.id)
  assert.equal(info.body.source, 'session')
  assert.equal(info.body.live, false)
})