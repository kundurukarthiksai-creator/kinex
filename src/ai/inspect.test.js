import { describe, it, expect, beforeEach } from 'vitest'
import { useKinex } from '../store.js'
import { streamDetail, MAX_DETAILED_PARTS, buildObject } from './apply.js'
import { inspectIntent } from './commands.js'
import { inspectPose } from '../scene/interaction.js'

const part = (y) => ({ shape: 'box', size: [0.1, 0.1, 0.1], position: [0, y, 0], color: '#FFFFFF', material: 'metal' })

function seed(n = 3) {
  const obj = buildObject({ name: 'tower', position: [0, 0, 0], parts: [part(0)] }, [])
  obj.parts = Array.from({ length: n }, (_, i) => ({ ...obj.parts[0], position: [0, i, 0] })) // already-detailed objects exceed the spawn cap
  useKinex.setState({ objects: [obj], inspectId: obj.id, lastId: obj.id })
  return obj
}

beforeEach(() => {
  inspectPose.targetQ.identity()
  useKinex.setState({ objects: [], inspectId: null, inspect: { explode: 0, wireframe: false, spin: false, focusPart: null, refining: false } })
})

describe('streamDetail', () => {
  it('appends only finished parts, once each', () => {
    const obj = seed()
    const live = { n: 0 }
    // second part is still streaming: no size yet
    streamDetail({ spawn: [{ parts: [part(5), { shape: 'cone', color: '#000000', material: 'matte', position: [0, 1, 0] }] }] }, obj.id, live)
    expect(useKinex.getState().objects[0].parts).toHaveLength(4)
    streamDetail({ spawn: [{ parts: [part(5), { ...part(6), shape: 'cone' }] }] }, obj.id, live)
    const parts = useKinex.getState().objects[0].parts
    expect(parts).toHaveLength(5)
    expect(parts[4].shape).toBe('cone')
    expect(parts[4].born).toBeGreaterThan(0)
  })
  it('stops at the detail cap', () => {
    const obj = seed(MAX_DETAILED_PARTS - 2)
    streamDetail({ spawn: [{ parts: Array.from({ length: 10 }, (_, i) => part(i)) }] }, obj.id, { n: 0 })
    expect(useKinex.getState().objects[0].parts).toHaveLength(MAX_DETAILED_PARTS)
  })
})

describe('inspectIntent', () => {
  it('turns the model on the named axis', () => {
    seed()
    expect(inspectIntent('rotate 90 degrees on the x axis')).toBe('Turned it 90° on X.')
    const q = inspectPose.targetQ
    expect(Math.abs(q.x)).toBeCloseTo(Math.SQRT1_2, 3)
  })
  it('explodes, assembles and toggles wireframe', () => {
    seed()
    inspectIntent('explode it')
    expect(useKinex.getState().inspect.explode).toBe(1)
    inspectIntent('put it back together')
    expect(useKinex.getState().inspect.explode).toBe(0)
    inspectIntent('wireframe on')
    expect(useKinex.getState().inspect.wireframe).toBe(true)
  })
  it('leaves normal requests to the AI', () => {
    seed()
    expect(inspectIntent('make the flag blue')).toBe(false)
    useKinex.setState({ inspectId: null })
    expect(inspectIntent('rotate 90 on x')).toBe(false)
  })
})

describe('editParts', () => {
  const base = [0, 1, 2].map((y) => ({ shape: 'box', size: [1, 1, 1], position: [0, y, 0], rotation: [0, 0, 0], color: '#FFFFFF', material: 'matte' }))
  it('edits, adds and removes by index without disturbing the rest', async () => {
    const { editParts } = await import('./apply.js')
    const out = editParts(base, {
      editParts: [{ index: 1, color: '#2F5BFF', size: [2, 1, 1] }],
      addParts: [{ shape: 'cone', size: [1, 1, 1], position: [0, 3.5, 0], color: '#E5484D', material: 'plastic' }],
      removeParts: [0],
    })
    expect(out).toHaveLength(3)
    expect(out[0].color).toBe('#2F5BFF')
    expect(out[0].size).toEqual([2, 1, 1])
    expect(out[2].shape).toBe('cone')
    expect(base[1].color).toBe('#FFFFFF') // original untouched
  })
  it('skips parts that already streamed in and ignores bad indices', async () => {
    const { editParts } = await import('./apply.js')
    const streamed = [...base, { ...base[0], shape: 'cone' }]
    const out = editParts(streamed, { addParts: [{ shape: 'cone', size: [1, 1, 1], position: [0, 4, 0], color: '#000000', material: 'matte' }], removeParts: [9], editParts: [{ index: 3, color: '#123456' }] }, 1)
    expect(out).toHaveLength(4)
    expect(out[3].color).toBe('#FFFFFF')
  })
})

describe('editParts growth', () => {
  it('keeps the base when a part grows without a new position', async () => {
    const { editParts } = await import('./apply.js')
    const tower = [{ shape: 'cylinder', size: [1, 2, 1], position: [0, 1, 0], rotation: [0, 0, 0], color: '#FFFFFF', material: 'matte' }]
    const out = editParts(tower, { editParts: [{ index: 0, size: [1, 4, 1] }] })
    expect(out[0].position[1]).toBeCloseTo(2)
  })
})

describe('colors from the model', () => {
  it('accepts names, 8-digit hex and rgb()', async () => {
    const { sanitizePart } = await import('./apply.js')
    const c = (v) => sanitizePart({ shape: 'box', size: [1, 1, 1], position: [0, 0.5, 0], color: v, material: 'matte' }).color.toLowerCase()
    expect(c('blue')).toBe('#0000ff')
    expect(c('#2F5C9EFF')).toBe('#2f5c9e')
    expect(c('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(c('not a color')).toBe('#8890a6')
  })
})

describe('isNewThing', () => {
  it('tells new models from edits to the focus model', async () => {
    const { isNewThing } = await import('./commands.js')
    expect(isNewThing('a castle with a red flag', 'vintage camera')).toBe(true)
    expect(isNewThing('build me a robot with glowing eyes', 'castle')).toBe(true)
    expect(isNewThing('make it taller', 'castle')).toBe(false)
    expect(isNewThing('add a drawbridge', 'castle')).toBe(false)
    expect(isNewThing('paint the roof blue', 'castle')).toBe(false)
    expect(isNewThing('make the castle a bit bigger', 'castle')).toBe(false)
    expect(isNewThing('a red flag on top of it', 'castle')).toBe(false)
  })
})
