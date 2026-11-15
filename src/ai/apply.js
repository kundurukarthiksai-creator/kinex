import { SHAPES, MATERIALS, PHYSICS, BEHAVIORS, PRESETS, GRAVITY, toActions } from './schema.js'
import { useKinex, bodies, newId, dominantColor } from '../store.js'
import { ASSEMBLY_STAGGER } from '../scene/interaction.js'

const DEG = Math.PI / 180
const MAX_PARTS = 24
export const MAX_DETAILED_PARTS = 96
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
const vec = (v, d) => (Array.isArray(v) && v.length >= 3 ? [0, 1, 2].map((i) => num(v[i], d[i])) : d)
const pick = (v, list, d) => (list.includes(v) ? v : d)
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const color = (c, d = '#8890A6') => (typeof c === 'string' && HEX.test(c.trim()) ? c.trim() : d)

export function sanitizePart(p = {}) {
  p = p && typeof p === 'object' ? p : {}
  const size = vec(p.size, [0.5, 0.5, 0.5]).map((n) => clamp(Math.abs(n), 0.03, 8))
  return {
    shape: pick(p.shape, SHAPES, 'box'),
    size,
    position: vec(p.position, [0, size[1] / 2, 0]).map((n) => clamp(n, -8, 12)),
    rotation: vec(p.rotation, [0, 0, 0]).map((n) => clamp(n, -720, 720) * DEG),
    color: color(p.color),
    material: pick(p.material, MATERIALS, 'plastic'),
  }
}

function sanitizeBehavior(b) {
  if (!b || typeof b !== 'object') return { kind: 'none', speed: 1 }
  return { kind: pick(b.kind, BEHAVIORS, 'none'), speed: clamp(num(b.speed, 1), 0.1, 4), targetId: b.targetId || null }
}

// Horizontal footprint radius and height of an object at scale 1.
export function objectExtent(parts) {
  let r = 0.3
  let h = 0.3
  let minY = Infinity
  for (const p of parts) {
    r = Math.max(r, Math.hypot(p.position[0], p.position[2]) + Math.max(p.size[0], p.size[2]) / 2)
    h = Math.max(h, p.position[1] + p.size[1] / 2)
    minY = Math.min(minY, p.position[1] - p.size[1] / 2)
  }
  return { radius: r, height: h, minY: Number.isFinite(minY) ? minY : 0 }
}

function currentPos(o) {
  const b = bodies.get(o.id)
  if (b) {
    const t = b.translation()
    return [t.x, t.y, t.z]
  }
  return o.position
}

// Nudge a spawn point sideways until it doesn't overlap anything already there.
function freeSpot(pos, radius, objects) {
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4]
  for (const k of offsets) {
    const x = clamp(pos[0] + k * 1.6, -6, 6)
    const clear = objects.every((o) => {
      const p = currentPos(o)
      const r2 = objectExtent(o.parts).radius * o.scale
      return Math.hypot(p[0] - x, p[2] - pos[2]) > (radius + r2) * 0.9
    })
    if (clear) return [x, pos[1], pos[2]]
  }
  return pos
}

export function resolveTarget(ref, objects, focusFallback = true) {
  const { hoverId, heldIds, lastId, inspectId } = useKinex.getState()
  if (ref) {
    const r = String(ref).toLowerCase()
    const exact = objects.find((o) => o.id.toLowerCase() === r)
    if (exact) return exact
    const byName = [...objects].reverse().find((o) => o.name.toLowerCase().includes(r) || r.includes(o.name.toLowerCase()))
    if (byName) return byName
    return null
  }
  if (!focusFallback) return null
  const focus = inspectId || heldIds[0] || lastId || hoverId
  return objects.find((o) => o.id === focus) || objects.at(-1) || null
}

export function buildObject(a, objects, { reseat = true, maxParts = MAX_PARTS } = {}) {
  const limit = clamp(Math.trunc(num(maxParts, MAX_PARTS)), 1, MAX_DETAILED_PARTS)
  const parts = (Array.isArray(a.parts) ? a.parts : []).slice(0, limit).map(sanitizePart)
  if (!parts.length) parts.push(sanitizePart({ shape: 'box', size: [0.8, 0.8, 0.8], color: '#8890A6' }))
  // Re-seat the object so its lowest part touches y=0 of its own base.
  const ext = objectExtent(parts)
  if (reseat && Math.abs(ext.minY) > 0.01) parts.forEach((p) => (p.position[1] -= ext.minY))
  const physics = pick(a.physics, PHYSICS, 'dynamic')
  const behavior = sanitizeBehavior(a.behavior)
  let position = vec(a.position, [0, 0, 0])
  position = [clamp(position[0], -6.5, 6.5), clamp(position[1], 0, 7), clamp(position[2], -5, 3)]
  if ((physics === 'float' || behavior.kind === 'float' || behavior.kind === 'orbit') && position[1] < 0.6) position[1] = 1.4
  const radius = objectExtent(parts).radius
  if (!behavior.targetId) position = freeSpot(position, radius, objects)
  const name = String(a.name || 'thing').slice(0, 40)
  return { id: newId(name), name, position, rotationY: 0, scale: 1, physics, behavior, parts, rev: 0, born: performance.now() }
}

