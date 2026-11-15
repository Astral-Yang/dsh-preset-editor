import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Package directory of the installed Harness (override with DSH_PACKAGES). */
export const DSH_PACKAGES = process.env.DSH_PACKAGES
  || '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

export const harnessAvailable = existsSync(join(DSH_PACKAGES, 'dsh-tools', 'lib', 'index.js'))

async function load(name, entry = 'lib/index.js') {
  return import(pathToFileURL(join(DSH_PACKAGES, name, entry)).href)
}

/** Load the real Harness modules used by the runtime integration test. */
export async function loadHarness() {
  const cordis = await load('cordis')
  const tools = await load('dsh-tools')
  const prompt = await load('dsh-system-prompt')
  const scope = await load('dsh-scope')
  const executor = await load('dsh-tool-executor-native')
  return {
    Context: cordis.Context,
    ToolsService: tools.default,
    defineTool: tools.defineTool,
    SystemPrompt: prompt.default,
    renderPrompt: prompt.renderPrompt,
    createScope: scope.createScope,
    nativeExecutor: executor,
  }
}