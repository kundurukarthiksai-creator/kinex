import * as THREE from 'three'
import { SHAPES, MATERIALS, PHYSICS, BEHAVIORS, PRESETS, toActions, focusEdit } from './schema.js'
import { useKinex, bodies, newId, dominantColor } from '../store.js'
import { ASSEMBLY_STAGGER } from '../scene/interaction.js'
import { parsePartLine, parseIndexedLine } from './partLine.js'

const DEG = Math.PI / 180
const MAX_PARTS = 60 // detailed one-line models; Add detail can take it to 96
export const MAX_DETAILED_PARTS = 96
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
const vec = (v, d) => (Array.isArray(v) && v.length >= 3 ? [0, 1, 2].map((i) => num(v[i], d[i])) : d)
const pick = (v, list, d) => (list.includes(v) ? v : d)
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
// Accepts whatever color the model writes ("#2F5C9E", "#2F5C9EFF", "blue", "rgb(...)") as #RRGGBB.
const _c = new THREE.Color()
function color(c, d = '#8890A6') {
  if (typeof c !== 'string' || !c.trim()) return d
  const v = c.trim()
  if (HEX.test(v)) return v
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7)
  const name = v.toLowerCase().replace(/\s+/g, '')
  if (THREE.Color.NAMES?.[name] !== undefined) return `#${_c.setHex(THREE.Color.NAMES[name]).getHexString()}`
  if (/^(rgb|hsl)a?\(/.test(name)) return `#${_c.setStyle(name).getHexString()}`
  return d
}

export function sanitizePart(p = {}) {
  if (typeof p === 'string') p = parsePartLine(p) || {}
  const size = vec(p.size, [0.5, 0.5, 0.5]).map((n) => clamp(Math.abs(n), 0.01, 40))
  return {
    shape: pick(p.shape, SHAPES, 'box'),
    size,
    position: vec(p.position, [0, size[1] / 2, 0]).map((n) => clamp(n, -40, 40)),
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
  const { hoverId, heldIds } = useKinex.getState()
  if (ref) {
    const r = String(ref).toLowerCase()
    const exact = objects.find((o) => o.id.toLowerCase() === r)
    if (exact) return exact
    const byName = [...objects].reverse().find((o) => o.name.toLowerCase().includes(r) || r.includes(o.name.toLowerCase()))
    if (byName) return byName
  }
  if (!focusFallback) return null
  const focus = heldIds[0] || hoverId
  return objects.find((o) => o.id === focus) || objects.at(-1) || null
}

// Models that come back far too big or tiny get scaled to a size that reads on screen.
export function normalizeSize(parts, { max = 6, min = 0.8, target = 3, small = 1.8 } = {}) {
  if (!parts.length) return parts
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const p of parts)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.position[i] - p.size[i] / 2)
      hi[i] = Math.max(hi[i], p.position[i] + p.size[i] / 2)
    }
  const longest = Math.max(...hi.map((h, i) => h - lo[i]))
  if (longest <= max && longest >= min) return parts
  const k = (longest > max ? target : small) / longest
  return parts.map((p) => ({ ...p, size: p.size.map((v) => Math.max(0.01, v * k)), position: p.position.map((v) => v * k) }))
}

export function buildObject(a, objects, { reseat = true } = {}) {
  let parts = (Array.isArray(a.parts) ? a.parts : []).slice(0, MAX_PARTS).map(sanitizePart)
  if (!parts.length) parts.push(sanitizePart({ shape: 'box', size: [0.8, 0.8, 0.8], color: '#8890A6' }))
  if (reseat) parts = normalizeSize(parts) // not mid-stream: the size would jump as parts arrive
  // Re-seat the object so its lowest part touches y=0 of its own base.
  const ext = objectExtent(parts)
  if (reseat && Math.abs(ext.minY) > 0.01) parts.forEach((p) => (p.position[1] -= ext.minY))
  const physics = pick(a.physics, PHYSICS, 'dynamic')
  const behavior = sanitizeBehavior(a.behavior)
  let position = vec(a.position, [0, 0, 0])
  // Models float with no ground: center them around eye height unless placed on purpose.
  const h = objectExtent(parts).height
  if (Math.abs(position[1]) < 0.01) position[1] = 1.2 - h / 2
  position = [clamp(position[0], -6.5, 6.5), clamp(position[1], -4, 6), clamp(position[2], -5, 3)]
  const radius = objectExtent(parts).radius
  if (!behavior.targetId) position = freeSpot(position, radius, objects)
  const name = String(a.name || 'thing').slice(0, 40)
  return { id: newId(name), name, position, rotationY: 0, scale: 1, physics, behavior, parts, rev: 0, born: performance.now() }
}

