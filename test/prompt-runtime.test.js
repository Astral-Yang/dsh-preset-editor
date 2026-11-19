import test from 'node:test'
import assert from 'node:assert/strict'

import { NativeOverlayRuntime, promptFilterFor, permitsPrompt } from '../lib/native-runtime.js'
import { harnessAvailable, loadHarness } from './harness.mjs'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

test('prompt filters normalize absent, disabled and allow/deny modes', () => {
  assert.equal(promptFilterFor(null), null)
  assert.equal(promptFilterFor({ enabled: false, prompts: { mode: 'deny', deny: ['x'] } }), null)
  assert.equal(promptFilterFor({ enabled: true, prompts: { mode: 'all' } }), null)
  assert.deepEqual(promptFilterFor({ enabled: true, prompts: { mode: 'deny', deny: ['x'] } }), { mode: 'deny', deny: ['x'] })
})

test('permitsPrompt keeps protected sections and applies allow/deny', () => {
  assert.equal(permitsPrompt({ mode: 'deny', deny: ['dsh-expression:companion'] }, 'dsh-expression:companion'), false)
  assert.equal(permitsPrompt({ mode: 'deny', deny: ['dsh-expression:companion'] }, 'plugin:keep'), true)
  assert.equal(permitsPrompt({ mode: 'allow', allow: ['plugin:keep'] }, 'plugin:other'), false)
  assert.equal(permitsPrompt({ mode: 'allow', allow: [] }, 'harness:identity'), true)
  assert.equal(permitsPrompt({ mode: 'allow', allow: [] }, 'deployment:persona-prefix'), true)
})

test('runtime removes a listener-added prompt section for one Agent only', { skip: harnessAvailable ? false : 'the installed DSH packages are not available; set DSH_PACKAGES' }, async (t) => {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.SystemPrompt, {})
  root.systemPrompt.section({ name: 'plugin:keep', order: 100, text: 'KEEP SECTION' })
  const stopMeme = root.on('system-prompt/assemble', async (assembly, _context, next) => {
    const result = await next()
    result.sections.push({ name: 'dsh-expression:companion', text: '斗图规则' })
    return result
  })

  const agentA = { id: 'a' }
  const agentB = { id: 'b' }
  const scopeA = H.createScope(root, agentA)
  const scopeB = H.createScope(root, agentB)
  agentA.ctx = scopeA.ctx
  agentB.ctx = scopeB.ctx
  const ids = new WeakMap([[scopeA.ctx, 'standard'], [scopeB.ctx, 'other']])
  const native = {
    overlay(id) {
      if (id !== 'standard') return null
      return {
        enabled: true,
        tools: { mode: 'all', allow: [], deny: [] },
        prompts: { mode: 'deny', allow: [], deny: ['dsh-expression:companion'] },
      }
    },
  }
  const scope = {
    get(name) {
      if (name === 'agentPresets') return { composedPreset(ctx) { return ids.get(ctx) } }
      return root.get(name)
    },
    on(...args) { return root.on(...args) },
  }
  const runtime = new NativeOverlayRuntime({ scope, native, config: { refreshDebounceMs: 5 }, logger })
  t.after(async () => {
    runtime.dispose()
    stopMeme()
    await scopeA.dispose()
    await scopeB.dispose()
    await root.fiber.dispose().catch(() => {})
  })
  await runtime.attach(agentA)
  await runtime.attach(agentB)

  const promptA = await root.systemPrompt.assemble({ scope: agentA, agent: agentA })
  const promptB = await root.systemPrompt.assemble({ scope: agentB, agent: agentB })
  assert.deepEqual(promptA.sections.map((section) => section.name), ['harness:identity', 'deployment:persona-prefix', 'plugin:keep', 'deployment:persona-suffix'])
  assert.ok(promptB.sections.some((section) => section.name === 'dsh-expression:companion'))
  assert.ok(promptB.sections.some((section) => section.name === 'plugin:keep'))
})

test('runtime leaves prompt sections untouched when the overlay has no prompt filter', { skip: harnessAvailable ? false : 'the installed DSH packages are not available; set DSH_PACKAGES' }, async (t) => {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.SystemPrompt, {})
  root.systemPrompt.section({ name: 'plugin:keep', order: 100, text: 'KEEP SECTION' })
  const agent = { id: 'a' }
  const scopeA = H.createScope(root, agent)
  agent.ctx = scopeA.ctx
  const native = { overlay() { return { enabled: true, tools: { mode: 'all', allow: [], deny: [] } } } }
  const scope = {
    get(name) {
      if (name === 'agentPresets') return { composedPreset() { return 'standard' } }
      return root.get(name)
    },
    on(...args) { return root.on(...args) },
  }
  const runtime = new NativeOverlayRuntime({ scope, native, config: { refreshDebounceMs: 5 }, logger })
  t.after(async () => {
    runtime.dispose()
    await scopeA.dispose()
    await root.fiber.dispose().catch(() => {})
  })
  await runtime.attach(agent)
  const assembly = await root.systemPrompt.assemble({ scope: agent, agent })
  assert.ok(assembly.sections.some((section) => section.name === 'plugin:keep'))
})
