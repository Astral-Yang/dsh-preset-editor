import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyTool, workspaceIndex, toolNamesForAgent, buildToolCatalog } from '../lib/catalog.js'

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
