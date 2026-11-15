import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKinex, bodies } from '../store.js'
import { buildObject, applyActions } from '../ai/apply.js'
import { held, homes, release } from './interaction.js'

function seed() {
  const object = buildObject({ name: 'orb', physics: 'float', behavior: { kind: 'float', speed: 1 }, parts: [{ shape: 'sphere', size: [1,1,1], position: [0,.5,0], color: '#FFFFFF', material: 'plastic' }] }, [])
  const rotation = { x: Math.sin(Math.PI/8), y: 0, z: 0, w: Math.cos(Math.PI/8) }
  const body = { translation: () => ({ x: 1, y: 2, z: 3 }), rotation: () => rotation, setBodyType: vi.fn(), setRotation: vi.fn() }
  useKinex.setState({ objects: [object] })
  bodies.set(object.id, body)
  return { object, body, rotation }
}

beforeEach(() => { bodies.clear(); held.clear(); homes.clear(); useKinex.setState({ objects: [], heldIds: [] }) })

describe('persisting hand rotations', () => {
  it('commits all three axes when the final hand releases a floating object', () => {
    const { object, rotation } = seed()
    held.set(object.id, 1)
    release(object.id, { x:0,y:0,z:0 })
    expect(useKinex.getState().objects[0].quaternion).toEqual([rotation.x,rotation.y,rotation.z,rotation.w])
    expect(homes.get(object.id).at).toBeGreaterThan(0)
    expect(held.has(object.id)).toBe(false)
  })
  it('keeps a two-hand grab active until both hands let go', () => {
    const { object } = seed()
    held.set(object.id, 2)
    release(object.id)
    expect(held.get(object.id)).toBe(1)
    expect(useKinex.getState().objects[0].quaternion).toBeUndefined()
    release(object.id)
    expect(useKinex.getState().objects[0].quaternion).toHaveLength(4)
  })
  it('composes later AI turns with the orientation set by hand', () => {
    const { object, rotation } = seed()
    held.set(object.id, 1)
    release(object.id)
    applyActions({ modify: [{ targetId: object.id, rotateY: 90 }] })
    const q = useKinex.getState().objects[0].quaternion
    expect(q[0]).toBeCloseTo(Math.SQRT1_2 * rotation.x)
    expect(q[1]).toBeCloseTo(Math.SQRT1_2 * rotation.w)
    expect(q[2]).toBeCloseTo(-Math.SQRT1_2 * rotation.x)
  })
})