const partReady = (p) =>
  typeof p === 'string' ? Boolean(parsePartLine(p)) : p && typeof p.shape === 'string' && Array.isArray(p.size) && p.size.length >= 3 &&
  Array.isArray(p.position) && p.position.length >= 3 && typeof p.color === 'string' && typeof p.material === 'string'

// Called on every streamed chunk: objects appear as soon as their first part is
// complete and grow as the model writes more. `live` maps spawn index -> {id, n}.
// Returns true once anything is in the scene.
export function streamSpawns(plan, live) {
  const spawns = Array.isArray(plan?.spawn) ? plan.spawn.slice(0, 12) : []
  spawns.forEach((s, i) => {
    if (!s || !Array.isArray(s.parts)) return
    const ready = s.parts.filter(partReady).slice(0, MAX_PARTS)
    if (!ready.length) return
    const st = useKinex.getState()
    const now = performance.now()
    const entry = live.get(i)
    if (!entry) {
      const at = s.at ?? s.position
      if (!Array.isArray(at)) return
      const obj = buildObject({ ...s, position: at, parts: ready, behavior: undefined }, st.objects, { reseat: false })
      obj.building = true
      obj.parts = obj.parts.map((p, k) => ({ ...p, born: now + k * ASSEMBLY_STAGGER }))
      live.set(i, { id: obj.id, n: ready.length })
      st.addObject(obj)
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
export function applyActions(plan, live = new Map(), edits = new Map(), focusId = null) {
  const st = useKinex.getState()
  const actions = toActions(plan, focusId).slice(0, 12)
  const spawned = []
  let delay = 0
  let spawnIndex = -1
  let modifyIndex = -1
  for (const a of actions) {
    const objects = [...useKinex.getState().objects, ...spawned]
    switch (a?.type) {
      case 'spawn': {
        spawnIndex++
        const entry = live.get(spawnIndex)
        const existing = entry && useKinex.getState().objects.find((o) => o.id === entry.id)
        if (existing) {
          finalizeLive(existing, a, objects)
          break
        }
        const obj = buildObject(a, objects)
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
        spawned.push(obj)
        const add = () => useKinex.getState().addObject(obj)
        delay ? setTimeout(add, delay) : add()
        delay += 260 + obj.parts.length * 30
        break
      }
      case 'modify': {
        modifyIndex++
        const streamed = edits.get(modifyIndex)
        const found = resolveTarget(a.targetId, objects)
        // Parts streamed onto the presumed model belong to another one: take them back.
        if (streamed && found && streamed.id !== found.id) {
          const wrong = useKinex.getState().objects.find((x) => x.id === streamed.id)
          if (wrong) st.updateObject(wrong.id, { parts: wrong.parts.slice(0, wrong.parts.length - streamed.n) })
          streamed.n = 0
        }
        const o = found && useKinex.getState().objects.find((x) => x.id === found.id)
        if (!o) break
        const patch = {}
        if (Number.isFinite(Number(a.scale)) && Number(a.scale) > 0) patch.scale = clamp(o.scale * Number(a.scale), 0.15, 6)
        let parts = o.parts
        if (a.color && color(a.color, null)) {
          const from = dominantColor(o)
          const to = color(a.color)
          parts = parts.map((p) => (p.color === from ? { ...p, color: to } : p))
        }
        if (Array.isArray(a.parts) && a.parts.length) {
          parts = buildObject({ ...a, position: o.position }, []).parts
        } else {
          parts = editParts(parts, a, streamed && streamed.id === o.id ? streamed.n : 0)
        }
        if (parts !== o.parts) patch.parts = parts
        if (a.physics) patch.physics = pick(a.physics, PHYSICS, o.physics)
        if (a.behavior) {
          const b = sanitizeBehavior(a.behavior)
          if (b.targetId) b.targetId = resolveTarget(b.targetId, objects, false)?.id || null
          patch.behavior = b
        }
        const body = bodies.get(o.id)
        if (Array.isArray(a.position)) {
          const p = vec(a.position, o.position)
          patch.position = [clamp(p[0], -6.5, 6.5), clamp(p[1], -4, 6), clamp(p[2], -5, 3)]
          body?.setTranslation({ x: patch.position[0], y: patch.position[1] + 0.05, z: patch.position[2] }, true)
        }
        if (Number.isFinite(Number(a.rotateY))) {
          const turn = Number(a.rotateY) * DEG
          patch.rotationY = (o.rotationY || 0) + turn
          if (body) {
            const q = body.rotation()
            const c = Math.cos(turn / 2)
            const s = Math.sin(turn / 2)
            // q' = rotY(turn) * q
            body.setRotation({ w: c * q.w - s * q.y, x: c * q.x + s * q.z, y: c * q.y + s * q.w, z: c * q.z - s * q.x }, true)
          }
        }
        if (patch.scale && body) {
          body.wakeUp()
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

function finalizeLive(o, a, objects) {
  // A stream cut short can end mid-part; keep only finished parts.
  const ready = Array.isArray(a.parts) ? a.parts.filter(partReady) : []
  const fin = buildObject({ ...a, parts: ready.length ? ready : a.parts, position: o.position }, [], { reseat: true })
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

const DEG2 = Math.PI / 180

// Applies addParts / editParts / removeParts to a part list. `already` = how many of
// addParts were streamed in (they sit at the end of the list).
export function editParts(parts, a, already = 0) {
  const original = parts.length - already
  let out = parts
  const edits = Array.isArray(a.editParts) ? a.editParts : []
  if (edits.length) {
    out = out.slice()
    for (const raw of edits) {
      // A one-line change replaces the whole part: "3 cone 1 0.8 1 ...".
      const e = typeof raw === 'string' ? parseIndexedLine(raw) : raw
      const i = Number(e?.index)
      if (!Number.isInteger(i) || i < 0 || i >= original) continue
      const p = { ...out[i] }
      if (e.shape) p.shape = pick(e.shape, SHAPES, p.shape)
      if (Array.isArray(e.size)) p.size = vec(e.size, p.size).map((n) => clamp(Math.abs(n), 0.03, 8))
      if (Array.isArray(e.position)) p.position = vec(e.position, p.position).map((n) => clamp(n, -8, 12))
      else if (Array.isArray(e.size)) {
        // Grew without a new position: keep its base where it was ("taller" grows up, not into the ground).
        const base = out[i].position[1] - out[i].size[1] / 2
        p.position = [p.position[0], base + p.size[1] / 2, p.position[2]]
      }
      if (Array.isArray(e.rotation)) p.rotation = vec(e.rotation, [0, 0, 0]).map((n) => clamp(n, -720, 720) * DEG2)
      if (e.color) p.color = color(e.color, p.color)
      if (e.material) p.material = pick(e.material, MATERIALS, p.material)
      out[i] = p
    }
  }
  const adds = Array.isArray(a.addParts) ? a.addParts.filter(partReady).slice(already) : []
  if (adds.length) {
    const now = performance.now()
    out = [...out, ...adds.map((p, k) => ({ ...sanitizePart(p), born: now + k * ASSEMBLY_STAGGER }))]
  }
  const remove = new Set((Array.isArray(a.removeParts) ? a.removeParts : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < original))
  if (remove.size) out = out.filter((_, i) => !remove.has(i))
  if (out.length > MAX_DETAILED_PARTS) out = out.slice(0, MAX_DETAILED_PARTS)
  return out.length ? out : parts
}

// Streams addParts of each modify onto its model while the AI is still writing.
// The target id arrives last (keys are alphabetical), so parts go to the model
// being worked on (`focusId`); applyActions moves them if the target differs.
export function streamEdits(plan, edits, focusId) {
  const conv = focusEdit(plan, focusId) // conversation format: top-level "add"
  const mods = conv ? [conv] : Array.isArray(plan?.modify) ? plan.modify : []
  mods.forEach((m, i) => {
    if (!m || !Array.isArray(m.addParts)) return
    const st = useKinex.getState()
    const entry = edits.get(i) || { id: (m.targetId && resolveTarget(m.targetId, st.objects, false)?.id) || focusId, n: 0 }
    const o = st.objects.find((x) => x.id === entry.id)
    if (!o) return
    const ready = m.addParts.filter(partReady)
    const fresh = ready.slice(entry.n, entry.n + Math.max(0, MAX_DETAILED_PARTS - o.parts.length))
    if (!fresh.length) return
    const now = performance.now()
    entry.n += fresh.length
    edits.set(i, entry)
    st.updateObject(o.id, { parts: [...o.parts, ...fresh.map((p, k) => ({ ...sanitizePart(p), born: now + k * ASSEMBLY_STAGGER }))] })
  })
  return edits.size > 0
}
