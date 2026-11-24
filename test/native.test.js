import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildManagedBlock, extractManagedDefinitions, mergePatchText, parsePluginsYaml, validatePatchText, validatePlugins } from '../lib/native.js'
import { PresetError } from '../lib/store.js'

const plugins = `- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: |-
      Hello
      world
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
`

const definition = {
  configId: 'standard',
  rowId: 'preset-standard',
  mode: 'override',
  name: 'Standard',
  description: 'desc',
  order: 1,
  plugins: parsePluginsYaml(plugins),
}

test('entry-list YAML preserves !!js expressions and block scalars', () => {
  const parsed = parsePluginsYaml(plugins)
  assert.equal(parsed[0].config.prefix, 'Hello\nworld')
  assert.deepEqual(parsed[1].disabled, { __jsExpr: "process.platform === 'win32'" })
})

test('managed block round-trips through extraction', () => {
  const block = buildManagedBlock({ standard: definition })
  assert.match(block, /!!js process\.platform/)
  const definitions = extractManagedDefinitions(`[]\n${block}`)
  assert.deepEqual(Object.keys(definitions), ['standard'])
  const insertBlock = buildManagedBlock({ test1: { ...definition, configId: 'test1', rowId: 'preset-test1', mode: 'create' } })
  const inserted = extractManagedDefinitions(`[]\n${insertBlock}`)
  assert.equal(inserted.test1.mode, 'create')
  assert.equal(definitions.standard.rowId, 'preset-standard')
  assert.equal(definitions.standard.plugins[1].disabled.__jsExpr, "process.platform === 'win32'")
})

test('merge preserves unrelated patch rows and removes the managed block', () => {
  const block = buildManagedBlock({ standard: definition })
  const existing = `- id: other\n  name: some-plugin\n`
  const merged = mergePatchText(existing, block)
  assert.match(merged, /id: other/)
  assert.match(merged, /preset-standard/)
  const cleaned = mergePatchText(merged, '')
  assert.equal(cleaned.trim(), existing.trim())
})

test('merge replaces an existing managed block in place', () => {
  const first = mergePatchText('[]', buildManagedBlock({ a: { ...definition, configId: 'a', rowId: 'preset-a' } }))
  const second = mergePatchText(first, buildManagedBlock({ b: { ...definition, configId: 'b', rowId: 'preset-b' } }))
  assert.doesNotMatch(second, /id: a\n/)
  assert.match(second, /id: preset-b/)
})

const imageGenRow = `# user comment: keep this row
- id: image-gen
  name: dsh-image-gen
  config:
    provider: openai-compat
    note: |-
      line one
      line two
    openaiCompatBaseURL: "https://api.example.com/v1"
    disabled: !!js process.platform === 'win32'
`
const endMarker = '# <<< dsh-preset-editor managed presets'

function blockWithImageGen(block) {
  return block.replace(`${endMarker}\n`, `${imageGenRow}${endMarker}\n`)
}

