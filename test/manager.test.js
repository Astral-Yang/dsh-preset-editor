import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PresetStore, PresetError } from '../lib/store.js'
import { PresetManager } from '../lib/manager.js'

const LIMITS = { maxPresets: 5, maxPersonaChars: 1000, maxSessionAssignments: 20 }
const logger = { info() {}, warn() {}, error() {}, debug() {} }

async function withManager(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dspm-manager-'))
  try {
    const file = join(dir, 'state.json')
    const store = new PresetStore({ file, limits: LIMITS, logger })
    store.loadSync()
    const manager = new PresetManager({ store, limits: LIMITS, logger })
    await fn({ manager, store })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('create, update, duplicate, and delete a preset', async () => {
  await withManager(async ({ manager }) => {
    const created = await manager.create({
      name: 'Diana',
      persona: 'You are Diana.',
      tools: { mode: 'allow', allow: ['read'] },
    })
    assert.equal(created.preset.id, 'diana')
    assert.equal(manager.list().length, 1)

    const updated = await manager.update('diana', {
      name: 'Diana 2',
      persona: 'New persona',
      tools: { mode: 'deny', deny: ['bash'] },
      enabled: false,
    })
    assert.equal(updated.preset.name, 'Diana 2')
    assert.equal(updated.preset.enabled, false)

    const copy = await manager.duplicate('diana')
    assert.equal(copy.preset.name, 'Diana 2 副本')
    assert.notEqual(copy.preset.id, 'diana')

    const removed = await manager.remove(copy.preset.id)
    assert.equal(removed.deleted.id, copy.preset.id)
    assert.equal(manager.list().length, 1)
  })
})

test('duplicate names are rejected case-insensitively', async () => {
  await withManager(async ({ manager }) => {
    await manager.create({ name: 'Diana' })
    await assert.rejects(manager.create({ name: 'diana' }), (error) => error.code === 'DUPLICATE_NAME')
    const other = await manager.create({ name: 'Coder' })
    await assert.rejects(manager.update(other.preset.id, { name: 'DIANA' }), (error) => error.code === 'DUPLICATE_NAME')
  })
})

test('the preset cap is enforced', async () => {
  await withManager(async ({ manager }) => {
    for (let index = 0; index < LIMITS.maxPresets; index += 1) await manager.create({ name: `P${index}` })
    await assert.rejects(manager.create({ name: 'Overflow' }), (error) => error.code === 'PRESET_LIMIT')
  })
})

test('scope precedence is session > workspace > global > none', async () => {
  await withManager(async ({ manager }) => {
    const global = await manager.create({ name: 'Global' })
    const workspace = await manager.create({ name: 'Workspace' })
    const session = await manager.create({ name: 'Session' })
    await manager.setDefault(global.preset.id)
    await manager.setWorkspace('w1', workspace.preset.id)

    assert.equal(manager.resolve('s1', 'w1').source, 'workspace')
    assert.equal(manager.resolve('s1', 'w1').preset.id, workspace.preset.id)

    await manager.setSession('s1', { mode: 'manual', presetId: workspace.preset.id })
    assert.equal(manager.resolve('s1', 'w1').source, 'session')
    assert.equal(manager.resolve('s1', 'w1').preset.id, workspace.preset.id)

    assert.equal(manager.resolve('s2', 'w1').source, 'workspace')
    assert.equal(manager.resolve('s2', 'w1').preset.id, workspace.preset.id)

    await manager.setWorkspace('w1', null)
    assert.equal(manager.resolve('s2', 'w1').source, 'global')
    assert.equal(manager.resolve('s2', 'w1').preset.id, global.preset.id)

    await manager.setSession('s2', { mode: 'none', presetId: null })
    const none = manager.resolve('s2', 'w1')
    assert.equal(none.source, 'none')
    assert.equal(none.preset, null)
  })
})


test('two workspaces keep independent defaults', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setWorkspace('w1', b.preset.id)
    assert.equal(manager.resolve('s1', 'w1').preset.id, b.preset.id)
    assert.equal(manager.resolve('s2', 'w2').preset.id, a.preset.id)
    await manager.setWorkspace('w1', null)
    assert.equal(manager.resolve('s1', 'w1').preset.id, a.preset.id)
    assert.equal(manager.resolve('s2', 'w2').preset.id, a.preset.id)
  })
})

