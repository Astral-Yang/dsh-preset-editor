/**
 * dsh-preset-editor — host entry (native Agent-preset edition).
 *
 * The plugin integrates with DSH's own Agent-preset registry instead of
 * maintaining a parallel preset list:
 *   - native presets are listed and read through `agentPresets`;
 *   - editing/creating them writes a managed block in the profile's
 *     `cordis.patch.yml`, which DSH HMR recomposes live;
 *   - an optional per-native-preset tool filter overlay is applied to live
 *     Agents via the native `tools.guard` / `tools.restrict` APIs.
 *
 * @module dsh-preset-editor
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { normalizeConfig } from './config.js'
import { NativePresetManager, NativeStore } from './native.js'
import { installNativeRoutes } from './native-http.js'
import { NativeOverlayRuntime } from './native-runtime.js'
import { registerProbe } from './probe.js'
import { messageOf, resolveStateFile } from './util.js'

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** Package version. */
export const VERSION = String(PACKAGE.version ?? '0.0.0')

/** Stable Cordis plugin name. */
export const name = 'dsh-preset-editor'

/** Services required for the native preset surface. */
export const inject = ['tools', 'systemPrompt', 'agents', 'agentPresets']

/** Logger facade that tolerates a missing Cordis logger. */
function createLogger(ctx) {
  const source = ctx?.logger
  const call = (level, message) => {
    try {
      const method = source?.[level]
      if (typeof method === 'function') method.call(source, message)
    } catch {
      // Logging must never break activation or an Agent.
    }
  }
  return {
    info: (message) => call('info', message),
    warn: (message) => call('warn', message),
    error: (message) => call('error', message),
    debug: (message) => call('debug', message),
  }
}

/**
 * Apply the plugin.
 * @param {object} ctx - Host context.
 * @param {unknown} rawConfig - Loader configuration.
 */
export function apply(ctx, rawConfig) {
  const logger = createLogger(ctx)
  const { config, warnings } = normalizeConfig(rawConfig)
  const stateFile = resolveStateFile(config)
  const nativeFile = join(dirname(stateFile), 'native.json')
  const store = new NativeStore({ file: nativeFile, limits: config, logger, backup: { enabled: config.backup !== false, dir: config.backupDir || join(dirname(nativeFile), 'backups'), keep: config.backupKeep } })
  const load = store.loadSync()
  for (const warning of [...warnings, ...load.warnings]) logger.warn(`preset-manager: ${warning}`)

  ctx.inject(['tools', 'systemPrompt', 'agents', 'agentPresets'], (scope) => {
    const native = new NativePresetManager({ ctx: scope, store, logger, config })
    const runtime = new NativeOverlayRuntime({ scope, native, config, logger })

    // Recover definitions if the state file was lost but the profile patch
    // still contains this plugin's managed block.
    native.patchPath()
      .then(async (patchPath) => {
        const text = readFileSync(patchPath, 'utf8')
        native.reconcileFromPatch(text)
        try {
          const repaired = await native.repairOrphans()
          if (repaired.length > 0) logger.info(`preset-manager: 修复缺失声明：${repaired.join(', ')}`)
        } catch (error) {
          logger.warn(`preset-manager: 修复缺失声明失败：${messageOf(error)}`)
        }
      })
      .catch((error) => logger.warn(`preset-manager: 读取 profile patch 失败：${messageOf(error)}`))

    let disposeProbe
    if (config.diagnostics) {
      try {
        disposeProbe = registerProbe(scope, scope.get('tools'))
        scope.effect(() => disposeProbe, 'preset-manager: acceptance probe tool')
      } catch (error) {
        logger.warn(`preset-manager: 注册诊断工具失败：${messageOf(error)}`)
      }
    }

    scope.on('agent/created', async (payload) => {
      try {
        await runtime.attach(payload?.agent)
      } catch (error) {
        logger.warn(`preset-manager: 附加新会话失败：${messageOf(error)}`)
      }
    })
    scope.on('agent/disposed', (payload) => {
      try { runtime.detach(payload?.agent) } catch (error) { logger.warn(`preset-manager: 清理会话失败：${messageOf(error)}`) }
    })
    scope.on('tools/change', () => runtime.scheduleRefresh())
    scope.on('agent-preset/selected', (sessionId) => {
      try { runtime.refreshSession(String(sessionId)) } catch (error) { logger.warn(`preset-manager: 预设切换后刷新失败：${messageOf(error)}`) }
    })
    scope.effect(() => () => runtime.dispose(), 'preset-manager: detach every live Agent')

    const ready = runtime.attachExisting().catch((error) => {
      logger.warn(`preset-manager: 启动时附加现有会话失败：${messageOf(error)}`)
    })

    const api = {
      version: VERSION,
      config,
      store,
      native,
      runtime,
      ready,
      list: () => native.list(),
      read: (id) => native.read(id),
      save: (input, generation) => native.save(input, generation),
      reset: (id, generation) => native.reset(id, generation),
      overlay: (id) => native.overlay(id),
      setOverlay: (id, input, generation) => native.setOverlay(id, input, generation),
      clearOverlay: (id, generation) => native.clearOverlay(id, generation),
      refreshAll: () => runtime.refreshAll(),
    }
    try {
      scope.provide('nativePresets', api)
    } catch (error) {
      logger.warn(`preset-manager: 暴露 nativePresets 服务失败：${messageOf(error)}`)
    }

    scope.inject(['connection'], (connectionScope) => {
      connectionScope.effect(
        () => installNativeRoutes(connectionScope, { native, runtime, config, logger }),
        'preset-manager: authenticated native preset routes',
      )
    })

    logger.info(`preset-manager: v${VERSION} 已激活（原生预设状态 ${nativeFile}）`)
  })
}
