import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadIfc } from './ifc.js'
import { select, applyOps, undo, measure } from './ops.js'
import { describeModel } from './manifest.js'

let model
beforeAll(async () => {
  model = await loadIfc(readFileSync('public/models/duplex.ifc'), 'Duplex')
}, 60000)

describe('select', () => {
  it('finds elements by kind, storey words, exterior and host', () => {
    const windowsL1 = select(model, { kinds: ['windows'], storey: 'ground floor' })
    expect(windowsL1.length).toBeGreaterThan(0)
    expect(windowsL1.every((id) => model.elements.find((e) => e.id === id).storey === 'Level 1')).toBe(true)
    const ext = select(model, { kinds: ['wall'], external: true })
    expect(ext.length).toBe(model.elements.filter((e) => e.kind === 'wall' && e.external).length)
    const wall = model.elements.find((e) => e.kind === 'wall' && e.hosts.length)
    expect(select(model, { hostedBy: [wall.id] }).sort()).toEqual([...wall.hosts].sort())
    expect(select(model, {})).toEqual([]) // never everything by accident
  })
})

describe('applyOps', () => {
  it('answers questions from the data', () => {
    const { answers } = applyOps(model, [{ select: { kinds: ['door'] }, action: 'query', measure: 'count' }])
    expect(answers[0]).toMatch(/^14 doors/)
  })
  it('recolors, hides, scales and undoes exactly', () => {
    const roof = select(model, { kinds: ['roof'] })
    applyOps(model, [{ select: { kinds: ['roof'] }, action: 'hide' }])
    expect(roof.every((id) => model.byId.get(id).visible === false)).toBe(true)
    expect(undo(model)).toMatch(/Hid/)
    expect(roof.every((id) => model.byId.get(id).visible === true)).toBe(true)

    const walls = select(model, { kinds: ['wall'], external: true })
    const before = model.elements.find((e) => e.id === walls[0]).size[1]
    applyOps(model, [
      { select: { kinds: ['wall'], external: true }, action: 'material', material: 'brick' },
      { select: { ids: [walls[0]] }, action: 'scale', scaleBy: [1, 1.5, 1] },
    ])
    const mesh = model.byId.get(walls[0]).children[0]
    expect(`#${mesh.material.color.getHexString()}`).toBe('#9c4a35')
    expect(model.elements.find((e) => e.id === walls[0]).size[1]).toBeCloseTo(before * 1.5, 1)
    undo(model)
    expect(model.elements.find((e) => e.id === walls[0]).size[1]).toBeCloseTo(before, 1)
    expect(`#${model.byId.get(walls[0]).children[0].material.color.getHexString()}`).not.toBe('#9c4a35')
  })
  it('deletes and duplicates, and undo removes the copies', () => {
    const n = model.elements.length
    const door = select(model, { kinds: ['door'] })[0]
    applyOps(model, [{ select: { ids: [door] }, action: 'duplicate', offset: [2, 0, 0], count: 2 }])
    expect(model.elements.length).toBe(n + 2)
    undo(model)
    expect(model.elements.length).toBe(n)
    applyOps(model, [{ select: { ids: [door] }, action: 'delete' }])
    expect(select(model, { ids: [door] })).toEqual([])
    undo(model)
    expect(select(model, { ids: [door] })).toEqual([door])
  })
})

describe('describeModel', () => {
  it('lists storeys, counts and every element for the chatbot', () => {
    const text = describeModel(model)
    expect(text).toMatch(/STOREYS/)
    expect(text).toMatch(/door 14/)
    expect(text.split('\n').length).toBeGreaterThan(200)
  })
})

describe('measure', () => {
  it('reports totals', () => {
    expect(measure(model, select(model, { kinds: ['wall'], external: true }), 'length')).toMatch(/m in total length/)
  })
})

describe('augmentSelect', () => {
  it('adds facts the person said but the AI left out', async () => {
    const { augmentSelect } = await import('./remodel.js')
    expect(augmentSelect('make all the exterior walls brick', { kinds: ['wall'], storey: 'any' })).toEqual({ kinds: ['wall'], external: true })
    expect(augmentSelect('which walls have doors in them on level 2?', { kinds: ['wall'], storey: 'Level 2' })).toMatchObject({ hostsKind: 'door' })
    expect(augmentSelect('paint the interior walls white', { kinds: ['wall'] }).external).toBe(false)
    const doorWalls = select(model, { kinds: ['wall'], hostsKind: 'door' })
    expect(doorWalls.length).toBeGreaterThan(0)
    expect(doorWalls.every((id) => model.elements.find((e) => e.id === id).hosts.length > 0)).toBe(true)
  })
})

describe('storey wildcards', () => {
  it('treats "*" and "all floors" as any floor', async () => {
    const { augmentSelect } = await import('./remodel.js')
    const all = select(model, { kinds: ['wall'], external: true })
    expect(select(model, { kinds: ['wall'], external: true, storey: '*' })).toEqual(all)
    expect(augmentSelect('make the exterior walls brick', { kinds: ['wall'], storey: '*', external: true })).toEqual({ kinds: ['wall'], external: true })
  })
})
