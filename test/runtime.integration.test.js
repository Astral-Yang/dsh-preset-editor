import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PresetStore } from '../lib/store.js'
import { PresetManager } from '../lib/manager.js'
import { PresetRuntime, PERSONA_ORDER, restrictionFor, permitsTool } from '../lib/runtime.js'
import { registerProbe, PROBE_TOOL } from '../lib/probe.js'
import { harnessAvailable, loadHarness } from './harness.mjs'

const LIMITS = { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 50 }
const logger = { info() {}, warn() {}, error() {}, debug() {} }

const skip = harnessAvailable ? false : 'the installed DSH packages are not available; set DSH_PACKAGES'

async function setup(t) {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.ToolsService)
  await root.plugin(H.SystemPrompt, { personaPrefix: 'DEPLOYMENT PREFIX' })
  await root.plugin({ name: H.nativeExecutor.name, inject: H.nativeExecutor.inject, apply: H.nativeExecutor.apply })
  const dir = await mkdtemp(join(tmpdir(), 'dspm-runtime-'))
  const store = new PresetStore({ file: join(dir, 'state.json'), limits: LIMITS, logger })
  store.loadSync()
  const manager = new PresetManager({ store, limits: LIMITS, logger })
  const registered = [registerProbe(root, root.get('tools'))]
  const presetKey = {}
  const presetScope = H.createScope(root, presetKey)
  const make = (name) => H.defineTool({
    name,
    description: name,
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute() { return `ok:${name}` },
  })
  presetScope.ctx.get('tools').register(make('t1'))
  presetScope.ctx.get('tools').register(make('t2'))

  const agent = { id: 'sess1', session: { header: { id: 'sess1', cwd: '/tmp' } } }
  const agentScope = H.createScope(root, agent, { parent: presetKey })
  agent.ctx = agentScope.ctx
  const runtime = new PresetRuntime({ scope: root, manager, config: { refreshDebounceMs: 5 }, logger })
  await runtime.attach(agent, 'test')

  t.after(async () => {
    runtime.dispose()
    for (const dispose of registered) {
      try { dispose() } catch {}
    }
    try { await presetScope.dispose() } catch {}
    try { await agentScope.dispose() } catch {}
    await root.fiber.dispose().catch(() => {})
    await rm(dir, { recursive: true, force: true })
  })
  return { H, root, store, manager, runtime, agent, make }
}

test('restrictionFor preserves an empty allow list as deny-all', () => {
  assert.deepEqual(restrictionFor({ tools: { mode: 'allow', allow: [] } }, ['a', 'b']), { deny: ['a', 'b'] })
  assert.deepEqual(restrictionFor({ tools: { mode: 'allow', allow: ['a'] } }, ['a', 'b']), { allow: ['a'] })
  assert.deepEqual(restrictionFor({ tools: { mode: 'deny', deny: ['a'] } }, ['a', 'b']), { deny: ['a'] })
  assert.equal(restrictionFor({ tools: { mode: 'deny', deny: [] } }, ['a', 'b']), undefined)
  assert.equal(permitsTool({ tools: { mode: 'allow', allow: ['a'] } }, 'b'), false)
  assert.equal(permitsTool({ tools: { mode: 'deny', deny: ['a'] } }, 'b'), true)
  assert.equal(permitsTool({ tools: { mode: 'allow', allow: [] } }, 'run_code'), true)
})

