/**
 * Native DeepSeek Harness Agent-preset integration.
 *
 * The shipped Web UI reads Agent presets through `ctx.agentPresets` and can
 * only author them through the Creator flow. This module provides the missing
 * editable surface without touching DSH core:
 *
 *   - read the live roster and each declaration's entry-list YAML;
 *   - edit an existing declaration or add a new one by maintaining a small
 *     managed block in the profile's `cordis.patch.yml`;
 *   - rely on DSH HMR's profile-patch watch to recompose the Loader live;
 *   - retain a per-native-preset tool filter overlay for finer control than
 *     the plugin-level composition offers.
 *
 * @module dsh-preset-editor/native
 */

import { mkdirSync, renameSync } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import yaml from 'js-yaml'

import { PresetError, PresetStore } from './store.js'
import {
  cloneJson,
  isPlainObject,
  messageOf,
  nowIso,
  readTextSync,
  writeJsonAtomic,
  writeTextAtomic,
} from './util.js'

/** `!!js` YAML type shared with DSH's include loader. */
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
  predicate: (data) => isPlainObject(data) && typeof data.__jsExpr === 'string',
  represent: (data) => data.__jsExpr,
})

/** DSH entry-list YAML schema (`JSON_SCHEMA` plus `!!js`). */
export const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)

// Keep the original marker text: existing profiles already contain it, and a
// rename must not orphan their managed block.
/** Legacy ids accepted when editing an already managed preset. */
const LEGACY_PRESET_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/i
/** New ids must also be selectable by DSH-IM 5.x (lowercase, digits, hyphen). */
const COMPAT_PRESET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

const BEGIN = '# >>> dsh-preset-manager managed presets — do not edit this block manually'
const END = '# <<< dsh-preset-manager managed presets'
const BLOCK_RE = /(?:^|\n)# >>> dsh-preset-manager managed presets[^\n]*\n[\s\S]*?^# <<< dsh-preset-manager managed presets[^\n]*(?:\n|$)/m

/** Parse an entry-list YAML string with the DSH dialect. */
export function parsePluginsYaml(text) {
  let value
  try {
    value = yaml.load(text ?? '', { schema: entryListSchema })
  } catch (error) {
    throw new PresetError('INVALID_COMPOSITION', `YAML 解析失败：${messageOf(error)}`, 400)
  }
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new PresetError('INVALID_COMPOSITION', 'preset 组合必须是插件条目数组', 400)
  return validatePlugins(value)
}

/** Validate a profile-patch YAML document (root array). */
export function validatePatchText(text) {
  let value
  try {
    value = yaml.load(text ?? '', { schema: entryListSchema })
  } catch (error) {
    throw new PresetError('INVALID_PATCH', `profile patch YAML 解析失败：${messageOf(error)}`, 400)
  }
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new PresetError('INVALID_PATCH', 'profile patch 必须是 YAML 数组', 400)
  return value
}

/** Basic structural validation for a preset entry list. */
export function validatePlugins(rows) {
  if (!Array.isArray(rows)) throw new PresetError('INVALID_COMPOSITION', 'preset 组合必须是插件条目数组', 400)
  for (const [index, row] of rows.entries()) {
    if (!isPlainObject(row)) throw new PresetError('INVALID_COMPOSITION', `第 ${index + 1} 个插件条目必须是对象`, 400)
    if (typeof row.name !== 'string' || row.name.trim().length === 0) {
      throw new PresetError('INVALID_COMPOSITION', `第 ${index + 1} 个插件条目缺少 name`, 400)
    }
    if (row.id !== undefined && (typeof row.id !== 'string' || row.id.length === 0)) {
      throw new PresetError('INVALID_COMPOSITION', `第 ${index + 1} 个插件条目的 id 无效`, 400)
    }
    if (row.group && !Array.isArray(row.config)) {
      throw new PresetError('INVALID_COMPOSITION', `第 ${index + 1} 个分组条目的 config 必须是子条目数组`, 400)
    }
    if (row.disabled !== undefined && typeof row.disabled !== 'boolean' && !(isPlainObject(row.disabled) && typeof row.disabled.__jsExpr === 'string')) {
      throw new PresetError('INVALID_COMPOSITION', `第 ${index + 1} 个插件条目的 disabled 必须是布尔值或 !!js 表达式`, 400)
    }
  }
  return rows
}

