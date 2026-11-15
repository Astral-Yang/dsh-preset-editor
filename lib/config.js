/**
 * Loader configuration normalization.
 *
 * Every field has a safe default so a minimal `- name: dsh-preset-editor`
 * row works. Configuration is deployment-owned and is never rewritten by the
 * management API; presets are state-file data.
 *
 * @module dsh-preset-editor/config
 */

import { clampInt, isPlainObject } from './util.js'

/** Default config accepted by the host half. */
export function normalizeConfig(raw) {
  const input = isPlainObject(raw) ? raw : {}
  const warnings = []
  const config = {
    stateFile: typeof input.stateFile === 'string' ? input.stateFile.trim() : '',
    diagnostics: input.diagnostics === true,
    refreshDebounceMs: clampInt(input.refreshDebounceMs, 250, 50, 5000),
    maxPresets: clampInt(input.maxPresets, 100, 1, 1000),
    maxPersonaChars: clampInt(input.maxPersonaChars, 20000, 200, 200000),
    maxSessionAssignments: clampInt(input.maxSessionAssignments, 5000, 50, 100000),
    backup: input.backup !== false,
    backupDir: typeof input.backupDir === 'string' ? input.backupDir.trim() : '',
    backupKeep: clampInt(input.backupKeep, 20, 1, 500),
  }
  if (input.diagnostics !== undefined && typeof input.diagnostics !== 'boolean') {
    warnings.push('diagnostics 必须是布尔值，已回退为 false')
  }
  for (const [key, value] of Object.entries(input)) {
    if (!(key in config)) warnings.push(`忽略未知配置字段 ${key}`)
  }
  return { config, warnings }
}