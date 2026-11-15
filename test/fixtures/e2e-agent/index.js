import { writeFileSync } from 'node:fs'

export const name = 'e2e-agent'
export const inject = ['agents', 'tools', 'systemPrompt', 'workspaceRegistry', 'sessions', 'sessionTitle', 'agentPresets']

async function waitFor(getter, timeoutMs = 8000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = getter()
    if (value !== undefined && value !== null) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return undefined
}

function outcome(result) {
  return {
    isError: result?.isError === true,
    text: (result?.content ?? []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n').slice(0, 500),
  }
}

export function apply(ctx, rawConfig) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  const cwd = typeof config.cwd === 'string' ? config.cwd : process.cwd()
  const resultFile = typeof config.resultFile === 'string' ? config.resultFile : '/tmp/e2e-agent-result.json'
  const nativePreset = typeof config.nativePreset === 'string' ? config.nativePreset : 'standard'

  Promise.resolve().then(async () => {
    const result = { startedAt: new Date().toISOString(), steps: [], ok: false, nativePreset }
    try {
      const api = await waitFor(() => ctx.get('nativePresets'))
      if (!api) throw new Error('nativePresets service did not become available')
      result.pm = true

      let workspace = await ctx.workspaceRegistry.resolveByPath(cwd)
      if (!workspace) workspace = await ctx.workspaceRegistry.create(cwd, 'E2E')
      result.workspaceId = String(workspace.id)

      const base = typeof config.sessionId === 'string' && config.sessionId.length > 0 ? config.sessionId : 'e2e'
      const sessionId = `${base}-${Date.now().toString(36)}`
      result.sessionId = sessionId
      const created = await ctx.agents.create({
        sessionId,
        meta: { cwd },
        setup: async (agentCtx) => {
          await ctx.get('agentPresets').mount(agentCtx, nativePreset)
        },
      })
      const agent = created.agent
      try {
        agent.session.append('user/message', {
          role: 'user',
          content: [{ type: 'text', text: 'E2E native preset session' }],
          source: { kind: 'user' },
        }, { surfaceOp: 'append' })
        ctx.sessionTitle.rename(agent.session, 'E2E Native')
      } catch (error) {
        result.titleError = error?.message ?? String(error)
      }
      result.steps.push('agent-created')
      try {
        await workspace.attachSession(sessionId)
        result.steps.push('workspace-attached')
      } catch (error) {
        result.workspaceAttachError = error?.message ?? String(error)
      }

      await new Promise((resolve) => setTimeout(resolve, 400))
      result.composedPreset = ctx.get('agentPresets').composedPreset(agent.ctx)
      await api.clearOverlay(nativePreset)
      api.refreshAll()
      await new Promise((resolve) => setTimeout(resolve, 300))
      result.visibleDefault = ctx.tools.definitions(agent).map((tool) => tool.name).sort()
      const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
      result.promptDefault = assembly.sections.map((section) => section.text).join('\n\n').slice(0, 1600)
      result.steps.push('attached')

      const probe = async () => {
        const batch = await ctx.tools.execute({
          calls: [{ type: 'tool-call', id: `probe-${Date.now()}`, name: 'preset_editor_probe', arguments: '{}' }],
          signal: new AbortController().signal,
          agent,
        })
        return outcome(batch.results[0].result)
      }
      result.probeDefault = await probe()
      result.steps.push('probe-default')

      await api.setOverlay(nativePreset, {
        enabled: true,
        tools: { mode: 'deny', allow: [], deny: ['preset_editor_probe', 'bash'] },
      })
      api.refreshAll()
      await new Promise((resolve) => setTimeout(resolve, 300))
      result.visibleFiltered = ctx.tools.definitions(agent).map((tool) => tool.name).sort()
      result.probeFiltered = await probe()
      result.steps.push('probe-filtered')

      await api.clearOverlay(nativePreset)
      api.refreshAll()
      await new Promise((resolve) => setTimeout(resolve, 300))
      result.visibleRestored = ctx.tools.definitions(agent).map((tool) => tool.name).sort()
      result.probeRestored = await probe()
      result.steps.push('probe-restored')
      result.ok = true
    } catch (error) {
      result.error = error?.stack ?? String(error)
    }
    try {
      writeFileSync(resultFile, JSON.stringify(result, null, 2))
    } catch (error) {
      console.error('e2e-agent: result write failed', error)
    }
    console.error('e2e-agent result', JSON.stringify({ ok: result.ok, sessionId: result.sessionId, error: result.error }).slice(0, 700))
  })
}