test('follow mode re-resolves the workspace and global chain', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setSession('s1', { mode: 'follow', presetId: null })
    assert.equal(manager.resolve('s1', null).preset.id, a.preset.id)
    await manager.setWorkspace('w1', b.preset.id)
    assert.equal(manager.resolve('s1', 'w1').preset.id, b.preset.id)
  })
})

test('disabled presets fall back and report the reason', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setSession('s1', { mode: 'manual', presetId: b.preset.id })
    await manager.update(b.preset.id, {
      name: 'B',
      enabled: false,
      tools: { mode: 'all' },
    })
    const resolved = manager.resolve('s1', null)
    assert.equal(resolved.preset.id, a.preset.id)
    assert.equal(resolved.source, 'global')
    assert.match(resolved.fallback, /已停用/)
  })
})

test('attachSession pins the creation-time effective preset', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setWorkspace('w1', b.preset.id)

    const first = await manager.attachSession('s1', 'w1')
    assert.equal(first.preset.id, b.preset.id)
    assert.equal(first.assignment.mode, 'manual')
    assert.equal(first.assignment.origin, 'workspace')

    await manager.setWorkspace('w1', a.preset.id)
    const again = await manager.attachSession('s1', 'w1')
    assert.equal(again.preset.id, b.preset.id)
    assert.equal(again.assignment.origin, 'workspace')
  })
})


test('an explicit follow assignment stays follow across attach', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setSession('s1', { mode: 'follow', presetId: null })
    await manager.setWorkspace('w1', b.preset.id)
    const attached = await manager.attachSession('s1', 'w1')
    assert.equal(attached.preset.id, b.preset.id)
    assert.equal(attached.assignment.mode, 'follow')
    assert.equal(manager.store.getState().sessions.s1.mode, 'follow')
  })
})

test('a parent preference is inherited before workspace defaults', async () => {
  await withManager(async ({ manager }) => {
    const global = await manager.create({ name: 'Global' })
    const parent = await manager.create({ name: 'Parent' })
    await manager.setDefault(global.preset.id)
    const child = await manager.attachSession('child', null, { preferredPresetId: parent.preset.id, preferredOrigin: 'parent' })
    assert.equal(child.preset.id, parent.preset.id)
    assert.equal(child.assignment.origin, 'parent')
  })
})

test('in-use deletion requires force and a fallback', async () => {
  await withManager(async ({ manager, store }) => {
    const a = await manager.create({ name: 'A' })
    const b = await manager.create({ name: 'B' })
    await manager.setDefault(a.preset.id)
    await manager.setWorkspace('w1', a.preset.id)
    await manager.attachSession('s1', 'w1')

    await assert.rejects(
      manager.remove(a.preset.id),
      (error) => error.code === 'PRESET_IN_USE' && error.details.usage.total === 3,
    )
    assert.equal(manager.list().length, 2)

    const removed = await manager.remove(a.preset.id, { force: true, reassignTo: b.preset.id })
    assert.equal(removed.replacement, b.preset.id)
    assert.equal(manager.resolve('s1', 'w1').preset.id, b.preset.id)
    assert.equal(manager.store.getState().defaultPresetId, b.preset.id)
    assert.equal(manager.store.getState().workspaces.w1, b.preset.id)
    assert.equal(manager.resolve('s1', 'w1').source, 'session')

    const c = await manager.create({ name: 'C' })
    await manager.setSession('s2', { mode: 'manual', presetId: c.preset.id })
    const removed2 = await manager.remove(c.preset.id, { force: true, reassignTo: null })
    assert.equal(removed2.replacement, null)
    assert.equal(manager.resolve('s2', null).preset.id, b.preset.id)
    assert.equal(manager.store.getState().sessions.s2.mode, 'follow')
    assert.ok(store.generation > 0)
  })
})

test('invalid input leaves the store untouched', async () => {
  await withManager(async ({ manager }) => {
    const before = manager.store.generation
    await assert.rejects(manager.create({ name: '' }), (error) => error.code === 'INVALID_PRESET')
    assert.equal(manager.store.generation, before)
    assert.equal(manager.list().length, 0)
  })
})

test('setSession rejects a disabled preset', async () => {
  await withManager(async ({ manager }) => {
    const a = await manager.create({ name: 'A' })
    await manager.update(a.preset.id, { name: 'A', enabled: false, tools: { mode: 'all' } })
    await assert.rejects(manager.setSession('s1', { mode: 'manual', presetId: a.preset.id }), (error) => error.code === 'PRESET_DISABLED')
  })
})