import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadIfc, cleanName } from './ifc.js'

let model
beforeAll(async () => {
  model = await loadIfc(readFileSync('public/models/duplex.ifc'), 'Duplex')
}, 60000)

const count = (kind) => model.elements.filter((e) => e.kind === kind).length

describe('loadIfc on the bundled Duplex', () => {
  it('finds every element type with exact counts', () => {
    expect(count('wall')).toBe(57)
    expect(count('door')).toBe(14)
    expect(count('window')).toBe(24)
    expect(count('roof')).toBeGreaterThanOrEqual(1)
    expect(count('room')).toBe(21)
    expect(model.storeys.map((s) => s.name)).toEqual(expect.arrayContaining(['Level 1', 'Level 2']))
  })
  it('knows storeys, exterior walls, hosts and joints', () => {
    const walls = model.elements.filter((e) => e.kind === 'wall')
    expect(walls.filter((w) => w.external === true).length).toBeGreaterThan(5)
    expect(walls.filter((w) => w.storey).length).toBe(walls.length)
    const hosted = model.elements.filter((e) => (e.kind === 'door' || e.kind === 'window') && e.hostId)
    expect(hosted.length).toBeGreaterThan(30)
    expect(walls.some((w) => w.connects.length > 0)).toBe(true)
    expect(model.elements.find((e) => e.kind === 'room' && /kitchen|living|foyer/i.test(e.name))).toBeTruthy()
  })
  it('centers the building with its base on y = 0', () => {
    const ys = model.elements.filter((e) => e.size).map((e) => e.center[1] - e.size[1] / 2)
    expect(Math.min(...ys)).toBeCloseTo(0, 1)
    expect(model.byId.size).toBe(model.elements.length)
  })
})

describe('cleanName', () => {
  it('turns Revit names into readable ones', () => {
    expect(cleanName('M_Single-Flush:1250mm x 2010mm:1250mm x 2010mm:146596')).toBe('Single-Flush 1250mm x 2010mm')
    expect(cleanName('Basic Wall:Interior - Partition (92mm Stud):138584')).toBe('Interior - Partition (92mm Stud)')
  })
})
