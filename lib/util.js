/**
 * Small, dependency-free helpers shared by the host half.
 *
 * The plugin deliberately ships without npm dependencies: a third-party DSH
 * plugin is installed into a profile whose node_modules cannot resolve the
 * Harness's own packages, so host code uses Node builtins only.
 *
 * @module dsh-preset-editor/util
 */

import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

/** Coerce any thrown value to a printable message. */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

/** Whether a value is a non-array plain object. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Clamp one configured integer. */
export function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Trim one optional string and enforce a byte or character ceiling. */
export function boundedString(value, maxLength) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

/** Resolve the harness home without importing a DSH package. */
export function resolveDshHome(env = process.env, home = homedir()) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  if (configured.length > 0) return resolve(configured)
  return join(home, '.dsh')
}

/** Resolve the state file path from Loader config or the default location. */
export function resolveStateFile(config, env = process.env) {
  const configured = typeof config?.stateFile === 'string' ? config.stateFile.trim() : ''
  if (configured.length > 0) {
    const expanded = configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured
    return isAbsolute(expanded) ? expanded : resolve(expanded)
  }
  return join(resolveDshHome(env), 'preset-manager', 'state.json')
}

/** Generate a short random identifier. */
export function randomId(prefix = 'preset') {
  return `${prefix}-${randomBytes(5).toString('hex')}`
}

/** Convert a display name into a stable, filesystem-safe identifier stem. */
export function slugify(value) {
  const source = typeof value === 'string' ? value : ''
  const ascii = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii.slice(0, 40)
}

/** Read and parse a JSON file synchronously; a missing file reads as undefined. */
export function readJsonSync(file) {
  try {
    const text = readFileSync(file, 'utf8')
    return { ok: true, value: JSON.parse(text), text }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: true, value: undefined, text: '' }
    return { ok: false, error }
  }
}

/** Read a JSON file asynchronously. */
export async function readJson(file) {
  const text = await readFile(file, 'utf8')
  return JSON.parse(text)
}

/**
 * Write JSON atomically: a fresh temporary file in the destination directory,
 * a fsync of the file, then a rename over the destination. The directory is
 * created with mode 0700; the file is 0600 because it may contain personas.
 *
 * @param {string} file - absolute destination.
 * @param {unknown} value - JSON value.
 * @returns {Promise<void>} completion after rename.
 */
export async function writeJsonAtomic(file, value) {
  const directory = dirname(file)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`
  const body = `${JSON.stringify(value, null, 2)}\n`
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(body, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, file)
  } catch (error) {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // Preserve the original failure.
      }
    }
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/** Read a UTF-8 text file synchronously; a missing file reads as empty. */
export function readTextSync(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

/** Write a UTF-8 text file atomically with mode 0600. */
export async function writeTextAtomic(file, text) {
  const directory = dirname(file)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(text, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, file)
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch {}
    }
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/** Synchronous best-effort directory creation for the state file's parent. */
export function ensureStateDirectorySync(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
}

/** Async variant used by the first write. */
export async function ensureStateDirectory(file) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
}

/** Detach and deep-freeze a JSON value for safe in-process sharing. */
export function freezeJson(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item)
  } else {
    for (const item of Object.values(value)) freezeJson(item)
  }
  return Object.freeze(value)
}

/** Deep clone a JSON value. */
export function cloneJson(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

/** A stable, human-readable timestamp. */
export function nowIso() {
  return new Date().toISOString()
}

/** Match an opaque id supplied by a request path. */
export function isSafeId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)
}