/** Dump rows in the DSH entry-list dialect. */
export function dumpPlugins(rows) {
  return yaml.dump(rows, { schema: entryListSchema, noRefs: true, lineWidth: -1, sortKeys: false })
}

/** Build one managed block from all definitions. */
export function buildManagedBlock(definitions) {
  const sorted = Object.values(definitions)
    .filter((definition) => definition && Array.isArray(definition.plugins))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || String(left.configId).localeCompare(String(right.configId)))
  const toRow = (definition) => ({
    id: definition.rowId,
    name: '@deepseek-ai/dsh-agent-preset',
    config: {
      id: definition.configId,
      ...(definition.name ? { name: definition.name } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      order: Number.isSafeInteger(definition.order) ? definition.order : 0,
      plugins: definition.plugins,
    },
  })
  const overrides = sorted.filter((definition) => definition.mode !== 'create').map(toRow)
  const creates = sorted.filter((definition) => definition.mode === 'create').map(toRow)
  const top = [...overrides]
  if (creates.length > 0) top.push({ insert: creates })
  if (top.length === 0) return ''
  return `${BEGIN}\n${dumpPlugins(top)}${END}\n`
}

/** Replace or append the managed block in a profile patch text. */
export function mergePatchText(existing, block) {
  const text = typeof existing === 'string' ? existing : ''
  if (BLOCK_RE.test(text)) {
    const replaced = text.replace(BLOCK_RE, (match) => {
      if (!block) return ''
      // Keep the newline that preceded the old block when replacing.
      return (match.startsWith('\n') ? '\n' : '') + block
    })
    return replaced.trim().length === 0 ? '[]\n' : replaced
  }
  if (!block) return text.trim().length === 0 ? '[]\n' : text
  if (text.trim().length === 0) return block
  // A comment-only header followed by the empty root array is still an empty
  // patch; replace the root token instead of appending a second YAML array.
  if (/^\s*(?:#[^\n]*\n\s*)*\[\]\s*$/.test(text)) return text.replace(/\[\]\s*$/, block)
  return `${text.replace(/\s*$/, '')}\n\n${block}`
}

/** Extract managed rows back out of a profile patch text (recovery). */
export function extractManagedDefinitions(text) {
  const match = BLOCK_RE.exec(typeof text === 'string' ? text : '')
  if (!match) return {}
  const inner = match[0]
    .split('\n')
    .filter((line) => !line.startsWith('# >>>') && !line.startsWith('# <<<'))
    .join('\n')
  if (inner.trim().length === 0) return {}
  let rows
  try {
    rows = yaml.load(inner, { schema: entryListSchema })
  } catch {
    return {}
  }
  if (!Array.isArray(rows)) return {}
  const flat = []
  for (const item of rows) {
    if (isPlainObject(item) && Array.isArray(item.insert)) {
      for (const row of item.insert) flat.push({ row, inserted: true })
    } else {
      flat.push({ row: item, inserted: false })
    }
  }
  const definitions = {}
  for (const { row, inserted } of flat) {
    if (!isPlainObject(row) || row.name !== '@deepseek-ai/dsh-agent-preset' || !isPlainObject(row.config)) continue
    const configId = typeof row.config.id === 'string' ? row.config.id : ''
    if (!configId) continue
    definitions[configId] = {
      configId,
      rowId: typeof row.id === 'string' && row.id.length > 0 ? row.id : `preset-${configId}`,
      mode: inserted ? 'create' : (String(row.id ?? '').startsWith('preset-') ? 'override' : 'create'),
      name: typeof row.config.name === 'string' ? row.config.name : '',
      description: typeof row.config.description === 'string' ? row.config.description : '',
      order: Number.isSafeInteger(row.config.order) ? row.config.order : 0,
      plugins: Array.isArray(row.config.plugins) ? row.config.plugins : [],
      updatedAt: nowIso(),
    }
  }
  return definitions
}

/** Save one pre-write backup and prune older files of the same kind. */
export async function backupText({ filePath, kind, generation = 0, dir, keep = 20, logger }) {
  if (!filePath) return undefined
  const text = readTextSync(filePath)
  if (!text || text.trim().length === 0) return undefined
  const targetDir = dir || join(dirname(filePath), 'backups')
  try {
    await mkdir(targetDir, { recursive: true, mode: 0o700 })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${kind}-${stamp}-g${generation}${kind === 'native' ? '.json' : '.yml'}`
    const target = join(targetDir, name)
    await writeTextAtomic(target, text)
    const files = (await readdir(targetDir)).filter((item) => item.startsWith(`${kind}-`))
    const rows = []
    for (const item of files) {
      try { rows.push({ item, mtimeMs: (await stat(join(targetDir, item))).mtimeMs }) } catch {}
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const row of rows.slice(Math.max(0, keep))) {
      try { await unlink(join(targetDir, row.item)) } catch {}
    }
    return target
  } catch (error) {
    logger?.warn?.(`preset-manager: 备份 ${kind} 失败：${messageOf(error)}`)
    return undefined
  }
}

/** Simple native state store (managed definitions + tool overlays). */
export class NativeStore extends PresetStore {
  /**
   * @param {object} options - file, limits, logger.
   */
  constructor(options) {
    super(options)
    this.backup = options.backup ?? { enabled: false, dir: '', keep: 20 }
    this.state = Object.freeze({ version: 1, generation: 0, definitions: {}, overlays: {}, updatedAt: 0 })
  }

  loadSync() {
    const result = readTextSync(this.file)
    const warnings = []
    if (!result) {
      this.loaded = true
      return { warnings }
    }
    let parsed
    try {
      parsed = JSON.parse(result)
    } catch (error) {
      const backup = `${this.file}.corrupt-${Date.now()}`
      try {
        mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
        renameSync(this.file, backup)
        warnings.push(`原生预设状态文件无法解析，已移动到 ${backup}`)
      } catch (moveError) {
        warnings.push(`原生预设状态文件无法解析且无法移动：${messageOf(moveError)}`)
      }
      this.loaded = true
      this.warnings = warnings
      return { warnings }
    }
    this.state = Object.freeze(this.#normalize(parsed, warnings))
    this.warnings = warnings
    this.loaded = true
    return { warnings }
  }

  #normalize(value, warnings) {
    const raw = isPlainObject(value) ? value : {}
    const definitions = {}
    if (isPlainObject(raw.definitions)) {
      for (const [id, definition] of Object.entries(raw.definitions)) {
        if (!isPlainObject(definition) || typeof definition.configId !== 'string' || !Array.isArray(definition.plugins)) {
          warnings.push(`忽略无效的原生预设定义 ${id}`)
          continue
        }
        try {
          validatePlugins(definition.plugins)
        } catch (error) {
          warnings.push(`忽略无效的原生预设定义 ${id}：${messageOf(error)}`)
          continue
        }
        definitions[id] = {
          configId: definition.configId,
          rowId: typeof definition.rowId === 'string' ? definition.rowId : `preset-${id}`,
          mode: definition.mode === 'create' ? 'create' : 'override',
          name: typeof definition.name === 'string' ? definition.name : '',
          description: typeof definition.description === 'string' ? definition.description : '',
          order: Number.isSafeInteger(definition.order) ? definition.order : 0,
          baseName: typeof definition.baseName === 'string' ? definition.baseName : undefined,
          baseDescription: typeof definition.baseDescription === 'string' ? definition.baseDescription : undefined,
          baseOrder: Number.isSafeInteger(definition.baseOrder) ? definition.baseOrder : undefined,
          plugins: definition.plugins,
          updatedAt: typeof definition.updatedAt === 'string' ? definition.updatedAt : nowIso(),
        }
      }
    }
    const overlays = {}
    if (isPlainObject(raw.overlays)) {
      for (const [id, overlay] of Object.entries(raw.overlays)) {
        if (!isPlainObject(overlay) || !isPlainObject(overlay.tools)) continue
        const mode = overlay.tools.mode === 'allow' || overlay.tools.mode === 'deny' ? overlay.tools.mode : 'all'
        overlays[id] = {
          tools: {
            mode,
            allow: Array.isArray(overlay.tools.allow) ? overlay.tools.allow.filter((item) => typeof item === 'string') : [],
            deny: Array.isArray(overlay.tools.deny) ? overlay.tools.deny.filter((item) => typeof item === 'string') : [],
          },
          enabled: overlay.enabled !== false,
          updatedAt: typeof overlay.updatedAt === 'string' ? overlay.updatedAt : nowIso(),
        }
      }
    }
    return {
      version: 1,
      generation: Number.isSafeInteger(raw.generation) ? raw.generation : 0,
      backupEnabled: raw.backupEnabled !== false,
      definitions,
      overlays,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    }
  }

  /** Restore a native backup snapshot atomically, advancing generation. */
  async restoreSnapshot(value) {
    const warnings = []
    const normalized = this.#normalize(value, warnings)
    normalized.generation = this.state.generation + 1
    normalized.updatedAt = Date.now()
    if (this.backup.enabled && this.state.backupEnabled !== false) {
      await backupText({ filePath: this.file, kind: 'native', generation: this.state.generation, dir: this.backup.dir, keep: this.backup.keep, logger: this.logger })
    }
    await writeJsonAtomic(this.file, normalized)
    this.state = Object.freeze(normalized)
    return { state: this.state, warnings }
  }

  /** Effective automatic-backup switch for this runtime. */
  backupEnabled() {
    return this.backup.enabled && this.state.backupEnabled !== false
  }

  /** Persist the user-facing automatic-backup policy. */
  async setBackupEnabled(enabled) {
    const { state } = await this.transact((draft) => { draft.backupEnabled = Boolean(enabled) })
    return state
  }

  getState() {
    return this.state
  }

  snapshot() {
    return cloneJson(this.state)
  }

  async transact(mutator, expectedGeneration = undefined) {
    const run = this.writeChain.then(async () => {
      if (expectedGeneration !== undefined && expectedGeneration !== this.state.generation) {
        // The native editor is a single-operator surface; a global generation
        // counter can move because of an unrelated overlay/backup write. Do not
        // reject a valid composition edit for a counter mismatch.
        this.logger?.warn?.(`preset-manager: generation hint ${expectedGeneration} != ${this.state.generation}; applying native write`)
      }
      const draft = cloneJson(this.state)
      const result = await mutator(draft)
      draft.version = 1
      draft.generation = this.state.generation + 1
      draft.updatedAt = Date.now()
      const normalized = this.#normalize(draft, [])
      if (this.backup.enabled && this.state.backupEnabled !== false) {
        await backupText({ filePath: this.file, kind: 'native', generation: this.state.generation, dir: this.backup.dir, keep: this.backup.keep, logger: this.logger })
      }
      await writeJsonAtomic(this.file, normalized)
      this.state = Object.freeze(normalized)
      return { result, state: this.state }
    })
    this.writeChain = run.catch(() => {})
    return run
  }
}

/** Native preset manager. */
export class NativePresetManager {
  constructor({ ctx, store, logger, config }) {
    this.ctx = ctx
    this.store = store
    this.logger = logger
    this.config = config
  }

  /** Load managed definitions from the profile patch when the state file is empty. */
  reconcileFromPatch(patchText) {
    const recovered = extractManagedDefinitions(patchText)
    const state = this.store.getState()
    if (Object.keys(state.definitions).length > 0 || Object.keys(recovered).length === 0) return state.definitions
    try {
      const next = { ...state, definitions: recovered }
      this.store.state = Object.freeze(next)
    } catch {
      // Best effort only.
    }
    return recovered
  }

  /** Repair managed new presets that were accidentally written as direct rows. */
  async repairOrphans() {
    const agentPresets = this.ctx.get?.('agentPresets')
    const loader = this.ctx.get?.('loader')
    if (!agentPresets || typeof agentPresets.list !== 'function' || !loader || typeof loader.entries !== 'function') return []
    const roster = await agentPresets.list()
    if (roster.length === 0) return []
    const ids = new Set(roster.map((row) => row.id))
    const state = this.store.getState()
    const broken = Object.entries(state.definitions).filter(([id, definition]) => {
      if (definition.mode === 'create' && ids.has(id)) return false
      return !this.findRowId(id)
    })
    if (broken.length === 0) return []
    const definitions = { ...state.definitions }
    for (const [id, definition] of broken) {
      definitions[id] = {
        ...definition,
        mode: 'create',
        rowId: `preset-${id}`,
        baseName: undefined,
        baseDescription: undefined,
        baseOrder: undefined,
      }
    }
    const { state: nextState } = await this.store.transact((draft) => { draft.definitions = definitions })
    const first = broken[0][1]
    try {
      const result = await this.#writeDefinitions(nextState.definitions, undefined, { id: first.configId, present: true, mode: 'create', name: first.name || first.configId })
      this.logger?.info?.(`preset-manager: 已修复 ${broken.length} 个缺失的托管 preset 声明（${result.application}）`)
    } catch (error) {
      this.logger?.warn?.(`preset-manager: 修复缺失 preset 声明失败：${messageOf(error)}`)
    }
    return broken.map(([id]) => id)
  }

  /** Read the profile patch path from launcher facts. */
  async patchPath() {
    const profileContext = this.ctx.get?.('profileContext')
    if (profileContext && typeof profileContext.patchPath === 'string' && profileContext.patchPath) {
      return profileContext.patchPath
    }
    const settings = this.ctx.get?.('settings')
    if (settings && typeof settings.prepareDocument === 'function') return settings.prepareDocument()
    throw new PresetError('NO_PROFILE', '当前部署没有可写的 profile patch，无法编辑原生 Agent 预设', 409)
  }

  /** Effective automatic-backup switch for this profile. */
  backupEnabled() {
    return this.config.backup !== false && this.store.getState().backupEnabled !== false
  }

  /** Persist the user-facing automatic-backup policy. */
  async setBackupEnabled(enabled) {
    return this.store.setBackupEnabled(enabled)
  }

  /** Directory for automatic backups. */
  backupDir() {
    const configured = this.config.backupDir
    if (!configured) return join(dirname(this.store.file), 'backups')
    return isAbsolute(configured) ? configured : resolve(dirname(this.store.file), configured)
  }

  /** List saved backups (newest first), for the UI/API. */
  async listBackups() {
    const dir = this.backupDir()
    let files = []
    try { files = await readdir(dir) } catch { return [] }
    const rows = []
    for (const name of files) {
      if (!/^(patch|native)-/.test(name)) continue
      try {
        const info = await stat(join(dir, name))
        rows.push({ name, kind: name.startsWith('patch-') ? 'patch' : 'native', bytes: info.size, mtimeMs: info.mtimeMs, at: new Date(info.mtimeMs).toISOString() })
      } catch {}
    }
    return rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
  }

  /** Restore one backup file, keeping patch and native state consistent. */
  async restoreBackup(name) {
    if (typeof name !== 'string' || !/^(patch|native)-[A-Za-z0-9._:-]+\.(yml|json)$/.test(name)) {
      throw new PresetError('INVALID_BACKUP', '备份文件名无效', 400)
    }
    const dir = this.backupDir()
    const file = resolve(dir, name)
    if (!file.startsWith(resolve(dir) + sep)) {
      throw new PresetError('INVALID_BACKUP', '备份路径越界', 400)
    }
    let text
    try { text = readTextSync(file) } catch (error) {
      throw new PresetError('BACKUP_NOT_FOUND', `备份不存在：${messageOf(error)}`, 404)
    }
    if (typeof text !== 'string') throw new PresetError('BACKUP_NOT_FOUND', '备份不存在', 404)
    if (name.startsWith('patch-')) {
      validatePatchText(text)
      const patchPath = await this.patchPath()
      const oldPatch = readTextSync(patchPath)
      if (this.backupEnabled()) {
        await backupText({ filePath: patchPath, kind: 'patch', generation: this.store.generation, dir, keep: this.config.backupKeep, logger: this.logger })
      }
      await writeTextAtomic(patchPath, text)
      // The restored patch is authoritative for managed definitions; overlays stay intact.
      const recovered = extractManagedDefinitions(text)
      const { state: nextState } = await this.store.transact((draft) => { draft.definitions = recovered })
      let application = 'restart-required'
      if (this.ctx.get?.('hmr')) {
        const target = Object.values(recovered)[0]
        if (!target) {
          await new Promise((resolve) => setTimeout(resolve, 300))
          application = 'applied'
        } else if (await this.#waitForRoster({ id: target.configId, present: true, name: target.name || target.configId }, 3000)) {
          application = 'applied'
        }
      }
      return { restored: name, kind: 'patch', application, generation: nextState.generation }
    }
    let parsed
    try { parsed = JSON.parse(text) } catch (error) {
      throw new PresetError('INVALID_BACKUP', `native 备份不是有效 JSON：${messageOf(error)}`, 400)
    }
    const restored = await this.store.restoreSnapshot(parsed)
    // Rebuild the managed block from the restored definitions so the profile patch agrees.
    const patchPath = await this.patchPath()
    const oldPatch = readTextSync(patchPath)
    const nextText = mergePatchText(oldPatch, buildManagedBlock(restored.state.definitions))
    if (nextText !== oldPatch) {
      if (this.backupEnabled()) {
        await backupText({ filePath: patchPath, kind: 'patch', generation: restored.state.generation, dir, keep: this.config.backupKeep, logger: this.logger })
      }
      await writeTextAtomic(patchPath, nextText)
    }
    let application = 'restart-required'
    if (this.ctx.get?.('hmr')) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      application = 'applied'
    }
    return { restored: name, kind: 'native', application, generation: restored.state.generation, warnings: restored.warnings }
  }

  /** Find the Loader declaration row carrying one preset id. */
  findRowId(configId) {
    try {
      const loader = this.ctx.get?.('loader')
      if (!loader || typeof loader.entries !== 'function') return undefined
      for (const entry of loader.entries()) {
        const options = entry?.options
        if (options?.name === '@deepseek-ai/dsh-agent-preset' && options?.config?.id === configId) {
          return typeof options.id === 'string' ? options.id : entry.id
        }
      }
    } catch {
      // Fall through.
    }
    return undefined
  }

  /** Read the native roster plus each composition. */
  async list() {
    const agentPresets = this.ctx.get?.('agentPresets')
    if (!agentPresets || typeof agentPresets.list !== 'function') {
      return { presets: [], defaultId: null, warnings: ['当前部署没有 agentPresets 服务'] }
    }
    const roster = await agentPresets.list()
    const defs = this.store.getState().definitions
    const overlays = this.store.getState().overlays
    const defaultId = typeof agentPresets.defaultId === 'string' ? agentPresets.defaultId : null
    const presets = []
    const rosterIds = new Set()
    for (const row of roster) {
      rosterIds.add(row.id)
      let plugins
      let pluginsYaml = ''
      let pluginError = ''
      try {
        const doc = await agentPresets.readDocument(row.id)
        pluginsYaml = doc.content ?? ''
        plugins = parsePluginsYaml(pluginsYaml)
      } catch (error) {
        plugins = undefined
        pluginsYaml = ''
        pluginError = messageOf(error)
      }
      const definition = defs[row.id]
      const rowId = definition?.rowId ?? this.findRowId(row.id)
      presets.push({
        id: row.id,
        name: row.name ?? row.id,
        description: row.description ?? '',
        order: Number.isSafeInteger(row.order) ? row.order : (definition?.order ?? 0),
        isDefault: defaultId === row.id,
        broken: row.broken ?? '',
        rowId: rowId ?? null,
        builtIn: Boolean(rowId && rowId.startsWith('preset-') && !definition),
        managed: Boolean(definition),
        mode: definition?.mode ?? (rowId && rowId.startsWith('preset-') ? 'builtin' : 'external'),
        plugins,
        pluginsYaml,
        pluginError,
        overlay: overlays[row.id] ?? null,
      })
    }
    // Managed declarations that no longer appear in the native roster are
    // still visible, so they can be repaired or removed instead of silently
    // blocking re-creation with "id already exists".
    for (const [id, definition] of Object.entries(defs)) {
      if (rosterIds.has(id)) continue
      let pluginsYaml = ''
      try { pluginsYaml = dumpPlugins(definition.plugins || []) } catch {}
      presets.push({
        id,
        name: definition.name || id,
        description: definition.description || '',
        order: Number.isSafeInteger(definition.order) ? definition.order : 0,
        isDefault: false,
        broken: '',
        rowId: definition.rowId ?? this.findRowId(id) ?? null,
        builtIn: false,
        managed: true,
        mode: definition.mode,
        missing: true,
        plugins: definition.plugins,
        pluginsYaml,
        pluginError: '',
        overlay: overlays[id] ?? null,
      })
    }
    return { presets, defaultId, warnings: [] }
  }

  /** Read one native preset. */
  async read(id) {
    const { presets } = await this.list()
    const preset = presets.find((item) => item.id === id)
    if (!preset) throw new PresetError('NATIVE_NOT_FOUND', `原生预设 ${id} 不存在`, 404)
    return preset
  }

  /** Poll the live native roster until it matches the expected outcome. */
  async #waitForRoster(expected, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const { presets } = await this.list()
        const target = presets.find((item) => item.id === expected.id)
        if (expected.present === true && target && !target.broken) {
          if (expected.name && target.name !== expected.name) continue
          return true
        }
        if (expected.present === false && !target) return true
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return false
  }

  /** Persist definitions to the profile patch and wait for HMR if available. */
  async #writeDefinitions(nextDefinitions, expectedGeneration, expected) {
    const patchPath = await this.patchPath()
    const oldText = readTextSync(patchPath)
    const block = buildManagedBlock(nextDefinitions)
    const nextText = mergePatchText(oldText, block)
    const hmr = this.ctx.get?.('hmr')
    if (nextText === oldText) return { application: hmr ? 'applied' : 'restart-required' }
    if (this.backupEnabled()) {
      await backupText({
        filePath: patchPath,
        kind: 'patch',
        generation: this.store.generation,
        dir: this.backupDir(),
        keep: this.config.backupKeep,
        logger: this.logger,
      })
    }
    await writeTextAtomic(patchPath, nextText)
    if (!hmr) return { application: 'restart-required' }
    if (expected && expected.id) {
      const ok = await this.#waitForRoster(expected)
      if (!ok) {
        // DSH may keep a live preset's revision until restart, or HMR may be
        // unavailable. Keep the saved patch/state and report the restart need
        // rather than silently discarding a valid edit.
        return { application: 'restart-required' }
      }
    } else {
      // No explicit target: give HMR a short window to settle.
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    return { application: 'applied' }
  }

  /** Save/create an override or a new native preset. */
  async save(input, expectedGeneration = undefined, options = {}) {
    if (!isPlainObject(input)) throw new PresetError('INVALID_COMPOSITION', '请求体必须是对象', 400)
    const configId = typeof input.id === 'string' ? input.id.trim() : ''
    if (!LEGACY_PRESET_ID.test(configId)) {
      throw new PresetError('INVALID_ID', '预设 id 必须由字母数字和 . _ : - 组成', 400)
    }
    const agentPresets = this.ctx.get?.('agentPresets')
    const roster = agentPresets && typeof agentPresets.list === 'function' ? await agentPresets.list() : []
    const existing = roster.find((item) => item.id === configId)
    const state = this.store.getState()
    const existingDef = state.definitions[configId]
    if (options.createOnly && (existing || existingDef)) {
      throw new PresetError('NATIVE_EXISTS', `原生预设 ${configId} 已存在`, 409)
    }
    if (!existingDef && Object.keys(state.definitions).length >= (this.config.maxPresets ?? 100)) {
      throw new PresetError('PRESET_LIMIT', `托管原生预设不能超过 ${this.config.maxPresets ?? 100} 个`, 409)
    }
    if (!existing && !existingDef && !COMPAT_PRESET_ID.test(configId)) {
      throw new PresetError('INVALID_ID', '新 preset id 只能使用小写字母、数字和 -，例如 diana', 400)
    }
    if (!existing && !existingDef) {
      // New id must not collide with an existing row id.
      const candidateRowId = this.findRowId(configId) ?? `preset-${configId}`
      try {
        const loader = this.ctx.get?.('loader')
        for (const entry of loader?.entries?.() ?? []) {
          if (entry.options?.id === candidateRowId) {
            throw new PresetError('INVALID_ID', `Loader 行 id ${rowId} 已存在`, 409)
          }
        }
      } catch (error) {
        if (error instanceof PresetError) throw error
      }
    }
    let plugins
    if (typeof input.pluginsYaml === 'string' && input.pluginsYaml.trim().length > 0) {
      plugins = parsePluginsYaml(input.pluginsYaml)
    } else if (Array.isArray(input.plugins)) {
      plugins = validatePlugins(input.plugins)
    } else {
      throw new PresetError('INVALID_COMPOSITION', '缺少 preset 组合（pluginsYaml 或 plugins）', 400)
    }
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : (existing?.name ?? existingDef?.name ?? '')
    const description = typeof input.description === 'string' ? input.description.slice(0, 500) : (existing?.description ?? existingDef?.description ?? '')
    const order = Number.isSafeInteger(input.order) ? input.order : (existingDef?.order ?? existing?.order ?? 0)
    const loaderRowId = this.findRowId(configId)
    // A new managed preset must remain an insert declaration even after HMR
    // has loaded it into the roster. Treating "present in roster" as an
    // override turns it into a direct row, which vanishes on the next DSH
    // restart and cannot be created later.
    const missingManaged = Boolean(existingDef && !loaderRowId && String(existingDef.rowId || '').startsWith('preset-'))
    const mode = existingDef?.mode === 'create' || (!existing && !loaderRowId) || missingManaged ? 'create' : 'override'
    const rowId = mode === 'create' ? `preset-${configId}` : (existingDef?.rowId ?? loaderRowId ?? `preset-${configId}`)
    const baseName = existingDef?.baseName ?? (existing ? (existing.name ?? configId) : undefined)
    const baseDescription = existingDef?.baseDescription ?? (existing ? (existing.description ?? '') : undefined)
    const baseOrder = existingDef?.baseOrder ?? (existing && Number.isSafeInteger(existing.order) ? existing.order : undefined)
    const definition = {
      configId,
      rowId,
      mode,
      name,
      description,
      order,
      baseName,
      baseDescription,
      baseOrder,
      plugins,
      updatedAt: nowIso(),
    }
    const { state: nextState } = await this.store.transact((draft) => {
      draft.definitions[configId] = definition
    }, expectedGeneration)
    try {
      const result = await this.#writeDefinitions(nextState.definitions, undefined, { id: configId, present: true, mode, name: definition.name || configId })
      let preset
      if (result.application === 'restart-required') {
        preset = { id: configId, name: definition.name, description: definition.description, order: definition.order, mode, plugins: definition.plugins, pluginsYaml: '', managed: true, builtIn: false, isDefault: false, broken: '', pluginError: '', overlay: null }
      } else {
        preset = await this.read(configId)
      }
      return { preset, application: result.application, generation: nextState.generation }
    } catch (error) {
      // Roll back the state definition when the profile patch cannot apply.
      await this.store.transact((draft) => {
        if (existingDef) draft.definitions[configId] = existingDef
        else delete draft.definitions[configId]
      }).catch(() => {})
      throw error
    }
  }

  /** Reset a built-in override, or delete a managed new preset. */
  async reset(id, expectedGeneration = undefined) {
    const state = this.store.getState()
    const existingDef = state.definitions[id]
    if (!existingDef) {
      // Nothing managed: a built-in is already at its shipped definition.
      return { application: 'applied', removed: false }
    }
    const originalName = existingDef.baseName ?? id
    const { state: nextState } = await this.store.transact((draft) => {
      delete draft.definitions[id]
    }, expectedGeneration)
    try {
      const result = await this.#writeDefinitions(nextState.definitions, undefined, {
        id,
        present: existingDef.mode === 'override',
        mode: existingDef.mode,
        name: existingDef.mode === 'override' ? originalName : undefined,
      })
      return { removed: true, application: result.application, generation: nextState.generation }
    } catch (error) {
      await this.store.transact((draft) => { draft.definitions[id] = existingDef }).catch(() => {})
      throw error
    }
  }

  /** Overlay records keyed by native preset id. */
  overlay(id) {
    return this.store.getState().overlays[id] ?? null
  }

  /** Update a native preset's tool filter overlay. */
  async setOverlay(id, input, expectedGeneration = undefined) {
    if (!/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(String(id))) {
      throw new PresetError('INVALID_ID', '预设 id 无效', 400)
    }
    const toolsInput = isPlainObject(input?.tools) ? input.tools : input
    const mode = toolsInput?.mode === 'allow' || toolsInput?.mode === 'deny' ? toolsInput.mode : 'all'
    const clean = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 160))].slice(0, 5000) : []
    const overlay = {
      tools: { mode, allow: clean(toolsInput?.allow), deny: clean(toolsInput?.deny) },
      enabled: input?.enabled !== false,
      updatedAt: nowIso(),
    }
    const { state } = await this.store.transact((draft) => {
      draft.overlays[id] = overlay
    }, expectedGeneration)
    return { overlay: cloneJson(overlay), generation: state.generation }
  }

  /** Remove a tool filter overlay. */
  async clearOverlay(id, expectedGeneration = undefined) {
    const { state } = await this.store.transact((draft) => {
      delete draft.overlays[id]
    }, expectedGeneration)
    return { generation: state.generation }
  }
}