const partReady = (p) =>
  p && typeof p.shape === 'string' && Array.isArray(p.size) && p.size.length >= 3 &&
  Array.isArray(p.position) && p.position.length >= 3 && typeof p.color === 'string' && typeof p.material === 'string'

// Called on every streamed chunk: objects appear as soon as their first part is
// complete and grow as the model writes more. `live` maps spawn index -> {id, n}.
// Returns true once anything is in the scene.
export function streamSpawns(plan, live, { maxParts = MAX_PARTS } = {}) {
  const spawns = Array.isArray(plan?.spawn) ? plan.spawn.slice(0, 12) : []
  spawns.forEach((s, i) => {
    if (!s || !Array.isArray(s.parts)) return
    const ready = s.parts.filter(partReady).slice(0, Math.min(maxParts, MAX_DETAILED_PARTS))
    if (!ready.length) return
    const st = useKinex.getState()
    const now = performance.now()
    const entry = live.get(i)
    if (!entry) {
      const at = s.at ?? s.position
      if (!Array.isArray(at)) return
      const obj = buildObject({ ...s, position: at, parts: ready, behavior: undefined }, st.objects, { reseat: false, maxParts })
      obj.building = true
      obj.parts = obj.parts.map((p, k) => ({ ...p, born: now + k * ASSEMBLY_STAGGER }))
      if(st.addObject(obj))live.set(i,{id:obj.id,n:ready.length})
    } else if (ready.length > entry.n) {
      const o = st.objects.find((x) => x.id === entry.id)
      if (!o) return
      const fresh = ready.slice(entry.n).map((p, k) => ({ ...sanitizePart(p), born: now + k * ASSEMBLY_STAGGER }))
      entry.n = ready.length
      st.updateObject(o.id, { parts: [...o.parts, ...fresh] })
    }
  })
  return live.size > 0
}

