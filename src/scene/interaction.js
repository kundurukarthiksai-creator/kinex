import { useKinex, bodies } from '../store.js'

// Rapier body types
export const DYNAMIC = 0
export const FIXED = 1
export const KINEMATIC = 2

export const ASSEMBLY_STAGGER = 45 // ms between parts
export const ASSEMBLY_PART_MS = 520
export const assemblyMs = (obj) => obj.parts.length * ASSEMBLY_STAGGER + ASSEMBLY_PART_MS

export const held = new Map() // id -> number of pointers holding it
export const liveScale = new Map() // id -> multiplier during a two-hand stretch
export const homes = new Map() // id -> {x,y,z} anchor for behaviors

const getObj = (id) => useKinex.getState().objects.find((o) => o.id === id)

export function desiredType(obj, now = performance.now()) {
  if (held.has(obj.id)) return KINEMATIC
  if (now - obj.born < assemblyMs(obj)) return KINEMATIC
  if (obj.behavior.kind !== 'none' || obj.physics === 'float') return KINEMATIC
  if (obj.physics === 'static') return FIXED
  return DYNAMIC
}

function syncHeld() {
  useKinex.getState().set({ heldIds: [...held.keys()] })
}

export function grab(id) {
  const body = bodies.get(id)
  if (!body) return false
  held.set(id, (held.get(id) || 0) + 1)
  body.setBodyType(KINEMATIC, true)
  syncHeld()
  return true
}

export function release(id, velocity) {
  const n = (held.get(id) || 1) - 1
  if (n > 0) {
    held.set(id, n)
    return
  }
  held.delete(id)
  syncHeld()
  const body = bodies.get(id)
  const obj = getObj(id)
  if (!body || !obj) return
  const t = body.translation()
  homes.set(id, { x: t.x, y: t.y, z: t.z })
  const type = desiredType(obj)
  body.setBodyType(type, true)
  if (type === DYNAMIC && velocity) {
    const max = 22
    const sp = Math.hypot(velocity.x, velocity.y, velocity.z)
    const k = sp > max ? max / sp : 1
    body.setLinvel({ x: velocity.x * k, y: velocity.y * k, z: velocity.z * k }, true)
    if (sp > 2.5) body.setEnabledRotations(true, true, true, true)
    // A flick should tumble, not glide.
    const spin = Math.min(sp, max) * 0.35
    body.setAngvel({ x: velocity.z * 0.3, y: (Math.random() - 0.5) * spin, z: -velocity.x * 0.3 }, true)
  }
}

export function commitScale(id) {
  const m = liveScale.get(id)
  liveScale.delete(id)
  const obj = getObj(id)
  if (!obj || !m || Math.abs(m - 1) < 0.01) return
  useKinex.getState().updateObject(id, { scale: Math.min(6, Math.max(0.15, obj.scale * m)) })
}
