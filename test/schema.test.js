import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeState, validatePresetInput, createPreset, isToolName, makePresetId } from '../lib/schema.js'

const LIMITS = { maxPresets: 3, maxPersonaChars: 100, maxSessionAssignments: 2 }

test('empty input normalizes to a valid empty document', () => {
  const { state, warnings, future } = normalizeState(undefined, LIMITS)
  assert.equal(state.version, 1)
  assert.equal(state.generation, 0)
  assert.deepEqual(state.presets, [])
  assert.equal(state.defaultPresetId, null)
  assert.deepEqual(state.workspaces, {})
  assert.deepEqual(state.sessions, {})
  assert.equal(future, false)
  assert.ok(warnings.length > 0)
})

test('invalid presets are dropped field by field', () => {
  const { state, warnings } = normalizeState({
    version: 1,
    presets: [
      { id: 'ok', name: 'OK', tools: { mode: 'allow', allow: ['read', 'bad tool', 'read'] } },
      { id: 'bad id!', name: 'Bad' },
      { id: 'noname' },
      { id: 'dupe', name: 'First' },
      { id: 'dupe', name: 'Second' },
      { id: 'too-long', name: 'X', persona: 'p'.repeat(200) },
    ],
  }, LIMITS)
  assert.deepEqual(state.presets.map((preset) => preset.id), ['ok', 'dupe', 'too-long'])
  assert.deepEqual(state.presets[0].tools.allow, ['read'])
  assert.equal(state.presets[1].name, 'First')
  assert.equal(state.presets[1].persona, '')
  assert.equal(state.presets[2].persona.length, 100)
  assert.ok(warnings.some((warning) => warning.includes('bad tool')))
  assert.ok(warnings.some((warning) => warning.includes('重复')))
})

test('future version is read best-effort and reported', () => {
  const { future, warnings } = normalizeState({ version: 99, presets: [], generation: 4 }, LIMITS)
  assert.equal(future, true)
  assert.ok(warnings.some((warning) => warning.includes('99')))
})

test('session assignment modes survive a round trip', () => {
  const { state } = normalizeState({
    sessions: {
      a: { presetId: 'p', mode: 'manual', origin: 'workspace', at: 3 },
      b: { presetId: null, mode: 'none', origin: 'no-preset', at: 2 },
      c: { presetId: null, mode: 'follow', origin: 'manual', at: 1 },
      d: 'p',
    },
  }, { ...LIMITS, maxSessionAssignments: 10, maxPresets: 10 })
  assert.equal(state.sessions.a.mode, 'manual')
  assert.equal(state.sessions.a.presetId, 'p')
  assert.equal(state.sessions.b.mode, 'none')
  assert.equal(state.sessions.c.mode, 'follow')
  assert.equal(state.sessions.d.mode, 'manual')
})

test('session cap keeps the most recently used assignments', () => {
  const { state, warnings } = normalizeState({
    sessions: {
      old: { presetId: 'p', mode: 'manual', at: 1 },
      mid: { presetId: 'p', mode: 'manual', at: 2 },
      new: { presetId: 'p', mode: 'manual', at: 3 },
    },
  }, LIMITS)
  assert.deepEqual(Object.keys(state.sessions).sort(), ['mid', 'new'])
  assert.ok(warnings.some((warning) => warning.includes('上限')))
})

test('tool names reject whitespace and control characters', () => {
  assert.equal(isToolName('read'), true)
  assert.equal(isToolName('mcp__siyuan__fs'), true)
  assert.equal(isToolName('bad tool'), false)
  assert.equal(isToolName(''), false)
  assert.equal(isToolName('line\nbreak'), false)
})

test('validatePresetInput accepts a complete preset', () => {
  const validated = validatePresetInput({
    name: '  Diana  ',
    description: ' persona ',
    persona: 'You are Diana.',
    tools: { mode: 'allow', allow: ['read', 'read'], deny: ['bash'] },
    enabled: false,
    order: 3,
  }, LIMITS)
  assert.equal(validated.ok, true)
  assert.equal(validated.preset.name, 'Diana')
  assert.equal(validated.preset.description, 'persona')
  assert.deepEqual(validated.preset.tools.allow, ['read'])
  assert.equal(validated.preset.enabled, false)
})

test('validatePresetInput reports every invalid field', () => {
  const validated = validatePresetInput({
    name: '',
    description: 3,
    persona: 'p'.repeat(101),
    tools: { mode: 'wat', allow: ['bad tool'] },
    enabled: 'yes',
    order: 1.5,
  }, LIMITS)
  assert.equal(validated.ok, false)
  const text = validated.errors.join('\n')
  assert.match(text, /名称不能为空/)
  assert.match(text, /描述必须是字符串/)
  assert.match(text, /人格提示词不能超过/)
  assert.match(text, /工具模式/)
  assert.match(text, /enabled/)
  assert.match(text, /order/)
})

test('empty allow mode is accepted and means deny all', () => {
  const validated = validatePresetInput({ name: 'No tools', tools: { mode: 'allow', allow: [] } }, LIMITS)
  assert.equal(validated.ok, true)
  assert.deepEqual(validated.preset.tools.allow, [])
})

test('preset ids are unique and stable', () => {
  const existing = new Set(['diana'])
  assert.equal(makePresetId('Diana', existing), 'diana-2')
  const preset = createPreset({ name: 'A B', description: '', persona: '', tools: { mode: 'all', allow: [], deny: [] }, enabled: true, order: 0 }, existing)
  assert.equal(preset.id, 'a-b')
  assert.equal(preset.name, 'A B')
})