test('merge moves non-managed rows out of the managed block and keeps them on repeated saves', () => {
  const block = buildManagedBlock({ standard: definition })
  const existing = `# profile header\n- id: other\n  name: other-plugin\n\n${blockWithImageGen(block)}`
  const first = mergePatchText(existing, block)
  const begin = first.indexOf('# >>> dsh-preset-editor managed presets')
  const end = first.indexOf(endMarker)
  const image = first.indexOf('- id: image-gen')
  assert.ok(begin >= 0 && end > begin)
  assert.ok(image > end, 'image-gen must be outside the managed block')
  assert.equal((first.match(/- id: image-gen/g) || []).length, 1)
  assert.match(first, /# user comment: keep this row/)
  assert.match(first, /note: \|-\n      line one\n      line two/)
  assert.match(first, /openaiCompatBaseURL: "https:\/\/api\.example\.com\/v1"/)
  assert.match(first, /!!js process\.platform/)
  assert.doesNotThrow(() => validatePatchText(first))

  const second = mergePatchText(first, block)
  assert.equal((second.match(/- id: image-gen/g) || []).length, 1)
  assert.ok(second.indexOf('- id: image-gen') > second.indexOf(endMarker))
  assert.doesNotThrow(() => validatePatchText(second))

  const withRoot = mergePatchText(`[]\n${blockWithImageGen(block)}`, block)
  assert.doesNotThrow(() => validatePatchText(withRoot))
  assert.equal((withRoot.match(/- id: image-gen/g) || []).length, 1)
})

test('two preset saves update the block without losing non-managed rows', () => {
  const firstBlock = buildManagedBlock({ a: { ...definition, configId: 'a', rowId: 'preset-a' } })
  const secondBlock = buildManagedBlock({ b: { ...definition, configId: 'b', rowId: 'preset-b' } })
  const first = mergePatchText(blockWithImageGen(firstBlock), firstBlock)
  const second = mergePatchText(first, secondBlock)
  assert.equal((second.match(/- id: image-gen/g) || []).length, 1)
  assert.doesNotMatch(second, /id: preset-a/)
  assert.match(second, /id: preset-b/)
  assert.ok(second.indexOf('- id: image-gen') > second.indexOf(endMarker))
})

test('removing the managed block keeps non-managed rows inside it', () => {
  const block = buildManagedBlock({ standard: definition })
  const existing = blockWithImageGen(block)
  const cleaned = mergePatchText(existing, '')
  assert.doesNotMatch(cleaned, /# >>> dsh-preset-editor managed presets/)
  assert.doesNotMatch(cleaned, /# <<< dsh-preset-editor managed presets/)
  assert.equal((cleaned.match(/- id: image-gen/g) || []).length, 1)
  assert.match(cleaned, /# user comment: keep this row/)
  assert.doesNotThrow(() => validatePatchText(cleaned))
})

test('mixed insert rows preserve non-preset children', () => {
  const mixed = `# >>> dsh-preset-editor managed presets — do not edit this block manually
- insert:
    - id: preset-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: standard
        plugins: []
    - id: image-gen
      name: dsh-image-gen
      config:
        provider: openai-compat
# <<< dsh-preset-editor managed presets
`
  const replacement = buildManagedBlock({ standard: definition })
  const merged = mergePatchText(mixed, replacement)
  assert.equal((merged.match(/- id: image-gen/g) || []).length, 1)
  assert.ok(merged.indexOf('- id: image-gen') > merged.indexOf(endMarker))
  assert.doesNotThrow(() => validatePatchText(merged))
})

test('invalid compositions are rejected', () => {
  assert.throws(() => parsePluginsYaml('- hello\n'), /必须是对象/)
  assert.throws(() => validatePlugins([{ id: 'x' }]), /缺少 name/)
  assert.throws(() => validatePlugins([{ name: 'x', group: true, config: {} }]), /config 必须是子条目数组/)
  assert.throws(() => validatePlugins([{ name: 'x', disabled: 'yes' }]), /disabled/)
})

test('NativeStore persists definitions and overlays through atomic transactions', async () => {
  const { NativeStore } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-'))
  try {
    const file = join(dir, 'native.json')
    const store = new NativeStore({ file, limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    await store.transact((draft) => {
      draft.definitions.standard = definition
      draft.overlays.standard = { tools: { mode: 'allow', allow: ['read'] }, enabled: true, updatedAt: new Date().toISOString() }
    })
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(parsed.definitions.standard.rowId, 'preset-standard')
    assert.deepEqual(parsed.overlays.standard.tools.allow, ['read'])
    const again = new NativeStore({ file, limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    again.loadSync()
    assert.equal(again.getState().definitions.standard.plugins.length, 2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('NativeStore normalizes legacy overlays and keeps prompt filters on tool-only writes', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-overlay-'))
  try {
    const file = join(dir, 'native.json')
    await writeFile(file, JSON.stringify({
      version: 1,
      generation: 2,
      definitions: {},
      overlays: {
        standard: { tools: { mode: 'deny', deny: ['bash'] }, enabled: true },
      },
    }))
    const store = new NativeStore({ file, limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    assert.deepEqual(store.getState().overlays.standard.prompts, { mode: 'all', allow: [], deny: [] })
    const native = new NativePresetManager({ ctx: {}, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })

    const updated = await native.setOverlay('standard', {
      prompts: { mode: 'deny', deny: ['dsh-expression:companion'] },
      enabled: true,
    })
    assert.equal(updated.overlay.tools.mode, 'deny')
    assert.deepEqual(updated.overlay.prompts.deny, ['dsh-expression:companion'])

    const toolOnly = await native.setOverlay('standard', {
      tools: { mode: 'allow', allow: ['read'] },
      enabled: true,
    })
    assert.deepEqual(toolOnly.overlay.tools.allow, ['read'])
    assert.deepEqual(toolOnly.overlay.prompts.deny, ['dsh-expression:companion'])

    await native.clearOverlay('standard')
    assert.equal(store.getState().overlays.standard, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('NativePresetManager writes a managed profile patch block and resets it', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-mgr-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    await writeFile(patchPath, '- id: other\n  name: other-plugin\n')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    const listeners = new Map()
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        if (name === 'agentPresets') return {
          defaultId: 'standard',
          async list() { return [{ id: 'standard', name: 'standard', description: '', order: 1, broken: undefined }] },
          async readDocument() { return { agentPreset: 'standard', content: plugins } },
        }
        if (name === 'loader') return { entries: () => [{ options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } } }] }
        return undefined
      },
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event).add(handler)
        return () => listeners.get(event).delete(handler)
      },
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    const saved = await native.save({ id: 'standard', name: 'Standard X', pluginsYaml: plugins }, 0)
    assert.equal(saved.application, 'restart-required')
    const text = await readFile(patchPath, 'utf8')
    assert.match(text, /id: other/)
    assert.match(text, /Standard X/)
    assert.match(text, /!!js process\.platform/)
    assert.equal(store.getState().definitions.standard.name, 'Standard X')

    const reset = await native.reset('standard', store.generation)
    assert.equal(reset.removed, true)
    assert.equal((await readFile(patchPath, 'utf8')).trim(), '- id: other\n  name: other-plugin')
    assert.deepEqual(store.getState().definitions, {})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('native manager save and reset preserve non-managed rows in the existing block', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-managed-row-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    await writeFile(patchPath, blockWithImageGen(buildManagedBlock({ standard: definition })))
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        if (name === 'agentPresets') return {
          defaultId: 'standard',
          async list() { return [{ id: 'standard', name: 'standard', description: '', order: 1 }] },
          async readDocument() { return { agentPreset: 'standard', content: plugins } },
        }
        if (name === 'loader') return { entries: () => [{ options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } } }] }
        return undefined
      },
      on() {},
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    await native.save({ id: 'standard', name: 'Standard after save', pluginsYaml: plugins }, 0)
    let text = await readFile(patchPath, 'utf8')
    assert.equal((text.match(/- id: image-gen/g) || []).length, 1)
    assert.ok(text.indexOf('- id: image-gen') > text.indexOf(endMarker))

    await native.reset('standard', store.generation)
    text = await readFile(patchPath, 'utf8')
    assert.doesNotMatch(text, /# >>> dsh-preset-editor managed presets/)
    assert.doesNotMatch(text, /# <<< dsh-preset-editor managed presets/)
    assert.equal((text.match(/- id: image-gen/g) || []).length, 1)
    assert.doesNotThrow(() => validatePatchText(text))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('automatic backups record native state and profile patch before writes', async () => {
  const { NativeStore, NativePresetManager, backupText } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-backup-'))
  try {
    const backupDir = join(dir, 'backups')
    const store = new NativeStore({
      file: join(dir, 'native.json'),
      limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      backup: { enabled: true, dir: backupDir, keep: 5 },
    })
    store.loadSync()
    await store.transact((draft) => { draft.overlays.standard = { tools: { mode: 'all', allow: [], deny: [] }, enabled: true } })
    await store.transact((draft) => { draft.overlays.standard = { tools: { mode: 'allow', allow: ['read'], deny: [] }, enabled: true } })
    const patchPath = join(dir, 'cordis.patch.yml')
    await writeFile(patchPath, '- id: other\n  name: other\n')
    await backupText({ filePath: patchPath, kind: 'patch', generation: 1, dir: backupDir, keep: 5 })
    const files = await (await import('node:fs/promises')).readdir(backupDir)
    assert.ok(files.some((name) => name.startsWith('native-')))
    assert.ok(files.some((name) => name.startsWith('patch-')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stale generation hints do not block native writes', async () => {
  const { NativeStore } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-stale-'))
  try {
    const store = new NativeStore({
      file: join(dir, 'native.json'),
      limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    })
    store.loadSync()
    const { state } = await store.transact((draft) => { draft.overlays.standard = { tools: { mode: 'all', allow: [], deny: [] }, enabled: true } }, 99)
    assert.equal(state.generation, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('repairOrphans moves a managed new preset from a direct row to insert', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-orphan-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    const broken = { ...definition, configId: 'test1', rowId: 'preset-test1', mode: 'override', name: 'Test 1' }
    await writeFile(patchPath, `[]\n${blockWithImageGen(buildManagedBlock({ test1: broken }))}`)
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    await store.transact((draft) => { draft.definitions.test1 = broken })
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        if (name === 'agentPresets') return { defaultId: 'standard', async list() { return [{ id: 'standard', name: 'standard', order: 1 }, { id: 'test1', name: 'Test 1', order: 2 }] } }
        if (name === 'loader') return { entries: () => [{ options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } } }] }
        return undefined
      },
      on() {},
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    const repaired = await native.repairOrphans()
    assert.deepEqual(repaired, ['test1'])
    assert.equal(store.getState().definitions.test1.mode, 'create')
    const text = await readFile(patchPath, 'utf8')
    assert.match(text, /- insert:/)
    assert.match(text, /id: test1/)
    assert.equal((text.match(/- id: image-gen/g) || []).length, 1)
    assert.ok(text.indexOf('- id: image-gen') > text.indexOf(endMarker))
    assert.doesNotThrow(() => validatePatchText(text))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a managed new preset stays an insert declaration after it appears in the roster', async () => {
  const { NativeStore, NativePresetManager, extractManagedDefinitions } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-insert-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    await writeFile(patchPath, '[]\n')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    let roster = []
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        if (name === 'agentPresets') return { defaultId: null, async list() { return roster } }
        if (name === 'loader') return { entries: () => [{ options: { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard' } } }] }
        return undefined
      },
      on() {},
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    const first = await native.save({ id: 'test1', name: 'Test 1', plugins: definition.plugins }, 0, { createOnly: true })
    assert.equal(store.getState().definitions.test1.mode, 'create', 'first save mode: ' + first.application)
    roster = [{ id: 'test1', name: 'Test 1', order: 1 }]
    await native.save({ id: 'test1', name: 'Test 1 edited', plugins: definition.plugins }, store.generation)
    const defs = extractManagedDefinitions(await readFile(patchPath, 'utf8'))
    assert.equal(defs.test1.mode, 'create')
    assert.equal(store.getState().definitions.test1.mode, 'create')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('restoreBackup rolls a patch or native snapshot back with new backups', async () => {
  const { NativeStore, NativePresetManager, buildManagedBlock, extractManagedDefinitions } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-restore-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    await writeFile(patchPath, '- id: other\n  name: other-plugin\n')
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        return undefined
      },
      on() {},
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    const backupDir = join(dir, 'backups')
    await (await import('node:fs/promises')).mkdir(backupDir, { recursive: true })
    const restoredDef = { ...definition, configId: 'test1', rowId: 'preset-test1', mode: 'create', name: 'Restored' }
    const backupPatch = `# snapshot\n${blockWithImageGen(buildManagedBlock({ test1: restoredDef }))}`
    await writeFile(join(backupDir, 'patch-test.yml'), backupPatch)
    const patchResult = await native.restoreBackup('patch-test.yml')
    assert.equal(patchResult.application, 'restart-required')
    let restoredText = await readFile(patchPath, 'utf8')
    assert.equal(extractManagedDefinitions(restoredText).test1.mode, 'create')
    assert.equal((restoredText.match(/- id: image-gen/g) || []).length, 1)
    assert.equal(store.getState().definitions.test1.mode, 'create')

    const snapshot = { version: 1, generation: 1, definitions: { standard: definition }, overlays: { standard: { tools: { mode: 'all', allow: [], deny: [] }, enabled: true } } }
    await writeFile(join(backupDir, 'native-test.json'), JSON.stringify(snapshot))
    const nativeResult = await native.restoreBackup('native-test.json')
    assert.equal(nativeResult.application, 'restart-required')
    assert.equal(store.getState().definitions.standard.mode, 'override')
    restoredText = await readFile(patchPath, 'utf8')
    assert.match(restoredText, /id: preset-standard/)
    assert.equal((restoredText.match(/- id: image-gen/g) || []).length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})


test('new preset ids must be lowercase and DSH-IM compatible', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-id-'))
  try {
    const patchPath = join(dir, 'cordis.patch.yml')
    await writeFile(patchPath, '[]\n')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    const fake = {
      get(name) {
        if (name === 'profileContext') return { patchPath }
        if (name === 'agentPresets') return { defaultId: null, async list() { return [] } }
        if (name === 'loader') return { entries: () => [] }
        return undefined
      },
      on() {},
    }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: {} })
    await assert.rejects(
      native.save({ id: 'Aemeath', name: 'Aemeath', plugins: definition.plugins }, 0, { createOnly: true }),
      (error) => error instanceof PresetError && error.code === 'INVALID_ID',
    )
    const saved = await native.save({ id: 'aemeath', name: 'Aemeath', plugins: definition.plugins }, 0, { createOnly: true })
    assert.equal(saved.preset.id, 'aemeath')
    assert.equal(store.getState().definitions.aemeath.mode, 'create')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('automatic backups can be disabled at runtime', async () => {
  const { NativeStore } = await import('../lib/native.js')
  const { readdir } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-backup-off-'))
  try {
    const backupDir = join(dir, 'backups')
    const store = new NativeStore({
      file: join(dir, 'native.json'),
      limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      backup: { enabled: true, dir: backupDir, keep: 5 },
    })
    store.loadSync()
    await store.transact((draft) => { draft.defaultPresetId = 'a' })
    await store.transact((draft) => { draft.defaultPresetId = 'b' })
    await store.setBackupEnabled(false)
    assert.equal(store.backupEnabled(), false)
    const before = (await readdir(backupDir)).length
    await store.transact((draft) => { draft.defaultPresetId = 'c' })
    assert.equal((await readdir(backupDir)).length, before)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('backup snapshots group a patch and native file produced together', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-snapshot-'))
  try {
    const backupDir = join(dir, 'backups')
    await (await import('node:fs/promises')).mkdir(backupDir, { recursive: true })
    await writeFile(join(backupDir, 'patch-2026-11-15T10-00-00-000Z-g1.yml'), '- id: x\n')
    await writeFile(join(backupDir, 'native-2026-11-15T10-00-00-001Z-g1.json'), '{}')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    const fake = { get(name) { if (name === 'profileContext') return { patchPath: join(dir, 'cordis.patch.yml') }; return undefined }, on() {} }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: { backupDir, backupKeep: 20 } })
    const snapshots = await native.listSnapshots()
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].files.length, 2)
    assert.deepEqual(snapshots[0].kinds.sort(), ['native', 'patch'])
    assert.ok(snapshots[0].bytes > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('snapshot grouping prefers the native generation immediately before each patch', async () => {
  const { NativeStore, NativePresetManager } = await import('../lib/native.js')
  const dir = await mkdtemp(join(tmpdir(), 'dspm-native-snapshot-gen-'))
  try {
    const backupDir = join(dir, 'backups')
    await (await import('node:fs/promises')).mkdir(backupDir, { recursive: true })
    await writeFile(join(backupDir, 'patch-2026-11-15T10-00-00-000Z-g1.yml'), 'a')
    await writeFile(join(backupDir, 'native-2026-11-15T10-00-00-001Z-g1.json'), 'b')
    await writeFile(join(backupDir, 'patch-2026-11-15T10-00-00-002Z-g2.yml'), 'c')
    const store = new NativeStore({ file: join(dir, 'native.json'), limits: { maxPresets: 10, maxPersonaChars: 1000, maxSessionAssignments: 10 }, logger: { info() {}, warn() {}, error() {}, debug() {} } })
    store.loadSync()
    const fake = { get(name) { if (name === 'profileContext') return { patchPath: join(dir, 'cordis.patch.yml') }; return undefined }, on() {} }
    const native = new NativePresetManager({ ctx: fake, store, logger: { info() {}, warn() {}, error() {}, debug() {} }, config: { backupDir, backupKeep: 20 } })
    const snapshots = await native.listSnapshots()
    assert.equal(snapshots.length, 2)
    const paired = snapshots.find((snapshot) => snapshot.files.length === 2)
    assert.deepEqual(paired.files.sort(), ['native-2026-11-15T10-00-00-001Z-g1.json', 'patch-2026-11-15T10-00-00-002Z-g2.yml'])
    assert.deepEqual(snapshots.find((snapshot) => snapshot.files.length === 1).files, ['patch-2026-11-15T10-00-00-000Z-g1.yml'])
    await native.setBackupKeep(1)
    assert.equal((await native.listSnapshots()).length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
