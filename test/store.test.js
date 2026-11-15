import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, stat, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PresetStore, PresetError } from '../lib/store.js'

const LIMITS = { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }
const logger = { info() {}, warn() {}, error() {}, debug() {} }

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dspm-store-'))
  try {
    const file = join(dir, 'state.json')
    const store = new PresetStore({ file, limits: LIMITS, logger })
    store.loadSync()
    await fn({ store, file, dir })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('missing file starts empty and writes state atomically (0600 on POSIX)', async () => {
  await withStore(async ({ store, file }) => {
    const loaded = store.loadSync()
    assert.deepEqual(loaded.warnings, [])
    assert.equal(store.generation, 0)
    const { state } = await store.transact((draft) => {
      draft.presets.push({ id: 'a', name: 'A', tools: { mode: 'all', allow: [], deny: [] }, enabled: true, order: 0 })
    })
    assert.equal(state.generation, 1)
    if (process.platform !== 'win32') {
      const mode = (await stat(file)).mode & 0o777
      assert.equal(mode, 0o600)
    }
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(parsed.presets[0].id, 'a')
  })
})

test('a corrupt file is moved aside instead of overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dspm-store-'))
  try {
    const file = join(dir, 'state.json')
    await writeFile(file, '{broken')
    const store = new PresetStore({ file, limits: LIMITS, logger })
    const loaded = store.loadSync()
    assert.ok(loaded.warnings.some((warning) => warning.includes('无法解析')))
    const files = await readdir(dir)
    assert.ok(files.some((name) => name.startsWith('state.json.corrupt-')))
    assert.equal(store.generation, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a write is serialized and generation conflicts are rejected', async () => {
  await withStore(async ({ store }) => {
    await store.transact((draft) => { draft.defaultPresetId = 'a' }, 0)
    await assert.rejects(
      store.transact((draft) => { draft.defaultPresetId = 'b' }, 0),
      (error) => error instanceof PresetError && error.code === 'STALE' && error.status === 409,
    )
    assert.equal(store.getState().defaultPresetId, 'a')
    assert.equal(store.generation, 1)
  })
})

test('a failed mutator commits nothing', async () => {
  await withStore(async ({ store, file }) => {
    await store.transact((draft) => { draft.defaultPresetId = 'a' })
    const before = await readFile(file, 'utf8')
    await assert.rejects(store.transact((draft) => {
      draft.defaultPresetId = 'b'
      throw new Error('boom')
    }), /boom/)
    assert.equal(store.getState().defaultPresetId, 'a')
    assert.equal(await readFile(file, 'utf8'), before)
  })
})


test('a write failure preserves the previous snapshot and generation', async () => {
  await withStore(async ({ store, file }) => {
    await store.transact((draft) => { draft.defaultPresetId = 'a' })
    const before = await readFile(file, 'utf8')
    const generation = store.generation
    // Portable write failure: replacing the target file with a directory makes
    // the atomic rename fail on both POSIX and Windows, without relying on chmod.
    await rm(file)
    await mkdir(file)
    try {
      await assert.rejects(store.transact((draft) => { draft.defaultPresetId = 'b' }))
    } finally {
      await rm(file, { recursive: true, force: true })
      await writeFile(file, before)
    }
    assert.equal(store.getState().defaultPresetId, 'a')
    assert.equal(store.generation, generation)
    assert.equal(await readFile(file, 'utf8'), before)
  })
})

test('future versions are backed up before a best-effort read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dspm-store-'))
  try {
    const file = join(dir, 'state.json')
    await writeFile(file, JSON.stringify({ version: 99, presets: [], generation: 2 }))
    const store = new PresetStore({ file, limits: LIMITS, logger })
    const loaded = store.loadSync()
    assert.ok(loaded.warnings.some((warning) => warning.includes('备份')))
    const files = await readdir(dir)
    assert.ok(files.some((name) => name.startsWith('state.json.backup-v99-')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})