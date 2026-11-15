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
      environment: { gravity: 'zero' },
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

describe('AI response root validation',()=>{
  it('rejects valid JSON values that cannot describe a scene',()=>{
    for(const text of ['null','[]','true','5','"hello"'])expect(()=>extractJson(text)).toThrow()
  })
})
