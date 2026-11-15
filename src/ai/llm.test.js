import { describe, it, expect } from 'vitest'
import { extractJson } from './llm.js'
import { toActions } from './schema.js'

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"narration":"hi"}')).toEqual({ narration: 'hi' })
  })
  it('strips reasoning tags and code fences', () => {
    expect(extractJson('<think>hmm, a cube</think>\n```json\n{"narration":"cube"}\n```')).toEqual({ narration: 'cube' })
  })
  it('finds the object inside chatter', () => {
    expect(extractJson('Sure! Here you go: {"narration":"ok","clear":true} Enjoy.')).toEqual({ narration: 'ok', clear: true })
  })
  it('throws on no JSON', () => {
    expect(() => extractJson('no idea')).toThrow()
  })
})

describe('toActions', () => {
  it('orders clear, remove, modify, spawn, environment', () => {
    const a = toActions({
      narration: 'x',
      spawn: [{ at: [1, 0, 2], name: 'tree', parts: [] }],
      modify: [{ targetId: 'a', scale: 2 }],
      remove: ['b'],
      clear: true,
      environment: { preset: 'night' },
    })
    expect(a.map((x) => x.type)).toEqual(['clear', 'delete', 'modify', 'spawn', 'environment'])
  })
  it('passes the offline builder shape through', () => {
    expect(toActions({ actions: [{ type: 'clear' }] })).toEqual([{ type: 'clear' }])
  })
})

describe('spawn location', () => {
  it('maps "at" to position', () => {
    expect(toActions({ spawn: [{ at: [1, 0, 2], name: 'x', parts: [] }] })[0].position).toEqual([1, 0, 2])
  })
})

describe('one-line parts', () => {
  it('parses a part line and round-trips it', async () => {
    const { parsePartLine, toPartLine, parseIndexedLine } = await import('./partLine.js')
    const p = parsePartLine('cylinder 0.8 2.2 0.8 -1.4 1.1 0 0 90 0 #8C867C metal')
    expect(p).toEqual({ shape: 'cylinder', size: [0.8, 2.2, 0.8], position: [-1.4, 1.1, 0], rotation: [0, 90, 0], color: '#8C867C', material: 'metal' })
    expect(toPartLine({ ...p, rotation: [0, Math.PI / 2, 0] })).toBe('cylinder 0.8 2.2 0.8 -1.4 1.1 0 0 90 0 #8C867C metal')
    expect(parseIndexedLine('3: cone 1 .8 1 0 2 0 0 0 0 blue plastic')).toMatchObject({ index: 3, shape: 'cone', color: 'blue' })
    expect(parsePartLine('cylinder 0.8 2.2')).toBeNull()
  })
  it('streams and sanitizes line parts like object parts', async () => {
    const { sanitizePart } = await import('./apply.js')
    const s = sanitizePart('box 1 1 1 0 0.5 0 0 45 0 red matte')
    expect(s.color).toBe('#ff0000')
    expect(s.rotation[1]).toBeCloseTo(Math.PI / 4)
  })
})
