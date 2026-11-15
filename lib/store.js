/**
 * Crash-tolerant, serialized persistence for the preset document.
 *
 * One plugin instance owns one state file. Mutations run on a single promise
 * chain and commit by atomic rename, so a failed write leaves the previous
 * file and the previous in-memory snapshot intact. A malformed file is moved
 * aside instead of being overwritten; a file from a newer format is copied
 * aside before best-effort reading.
 *
 * @module dsh-preset-editor/store
 */

import { copyFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'

import { cloneJson, freezeJson, messageOf, readJsonSync, writeJsonAtomic } from './util.js'
import { emptyState, normalizeState } from './schema.js'

/** A domain failure with a stable machine code and HTTP-ish status. */
export class PresetError extends Error {
  /**
   * @param {string} code - stable code for the wire.
   * @param {string} message - human-readable reason.
   * @param {number} [status] - HTTP status.
   * @param {Record<string, unknown>} [details] - extra structured facts.
   */
  constructor(code, message, status = 400, details = undefined) {
    super(message)
    this.name = 'PresetError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** Serialized state store. */
export class PresetStore {
  /**
   * @param {object} options - store options.
   * @param {string} options.file - absolute state file.
   * @param {{ maxPresets: number, maxPersonaChars: number, maxSessionAssignments: number }} options.limits - deployment caps.
   * @param {{ info: Function, warn: Function, error: Function, debug: Function }} options.logger - logger.
   */
  constructor({ file, limits, logger }) {
    this.file = file
    this.limits = limits
    this.logger = logger
    this.state = freezeJson(emptyState())
    this.warnings = []
    this.loaded = false
    this.writeChain = Promise.resolve()
  }

  /** Read the file synchronously during activation. */
  loadSync() {
    const warnings = []
    const result = readJsonSync(this.file)
    if (!result.ok) {
      if (result.error && result.error.code === 'ENOENT') {
        this.loaded = true
        return { warnings }
      }
      const backup = `${this.file}.corrupt-${Date.now()}`
      try {
        mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
        renameSync(this.file, backup)
        warnings.push(`状态文件无法解析，已移动到 ${backup}`)
      } catch (error) {
        warnings.push(`状态文件无法解析且无法移动：${messageOf(error)}`)
      }
      this.warnings = warnings
      this.loaded = true
      return { warnings }
    }

    if (result.value !== undefined) {
      const normalized = normalizeState(result.value, this.limits)
      warnings.push(...normalized.warnings)
      if (normalized.future) {
        const backup = `${this.file}.backup-v${Number(result.value?.version) || 'unknown'}-${Date.now()}`
        try {
          copyFileSync(this.file, backup)
          warnings.push(`已备份更新版本的状态文件到 ${backup}`)
        } catch (error) {
          warnings.push(`无法备份更新版本的状态文件：${messageOf(error)}`)
        }
      }
      this.state = freezeJson(normalized.state)
    }
    this.warnings = warnings
    this.loaded = true
    return { warnings }
  }

  /** Current immutable snapshot. */
  getState() {
    return this.state
  }

  /** Detached copy for a caller that may serialize or mutate it. */
  snapshot() {
    return cloneJson(this.state)
  }

  /** Current generation used for optimistic writes. */
  get generation() {
    return this.state.generation
  }

  /**
   * Apply one mutation transactionally.
   *
   * @param {(draft: object) => unknown | Promise<unknown>} mutator - mutation over a detached draft.
   * @param {number} [expectedGeneration] - caller's last observed generation.
   * @returns {Promise<{ result: unknown, state: object }>} committed result and snapshot.
   */
  async transact(mutator, expectedGeneration = undefined) {
    const run = this.writeChain.then(async () => {
      if (expectedGeneration !== undefined && expectedGeneration !== this.state.generation) {
        throw new PresetError(
          'STALE',
          '配置已被其他窗口修改，请刷新后重试',
          409,
          { expected: expectedGeneration, actual: this.state.generation },
        )
      }
      const draft = cloneJson(this.state)
      const result = await mutator(draft)
      draft.version = 1
      draft.generation = this.state.generation + 1
      draft.updatedAt = Date.now()
      const normalized = normalizeState(draft, this.limits)
      if (normalized.warnings.length > 0) {
        for (const warning of normalized.warnings) this.logger.warn(`preset-editor: ${warning}`)
      }
      await writeJsonAtomic(this.file, normalized.state)
      this.state = freezeJson(normalized.state)
      this.warnings = normalized.warnings
      return { result, state: this.state }
    })
    this.writeChain = run.catch(() => {})
    return run
  }
}