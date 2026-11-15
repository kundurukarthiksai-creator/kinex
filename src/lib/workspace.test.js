import { describe, it, expect } from 'vitest'
import { normalizeSavedObjects, serializeObjects } from './workspace.js'

const object = (id = 'one') => ({ id, name: 'Satellite', position: [0, 1, 0], scale: 1, physics: 'float', behavior: { kind: 'orbit', speed: 1, targetId: null }, source: { text: 'a satellite', photo: 'private-camera-frame' }, parts: [{ shape: 'box', size: [1, 0.4, 0.7], position: [0, 0.2, 0], rotation: [Math.PI / 2, 0, 0], color: '#72d9c2', material: 'plastic', born: 9000 }], born: 8000 })

describe('saved studio worlds', () => {
  it('preserves part rotations without converting stored radians twice', () => {
    const snapshot = serializeObjects([object()], new Map())
    const { objects } = normalizeSavedObjects(snapshot)
    expect(objects[0].parts[0].rotation[0]).toBeCloseTo(Math.PI / 2)
    expect(objects[0].parts[0].size).toEqual([1, 0.4, 0.7])
  })
  it('captures live hand-moved positions and omits camera photos and animation timestamps', () => {
    const live = new Map([['one', { translation: () => ({ x: 2, y: 3.02, z: -1 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) }]])
    const saved = serializeObjects([object()], live)[0]
    expect(saved.position).toEqual([2, 3, -1])
    expect(saved.quaternion).toEqual([0, 0, 0, 1])
    expect(saved.source.photo).toBeUndefined()
    expect(saved.parts[0].born).toBeUndefined()
    expect(saved.born).toBe(0)
  })
  it('remaps orbital references when restored objects receive fresh ids', () => {
    const center = object('sun')
    const planet = object('planet')
    planet.behavior.targetId = 'sun'
    const { objects } = normalizeSavedObjects([center, planet])
    expect(objects[1].behavior.targetId).toBe(objects[0].id)
    expect(objects[0].id).not.toBe('sun')
  })
  it('rejects broken saves and clamps unsafe transforms before rendering them', () => {
    expect(() => normalizeSavedObjects([{ parts: [] }])).toThrow()
    const item = object()
    item.scale = Infinity
    item.position = [999, -999, Number.NaN]
    const saved = normalizeSavedObjects([item]).objects[0]
    expect(saved.scale).toBe(1)
    expect(saved.position).toEqual([10, 0, 0])
  })
})