// Applies validated actions to the world. Spawns already streamed in (`live`) are
// finalized in place instead of being built again.
export function applyActions(plan, live = new Map(), { maxParts = MAX_PARTS } = {}) {
  const st = useKinex.getState()
  const actions = toActions(plan).slice(0, 38)
  const spawned = []
  let delay = 0
  let spawnIndex = -1
  for (const a of actions) {
    const objects = [...useKinex.getState().objects]
    switch (a?.type) {
      case 'spawn': {
        spawnIndex++
        if(!Array.isArray(a.parts)||!a.parts.length)break
        const entry = live.get(spawnIndex)
        const existing = entry && useKinex.getState().objects.find((o) => o.id === entry.id)
        if (existing) {
          finalizeLive(existing, a, objects, maxParts)
          break
        }
        const obj = buildObject(a, objects, { maxParts })
        if (obj.behavior.targetId) {
          const t = resolveTarget(obj.behavior.targetId, objects, false)
          obj.behavior.targetId = t ? t.id : null
          if (t) {
            const tp = currentPos(t)
            const d = Math.max(1.6, Math.hypot(obj.position[0] - tp[0], obj.position[2] - tp[2]))
            const ang = Math.random() * Math.PI * 2
            obj.position = [tp[0] + Math.cos(ang) * d, Math.max(obj.position[1], tp[1] + 0.6), tp[2] + Math.sin(ang) * d]
          }
        }
        obj.born += delay
        if(useKinex.getState().addObject(obj))spawned.push(obj)
        delay += 260 + obj.parts.length * 30
        break
      }
      case 'modify': {
        const o = resolveTarget(a.targetId, objects)
        if (!o) break
        const patch = {}
        if (Number.isFinite(Number(a.scale)) && Number(a.scale) > 0) patch.scale = clamp(o.scale * Number(a.scale), 0.15, 6)
        if (a.color && HEX.test(a.color)) {
          const from = dominantColor(o)
          patch.parts = o.parts.map((p) => (p.color === from ? { ...p, color: a.color } : p))
          patch.appearance = a.colorPart && o.source?.colorParts?.includes(a.colorPart) ? { ...o.appearance, partColors: { ...o.appearance?.partColors, [a.colorPart]:a.color } } : { ...o.appearance, color: a.color, partColors: undefined }
        }
        if (MATERIALS.includes(a.material)) {
          patch.parts = (patch.parts || o.parts).map((part) => ({ ...part, material: a.material }))
          patch.appearance = { ...(patch.appearance || o.appearance), material: a.material }
        }
        if (Array.isArray(a.parts) && a.parts.length) {
          patch.parts = buildObject({ ...a, position: o.position }, []).parts
        }
        if (a.physics) patch.physics = pick(a.physics, PHYSICS, o.physics)
        if (a.behavior) {
          const b = sanitizeBehavior(a.behavior)
          if (b.targetId) b.targetId = resolveTarget(b.targetId, objects, false)?.id || null
          patch.behavior = b
        }
        const body = bodies.get(o.id)
        if (Array.isArray(a.translate)) {
          const current = currentPos(o)
          a.position = current.map((value, index) => value + num(a.translate[index], 0))
        }
        if (Array.isArray(a.position)) {
          const p = vec(a.position, o.position)
          patch.position = [clamp(p[0], -6.5, 6.5), clamp(p[1], 0, 7), clamp(p[2], -5, 3)]
          body?.setTranslation({ x: patch.position[0], y: patch.position[1] + 0.05, z: patch.position[2] }, true)
        }
        if (Number.isFinite(Number(a.rotateY)) || (['x', 'y', 'z'].includes(a.rotate?.axis) && Number.isFinite(a.rotate?.degrees))) {
          const turn = clamp(Number(a.rotate?.degrees ?? a.rotateY), -720, 720) * DEG
          patch.rotationY = 0
          {
            const q = body?.rotation() || (o.quaternion ? { x: o.quaternion[0], y: o.quaternion[1], z: o.quaternion[2], w: o.quaternion[3] } : { x: 0, y: Math.sin((o.rotationY || 0) / 2), z: 0, w: Math.cos((o.rotationY || 0) / 2) })
            const c = Math.cos(turn / 2), s = Math.sin(turn / 2)
            const axis = a.rotate?.axis || 'y'
            const [x,y,z] = axis === 'x' ? [s,0,0] : axis === 'z' ? [0,0,s] : [0,s,0]
            const next = { w:c*q.w-x*q.x-y*q.y-z*q.z, x:c*q.x+x*q.w+y*q.z-z*q.y, y:c*q.y-x*q.z+y*q.w+z*q.x, z:c*q.z+x*q.y-y*q.x+z*q.w }
            body?.setRotation(next, true)
            patch.quaternion = [next.x, next.y, next.z, next.w]
          }
        }
        if (patch.scale && body) {
          // Lift a growing object so it doesn't spawn into the floor.
          const t = body.translation()
          body.setTranslation({ x: t.x, y: Math.max(t.y, 0.02), z: t.z }, true)
        }
        st.updateObject(o.id, patch)
        break
      }
      case 'delete': {
        const o = resolveTarget(a.targetId, objects)
        if (o) st.removeObject(o.id)
        break
      }
      case 'clear':
        st.clear()
        break
      case 'environment': {
        const env = useKinex.getState().environment
        st.set({
          environment: {
            preset: pick(a.preset, PRESETS, env.preset),
            gravity: pick(a.gravity, GRAVITY, env.gravity),
          },
        })
        break
      }
      default:
        break
    }
  }
  return spawned.map((o) => o.id)
}

function finalizeLive(o, a, objects, maxParts) {
  // A stream cut short can end mid-part; keep only finished parts.
  const ready = Array.isArray(a.parts) ? a.parts.filter(partReady) : []
  const fin = buildObject({ ...a, parts: ready.length ? ready : a.parts, position: o.position }, [], { reseat: true, maxParts })
  const now = performance.now()
  let extra = 0
  const parts = fin.parts.map((p, k) => ({ ...p, born: o.parts[k]?.born ?? now + extra++ * ASSEMBLY_STAGGER }))
  const behavior = fin.behavior
  if (behavior.targetId) behavior.targetId = resolveTarget(behavior.targetId, objects.filter((x) => x.id !== o.id), false)?.id || null
  useKinex.getState().updateObject(o.id, { parts, physics: fin.physics, behavior, building: false })
}

// Streams AI detail parts onto an existing object (Add detail in Inspect).
// `live.n` counts how many streamed parts were already added. Returns true once any landed.
export function streamDetail(plan, id, live) {
  const s = Array.isArray(plan?.spawn) ? plan.spawn[0] : null
  if (!s || !Array.isArray(s.parts)) return live.n > 0
  const st = useKinex.getState()
  const o = st.objects.find((x) => x.id === id)
  if (!o) return live.n > 0
  const ready = s.parts.filter(partReady)
  const room = MAX_DETAILED_PARTS - o.parts.length
  const fresh = ready.slice(live.n, live.n + Math.max(0, room))
  if (!fresh.length) return live.n > 0
  const now = performance.now()
  live.n += fresh.length
  st.updateObject(id, { parts: [...o.parts, ...fresh.map((p, k) => ({ ...sanitizePart(p), born: now + k * ASSEMBLY_STAGGER }))] })
  return true
}
