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
    expect(inspectIntent('rotate 90 degrees on the x axis')).toBe(true)
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
    expect(inspectIntent('Create a detailed lighthouse')).toBe(false)
    useKinex.setState({ inspectId: null })
    expect(inspectIntent('rotate 90 on x')).toBe(false)
  })
})