test('persona, visibility, and execution gating on a real Agent scope', { skip }, async (t) => {
  const { H, root, manager, runtime, agent } = await setup(t)
  const diana = await manager.create({
    name: 'Diana',
    persona: '你是 Diana。{{model}}',
    tools: { mode: 'allow', allow: ['t1', PROBE_TOOL] },
  })
  await manager.setDefault(diana.preset.id)
  await manager.setSession('sess1', { mode: 'manual', presetId: diana.preset.id })
  runtime.refreshSession('sess1')

  const assembly = await root.systemPrompt.assemble({ scope: agent, agent })
  const text = H.renderPrompt(assembly)
  assert.match(text, /DEPLOYMENT PREFIX/)
  assert.match(text, /你是 Diana。\{\{model\}\}/)
  const personaIndex = text.indexOf('你是 Diana')
  assert.ok(personaIndex > text.indexOf('DEPLOYMENT PREFIX'))
  assert.equal(PERSONA_ORDER, 1)

  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name).sort(), [PROBE_TOOL, 't1'].sort())

  const call = (name) => ({ type: 'tool-call', id: `call-${name}`, name, arguments: '{}' })
  async function execute(name) {
    const batch = await root.tools.execute({ calls: [call(name)], signal: new AbortController().signal, agent })
    return batch.results[0].result
  }
  assert.equal((await execute('t1')).isError, false)
  assert.equal((await execute(PROBE_TOOL)).isError, false)
  assert.equal((await execute('t2')).isError, true)
  assert.match((await execute('t2')).content[0].text, /不允许调用工具「t2」/)

  const strict = await manager.create({
    name: 'Strict',
    persona: '严格模式。',
    tools: { mode: 'deny', deny: ['t2', PROBE_TOOL] },
  })
  await manager.setSession('sess1', { mode: 'manual', presetId: strict.preset.id })
  runtime.refreshSession('sess1')
  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name), ['t1'])
  assert.equal((await execute('t2')).isError, true)
  assert.equal((await execute(PROBE_TOOL)).isError, true)
  assert.match((await execute(PROBE_TOOL)).content[0].text, /不允许调用工具/)

  await manager.update(diana.preset.id, {
    ...diana.preset,
    persona: '新的人格。',
    tools: { mode: 'allow', allow: ['t1', PROBE_TOOL] },
  })
  await manager.setSession('sess1', { mode: 'manual', presetId: diana.preset.id })
  runtime.refreshSession('sess1')
  const updated = H.renderPrompt(await root.systemPrompt.assemble({ scope: agent, agent }))
  assert.match(updated, /新的人格。/)
  assert.doesNotMatch(updated, /严格模式/)

  runtime.dispose()
  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name).sort(), [PROBE_TOOL, 't1', 't2'].sort())
  const after = H.renderPrompt(await root.systemPrompt.assemble({ scope: agent, agent }))
  assert.doesNotMatch(after, /新的人格/)
})

test('allow-all and deny-all boundaries', { skip }, async (t) => {
  const { root, manager, runtime, agent } = await setup(t)
  const all = await manager.create({ name: 'All', persona: '', tools: { mode: 'all' } })
  await manager.setDefault(all.preset.id)
  await manager.setSession('sess1', { mode: 'manual', presetId: all.preset.id })
  runtime.refreshSession('sess1')
  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name).sort(), [PROBE_TOOL, 't1', 't2'].sort())

  const none = await manager.create({ name: 'None', persona: '', tools: { mode: 'allow', allow: [] } })
  await manager.setSession('sess1', { mode: 'manual', presetId: none.preset.id })
  runtime.refreshSession('sess1')
  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name), [])
  const batch = await root.tools.execute({
    calls: [{ type: 'tool-call', id: 'c', name: 't1', arguments: '{}' }],
    signal: new AbortController().signal,
    agent,
  })
  assert.equal(batch.results[0].result.isError, true)
})

test('a newly registered tool respects allow-list rules after refresh', { skip }, async (t) => {
  const { root, manager, runtime, agent, make } = await setup(t)
  const preset = await manager.create({ name: 'T1 only', tools: { mode: 'allow', allow: ['t1'] } })
  await manager.setDefault(preset.preset.id)
  await manager.setSession('sess1', { mode: 'manual', presetId: preset.preset.id })
  runtime.refreshSession('sess1')

  root.tools.register(make('t3'))
  assert.equal(root.tools.definitions(agent).some((tool) => tool.name === 't3'), false)
  let batch = await root.tools.execute({
    calls: [{ type: 'tool-call', id: 'c3', name: 't3', arguments: '{}' }],
    signal: new AbortController().signal,
    agent,
  })
  assert.equal(batch.results[0].result.isError, true)

  await manager.update(preset.preset.id, {
    ...preset.preset,
    tools: { mode: 'allow', allow: ['t1', 't3'] },
  })
  runtime.refreshAll()
  assert.equal(root.tools.definitions(agent).some((tool) => tool.name === 't3'), true)
  batch = await root.tools.execute({
    calls: [{ type: 'tool-call', id: 'c3b', name: 't3', arguments: '{}' }],
    signal: new AbortController().signal,
    agent,
  })
  assert.equal(batch.results[0].result.isError, false)
})

