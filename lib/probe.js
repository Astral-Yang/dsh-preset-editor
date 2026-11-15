/**
 * Optional acceptance diagnostics.
 *
 * When `diagnostics: true`, the plugin registers one harmless global tool and
 * exposes an authenticated route that runs **that exact tool** through
 * `ctx.tools.execute()` for a live Agent. The call goes through the same
 * pipeline (scoped lookup → restrictions → pre-execute → guards → body) as a
 * model call, so the result is evidence about visibility and enforcement, not
 * a prompt-level claim. The route accepts no tool name and no arguments.
 *
 * @module dsh-preset-editor/probe
 */

/** Fixed diagnostic tool name. */
export const PROBE_TOOL = 'preset_editor_probe'

/** One plain ToolDefinition for the tool registry. */
export const PROBE_DEFINITION = Object.freeze({
  name: PROBE_TOOL,
  description: 'Diagnostic probe used by the dsh-preset-editor acceptance test. Returns a fixed string. Safe to disable.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  },
  isConcurrencySafe: () => true,
  async execute() {
    return 'preset-editor-probe-ok'
  },
})

/** Register the probe in the global tool layer. */
export function registerProbe(ctx, tools) {
  if (!tools || typeof tools.register !== 'function') return () => {}
  return tools.register(PROBE_DEFINITION)
}

/** Render result content blocks to a compact text for the report. */
function contentText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : []
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .slice(0, 2000)
}

/**
 * Execute the fixed probe for one live Agent.
 * @param {object} ctx - Host context with `tools`.
 * @param {object} agent - live Agent.
 * @returns {Promise<object>} structured, sanitized outcome.
 */
export async function runProbe(ctx, agent) {
  const tools = ctx.get?.('tools')
  if (!tools) return { ok: false, visible: false, error: 'tools service unavailable' }
  let visible = false
  try {
    visible = tools.get(PROBE_TOOL, agent) !== undefined
  } catch {
    visible = false
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const batch = await tools.execute({
      calls: [{
        type: 'tool-call',
        id: `preset-editor-probe-${Date.now()}`,
        name: PROBE_TOOL,
        arguments: '{}',
      }],
      signal: controller.signal,
      agent,
    })
    const result = batch?.results?.[0]?.result
    return {
      ok: result?.isError !== true,
      visible,
      isError: result?.isError === true,
      content: contentText(result),
    }
  } catch (error) {
    return {
      ok: false,
      visible,
      isError: true,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}