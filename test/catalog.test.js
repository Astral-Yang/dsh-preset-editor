import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyTool, workspaceIndex, toolNamesForAgent, buildToolCatalog, buildPromptCatalog } from '../lib/catalog.js'
import { harnessAvailable, loadHarness } from './harness.mjs'

const logger = { warn() {}, info() {}, error() {}, debug() {} }

test('MCP names expose their server; built-ins and plugins are classified', () => {
  assert.deepEqual(classifyTool('mcp__siyuan__fs'), { origin: 'mcp', server: 'siyuan', label: 'MCP · siyuan' })
  assert.equal(classifyTool('mcp__broken').origin, 'mcp')
  assert.equal(classifyTool('mcp__broken').server, undefined)
  assert.equal(classifyTool('read').origin, 'builtin')
  assert.equal(classifyTool('plugin_manager').origin, 'plugin')
  assert.equal(classifyTool('run_code').origin, 'transport')
})

test('workspaceIndex maps accounted Sessions to workspaces', () => {
  const registry = {
    list: () => [
      { id: 'w1', title: 'One', path: '/one', sessionIds: ['s1', 's2'] },
      { id: 'w2', title: 'Two', path: '/two', sessionIds: ['s3'] },
    ],
  }
  const { bySession, workspaces } = workspaceIndex(registry)
  assert.equal(bySession.get('s1'), 'w1')
  assert.equal(bySession.get('s3'), 'w2')
  assert.equal(workspaces.length, 2)
})

test('workspaceIndex tolerates a missing or broken registry', () => {
  assert.deepEqual(workspaceIndex(undefined), { bySession: new Map(), workspaces: [] })
  assert.deepEqual(workspaceIndex({ list() { throw new Error('broken') } }), { bySession: new Map(), workspaces: [] })
})

test('toolNamesForAgent reads the exact Agent scope and drops run_code', () => {
  const agent = { id: 'a' }
  const ctx = { tools: { definitions(scope) { assert.equal(scope, agent); return [{ name: 'read' }, { name: 'run_code' }] } } }
  assert.deepEqual([...toolNamesForAgent(ctx, agent)], ['read'])
  assert.deepEqual([...toolNamesForAgent({ tools: { definitions() { throw new Error('no') } } }, agent)], [])
})

test('buildToolCatalog merges global and Agent-preset scopes', async () => {
  const ctx = {
    tools: {
      definitions(scope) {
        if (scope === undefined) return [{ name: 'read', description: 'Read' }]
        return [{ name: 'read', description: 'Read' }, { name: 'bash', description: 'Shell' }]
      },
    },
  }
  const scope = {
    get(name) {
      if (name !== 'agentPresets') return undefined
      return {
        async list() { return [{ id: 'standard', name: 'Standard' }] },
        async acquireScope() {
          return { key: { id: 'preset' }, async [Symbol.asyncDispose]() {} }
        },
      }
    },
  }
  const catalog = await buildToolCatalog(ctx, scope, logger)
  assert.deepEqual(catalog.tools.map((tool) => tool.name).sort(), ['bash', 'read'])
  assert.deepEqual(catalog.tools.find((tool) => tool.name === 'read').availableIn, ['agent-preset:standard', 'global'])
  assert.match(catalog.tools.find((tool) => tool.name === 'bash').availableIn[0], /agent-preset/)
  assert.deepEqual(catalog.agentPresets, [{ id: 'standard', name: 'Standard', description: '', failed: false }])
})

test('buildToolCatalog survives a broken Agent-preset registry', async () => {
  const ctx = { tools: { definitions() { return [{ name: 'read' }] } } }
  const scope = { get(name) { return name === 'agentPresets' ? { async list() { throw new Error('no') } } : undefined } }
  const catalog = await buildToolCatalog(ctx, scope, logger)
  assert.deepEqual(catalog.tools.map((tool) => tool.name), ['read'])
  assert.deepEqual(catalog.agentPresets, [])
})

test('buildPromptCatalog merges global, preset and assembly-listener sections', async () => {
  const ctx = {
    systemPrompt: {
      async assemble(context) {
        const scope = context && context.scope
        if (!scope) return {
          sections: [
            { name: 'harness:identity', text: 'Identity' },
            { name: 'dsh-expression:companion', text: '斗图规则' },
          ],
        }
        return {
          sections: [
            { name: 'harness:identity', text: 'Identity' },
            { name: 'dsh-expression:companion', text: '斗图规则' },
            { name: `preset:${scope.id}`, text: `Preset ${scope.id}` },
          ],
        }
      },
    },
  }
  const scope = {
    get(name) {
      if (name !== 'agentPresets') return undefined
      return {
        async list() { return [{ id: 'standard' }, { id: 'broken', broken: 'bad' }] },
        async acquireScope(id) {
          if (id === 'broken') throw new Error('inactive')
          return { key: { id }, async [Symbol.asyncDispose]() {} }
        },
      }
    },
  }
  const catalog = await buildPromptCatalog(ctx, scope, logger)
  const byName = new Map(catalog.promptSections.map((row) => [row.name, row]))
  assert.equal(byName.get('dsh-expression:companion').origin, 'dsh-expression')
  assert.deepEqual(byName.get('dsh-expression:companion').availableIn, ['agent-preset:standard', 'global'])
  assert.deepEqual(byName.get('preset:standard').availableIn, ['agent-preset:standard'])
  assert.equal(byName.get('harness:identity').protected, true)
  assert.equal(byName.has('preset:broken'), false)
})

test('buildPromptCatalog tolerates a missing systemPrompt service', async () => {
  const catalog = await buildPromptCatalog({}, { get() { return undefined } }, logger)
  assert.deepEqual(catalog.promptSections, [])
})

test('buildPromptCatalog includes listener-added and scoped sections on a real SystemPrompt', { skip: harnessAvailable ? false : 'the installed DSH packages are not available; set DSH_PACKAGES' }, async (t) => {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.SystemPrompt, {})
  root.systemPrompt.section({ name: 'global:static', order: 100, text: 'GLOBAL' })
  const stopMeme = root.on('system-prompt/assemble', async (assembly, _context, next) => {
    const result = await next()
    result.sections.push({ name: 'dsh-expression:companion', text: '斗图规则' })
    return result
  })
  const key = { id: 'standard' }
  const preset = H.createScope(root, key)
  preset.ctx.inject(['systemPrompt'], (scoped) => {
    scoped.systemPrompt.section({ name: 'preset:only', order: 200, text: 'PRESET' })
  })
  await Promise.resolve()
  t.after(async () => {
    stopMeme()
    await preset.dispose()
    await root.fiber.dispose().catch(() => {})
  })
  const registry = {
    async list() { return [{ id: 'standard' }] },
    async acquireScope() { return { key, async [Symbol.asyncDispose]() {} } },
  }
  const scope = { get(name) { return name === 'agentPresets' ? registry : undefined } }
  const catalog = await buildPromptCatalog(root, scope, logger)
  const byName = new Map(catalog.promptSections.map((row) => [row.name, row]))
  assert.deepEqual(byName.get('dsh-expression:companion').availableIn, ['agent-preset:standard', 'global'])
  assert.deepEqual(byName.get('preset:only').availableIn, ['agent-preset:standard'])
  assert.deepEqual(byName.get('global:static').availableIn, ['agent-preset:standard', 'global'])
  assert.equal(byName.get('harness:identity').protected, true)
})
