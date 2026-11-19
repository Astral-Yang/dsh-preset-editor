import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPresetPreview, previewPart, previewSummary } from '../lib/preview.js'
import { harnessAvailable, loadHarness } from './harness.mjs'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

function harness() {
  const disposed = []
  const assembly = {
    sections: [
      { name: 'harness:identity', text: 'You are DSH.' },
      { name: 'deployment:persona-prefix', text: 'Persona {{model}}' },
      { name: 'dsh-expression:companion', text: '斗图规则' },
      { name: 'plugin:keep', text: 'KEEP' },
    ],
    contexts: [
      { name: 'working-directory:current', text: '', interpolate: false },
      { name: 'sandbox:policy', text: 'sandbox: workspace-write' },
    ],
    variables: { model: 'DeepSeek' },
    tools: [
      { name: 'read', description: 'Read files', parameters: { properties: { path: {} } } },
      { name: 'bash', description: 'Shell', parameters: { properties: { command: {} } } },
      { name: 'send_meme', description: 'Meme', parameters: { properties: {} } },
      { name: 'run_code', description: 'PTC', parameters: { properties: {} } },
    ],
  }
  const overlay = {
    enabled: true,
    tools: { mode: 'deny', allow: [], deny: ['bash', 'send_meme'] },
    prompts: { mode: 'deny', allow: [], deny: ['dsh-expression:companion'] },
  }
  const registry = {
    async acquireScope() {
      return { key: { id: 'standard' }, async [Symbol.asyncDispose]() { disposed.push('scope') } }
    },
  }
  const native = {
    async read(id) {
      return { id, name: 'standard', description: 'Standard', mode: 'builtin', builtIn: true, plugins: [{ name: '@deepseek-ai/dsh-persona' }, { name: 'x' }] }
    },
    overlay() { return overlay },
  }
  const ctx = {
    systemPrompt: { async assemble() { return assembly } },
    get(name) {
      if (name === 'agentPresets') return registry
      if (name === 'tools') return { view() { return { restrictableNames: new Set(['read', 'bash', 'run_code']) } } }
      return undefined
    },
  }
  return { ctx, native, disposed }
}

test('buildPresetPreview reports sections, contexts, tools and overlay decisions', async () => {
  const h = harness()
  const data = await buildPresetPreview({ ctx: h.ctx, scope: h.ctx, native: h.native, id: 'standard', logger })
  const summary = previewSummary(data)
  assert.equal(summary.id, 'standard')
  assert.equal(summary.prompt.renderedPreview.includes('Persona DeepSeek'), true)
  assert.equal(summary.prompt.renderedPreview.includes('斗图规则'), false)
  assert.equal(summary.prompt.renderedPreview.includes('KEEP'), true)
  assert.equal(summary.prompt.sections.find((row) => row.name === 'harness:identity').protected, true)
  assert.equal(summary.prompt.sections.find((row) => row.name === 'dsh-expression:companion').filtered, true)
  assert.equal(summary.prompt.contexts.find((row) => row.name === 'sandbox:policy').active, true)
  assert.equal(summary.tools.items.find((row) => row.name === 'bash').visibility, 'hidden')
  assert.equal(summary.tools.items.find((row) => row.name === 'send_meme').visibility, 'hidden')
  assert.equal(summary.tools.items.find((row) => row.name === 'read').visibility, 'visible')
  assert.deepEqual(summary.tools.counts, { total: 4, visible: 2, hidden: 2, guardOnly: 0, unknown: 0 })
  assert.equal(summary.notes.some((note) => note.includes('静态模拟')), true)
  assert.equal(summary.warnings.some((warning) => warning.includes('静态模拟')), false)
  assert.deepEqual(h.disposed, ['scope'])
})

test('previewPart returns full prompt, section, context and tool schemas', async () => {
  const h = harness()
  const data = await buildPresetPreview({ ctx: h.ctx, scope: h.ctx, native: h.native, id: 'standard', logger })
  const prompt = previewPart(data, 'prompt')
  assert.equal(prompt.text.includes('Persona DeepSeek'), true)
  assert.equal(prompt.text.includes('斗图规则'), false)
  const section = previewPart(data, 'section', 'plugin:keep')
  assert.equal(section.text, 'KEEP')
  const context = previewPart(data, 'context', 'sandbox:policy')
  assert.equal(context.text, 'sandbox: workspace-write')
  const tool = previewPart(data, 'tool', 'read')
  assert.equal(tool.schema.name, 'read')
  assert.equal(tool.parameterCount, 1)
  assert.throws(() => previewPart(data, 'section', 'missing'), (error) => error.code === 'PREVIEW_PART_NOT_FOUND')
})

test('buildPresetPreview rejects a missing systemPrompt service', async () => {
  const h = harness()
  await assert.rejects(
    buildPresetPreview({ ctx: { get() { return undefined } }, scope: { get() { return undefined } }, native: h.native, id: 'standard', logger }),
    (error) => error.code === 'PREVIEW_UNAVAILABLE',
  )
})


test('buildPresetPreview reads a real SystemPrompt assembly', { skip: harnessAvailable ? false : 'the installed DSH packages are not available; set DSH_PACKAGES' }, async (t) => {
  const H = await loadHarness()
  const root = new H.Context()
  await root.plugin(H.SystemPrompt, {})
  root.systemPrompt.section({ name: 'global:static', order: 100, text: 'GLOBAL' })
  const key = { id: 'standard' }
  const preset = H.createScope(root, key)
  preset.ctx.inject(['systemPrompt'], (scoped) => {
    scoped.systemPrompt.section({ name: 'preset:only', order: 200, text: 'PRESET' })
    scoped.systemPrompt.context({ name: 'preview:context', order: 100, text: 'CTX' })
  })
  await Promise.resolve()
  t.after(async () => {
    await preset.dispose()
    await root.fiber.dispose().catch(() => {})
  })
  const registry = {
    async acquireScope() { return { key, async [Symbol.asyncDispose]() {} } },
  }
  const native = {
    async read(id) { return { id, name: id, plugins: [], mode: 'builtin', builtIn: true } },
    overlay() { return null },
  }
  const ctx = {
    systemPrompt: root.systemPrompt,
    get(name) { return name === 'agentPresets' ? registry : undefined },
  }
  const data = await buildPresetPreview({ ctx, scope: ctx, native, id: 'standard', logger })
  assert.equal(data.prompt.sections.some((row) => row.name === 'global:static'), true)
  assert.equal(data.prompt.sections.some((row) => row.name === 'preset:only'), true)
  assert.equal(data.prompt.contexts.some((row) => row.name === 'preview:context' && row.text === 'CTX'), true)
  assert.equal(data.prompt.rendered.includes('GLOBAL'), true)
  assert.equal(data.prompt.rendered.includes('PRESET'), true)
})