test('no preset leaves the native Agent composition untouched', { skip }, async (t) => {
  const { H, root, manager, runtime, agent } = await setup(t)
  await manager.setSession('sess1', { mode: 'none', presetId: null })
  runtime.refreshSession('sess1')
  assert.deepEqual(root.tools.definitions(agent).map((tool) => tool.name).sort(), [PROBE_TOOL, 't1', 't2'].sort())
  const text = H.renderPrompt(await root.systemPrompt.assemble({ scope: agent, agent }))
  assert.doesNotMatch(text, /Diana/)
})
test('two live Sessions keep independent prompt and tool state', { skip }, async (t) => {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.ToolsService)
  await root.plugin(H.SystemPrompt, {})
  await root.plugin({ name: H.nativeExecutor.name, inject: H.nativeExecutor.inject, apply: H.nativeExecutor.apply })
  const dir = await mkdtemp(join(tmpdir(), 'dspm-two-'))
  const store = new PresetStore({ file: join(dir, 'state.json'), limits: LIMITS, logger })
  store.loadSync()
  const manager = new PresetManager({ store, limits: LIMITS, logger })
  const probeDispose = registerProbe(root, root.get('tools'))
  const presetKey = {}
  const presetScope = H.createScope(root, presetKey)
  const tool = H.defineTool({
    name: 'shared',
    description: 'shared',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute() { return 'shared-ok' },
  })
  presetScope.ctx.get('tools').register(tool)
  const agentA = { id: 'a', session: { header: { id: 'a' } } }
  const agentB = { id: 'b', session: { header: { id: 'b' } } }
  const scopeA = H.createScope(root, agentA, { parent: presetKey })
  const scopeB = H.createScope(root, agentB, { parent: presetKey })
  agentA.ctx = scopeA.ctx
  agentB.ctx = scopeB.ctx
  const runtime = new PresetRuntime({ scope: root, manager, config: { refreshDebounceMs: 5 }, logger })
  t.after(async () => {
    runtime.dispose()
    probeDispose()
    await presetScope.dispose().catch(() => {})
    await scopeA.dispose().catch(() => {})
    await scopeB.dispose().catch(() => {})
    await root.fiber.dispose().catch(() => {})
    await rm(dir, { recursive: true, force: true })
  })

  const presetA = await manager.create({ name: 'A', persona: 'PERSONA A', tools: { mode: 'allow', allow: ['shared', PROBE_TOOL] } })
  const presetB = await manager.create({ name: 'B', persona: 'PERSONA B', tools: { mode: 'deny', deny: ['shared', PROBE_TOOL] } })
  await runtime.attach(agentA, 'test')
  await runtime.attach(agentB, 'test')
  await manager.setSession('a', { mode: 'manual', presetId: presetA.preset.id })
  await manager.setSession('b', { mode: 'manual', presetId: presetB.preset.id })
  runtime.refreshAll()

  const promptA = H.renderPrompt(await root.systemPrompt.assemble({ scope: agentA, agent: agentA }))
  const promptB = H.renderPrompt(await root.systemPrompt.assemble({ scope: agentB, agent: agentB }))
  assert.match(promptA, /PERSONA A/)
  assert.doesNotMatch(promptA, /PERSONA B/)
  assert.match(promptB, /PERSONA B/)
  assert.doesNotMatch(promptB, /PERSONA A/)
  assert.deepEqual(root.tools.definitions(agentA).map((item) => item.name).sort(), [PROBE_TOOL, 'shared'].sort())
  assert.deepEqual(root.tools.definitions(agentB).map((item) => item.name), [])

  const call = (name, id) => ({ type: 'tool-call', id, name, arguments: '{}' })
  const run = async (agent, name, id) => {
    const batch = await root.tools.execute({ calls: [call(name, id)], signal: new AbortController().signal, agent })
    return batch.results[0].result
  }
  assert.equal((await run(agentA, 'shared', 'a1')).isError, false)
  assert.equal((await run(agentB, 'shared', 'b1')).isError, true)
  assert.equal((await run(agentA, PROBE_TOOL, 'a2')).isError, false)
  assert.equal((await run(agentB, PROBE_TOOL, 'b2')).isError, true)
})
