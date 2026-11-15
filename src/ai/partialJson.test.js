import { describe, it, expect } from 'vitest'
import { parsePartial } from './partialJson.js'

const full =
  '{"narration":"A tower.","spawn":[{"at":[0,0,0],"name":"tower","parts":[' +
  '{"shape":"cylinder","size":[1,2,1],"position":[0,1,0],"color":"#C9C3B8","material":"matte"},' +
  '{"shape":"cone","size":[1.2,1,1.2],"position":[0,2.5,0],"color":"#5B6CF0","material":"plastic"}]}]}'

describe('parsePartial', () => {
  it('parses complete JSON', () => {
    expect(parsePartial(full).spawn[0].parts).toHaveLength(2)
  })
  it('returns only finished parts while streaming', () => {
    const cut = full.indexOf('{"shape":"cone"') + 30 // midway through the second part
    const p = parsePartial(full.slice(0, cut))
    expect(p.spawn[0].name).toBe('tower')
    expect(p.spawn[0].parts[0].material).toBe('matte')
    expect(p.spawn[0].parts[1]?.material).toBeUndefined()
  })
  it('is not fooled by brackets inside strings', () => {
    expect(parsePartial('{"narration":"a [weird} name","spawn":[{"name":"x","position":[1,2,3]')).toEqual({
      narration: 'a [weird} name',
      spawn: [{ name: 'x', position: [1, 2, 3] }],
    })
  })
  it('waits while the model is still reasoning', () => {
    expect(parsePartial('<think>let me plan {"a":[1]}')).toBeNull()
    expect(parsePartial('<think>plan</think>{"narration":"hi"}')).toEqual({ narration: 'hi' })
  })
  it('returns null before anything is closed', () => {
    expect(parsePartial('{"narration":"hel')).toBeNull()
  })
})

describe('parsePartial with one-line parts', () => {
  it('returns each finished string as soon as it closes', () => {
    const t = '{"name":"tower","parts":["cylinder 1 2 1 0 1 0 0 0 0 #C9C3B8 matte","cone 1.2 1 1.2 0 2.5 0 0 0 0 #5B6C'
    expect(parsePartial(t)).toEqual({ name: 'tower', parts: ['cylinder 1 2 1 0 1 0 0 0 0 #C9C3B8 matte'] })
  })
})
