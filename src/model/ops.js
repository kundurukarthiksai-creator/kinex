import * as THREE from 'three'

// Edits on a real model, by selector. The AI only chooses WHAT (a selector) and an
// action; this file does the editing, exactly and undoably. Answers to questions
// ("how many windows on Level 1?") are computed here from the data, never guessed.

export const ACTIONS = ['highlight', 'isolate', 'show', 'hide', 'delete', 'recolor', 'material', 'move', 'rotate', 'scale', 'duplicate', 'query']

const KIND_WORDS = {
  wall: 'wall', walls: 'wall', door: 'door', doors: 'door', window: 'window', windows: 'window',
  slab: 'slab', slabs: 'slab', floor: 'slab', floors: 'slab', roof: 'roof', roofs: 'roof',
  stair: 'stair', stairs: 'stair', staircase: 'stair', railing: 'railing', railings: 'railing',
  beam: 'beam', beams: 'beam', column: 'column', columns: 'column', ceiling: 'ceiling', ceilings: 'ceiling',
  furniture: 'furniture', cabinet: 'furniture', cabinets: 'furniture', room: 'room', rooms: 'room',
  member: 'member', panel: 'panel', other: 'other', part: 'part', parts: 'part', joint: 'joint', joints: 'joint',
}

export const MATERIALS = {
  brick: { color: '#9C4A35', roughness: 0.92, metalness: 0 },
  concrete: { color: '#A6A39C', roughness: 0.95, metalness: 0 },
  wood: { color: '#A0703F', roughness: 0.7, metalness: 0 },
  glass: { color: '#BFE3F5', roughness: 0.05, metalness: 0, opacity: 0.35 },
  metal: { color: '#9AA3AD', roughness: 0.3, metalness: 0.85 },
  steel: { color: '#8C949C', roughness: 0.35, metalness: 0.9 },
  plaster: { color: '#EEEAE2', roughness: 0.9, metalness: 0 },
  stone: { color: '#8F8A80', roughness: 0.95, metalness: 0 },
  marble: { color: '#ECEBE6', roughness: 0.25, metalness: 0 },
  gold: { color: '#D4AF37', roughness: 0.25, metalness: 1 },
}

const lower = (s) => String(s || '').toLowerCase()

// Turns words like "ground floor" or "2" into the model's storey names.
function storeyMatch(el, want, storeys) {
  if (!want) return true
  const w = lower(want).trim()
  if (!/[a-z0-9]/.test(w) || /^(any|all|every|whole|entire|both)/.test(w)) return true // "*", "all floors"...
  const s = lower(el.storey)
  if (!s) return false
  if (s.includes(w) || w.includes(s)) return true
  const ordered = [...storeys].sort((a, b) => a.elevation - b.elevation).filter((x) => x.elevation >= -0.5)
  const idx = /ground|first|1st|level 1|lower|bottom/.test(w) ? 0 : /second|2nd|upper|level 2|top floor/.test(w) ? 1 : /third|3rd|level 3/.test(w) ? 2 : /^\d+$/.test(w) ? Number(w) - 1 : -1
  return idx >= 0 && ordered[idx] ? lower(ordered[idx].name) === s : false
}

// Which side of the model an element is on. Front / south = +z (toward the default camera).
function sideMatch(el, side, bounds) {
  if (!side || !el.center) return !side
  const [cx, , cz] = el.center
  const mx = (bounds.min[0] + bounds.max[0]) / 2
  const mz = (bounds.min[2] + bounds.max[2]) / 2
  const sx = (bounds.max[0] - bounds.min[0]) / 2 || 1
  const sz = (bounds.max[2] - bounds.min[2]) / 2 || 1
  const s = lower(side)
  if (/front|south/.test(s)) return (cz - mz) / sz > 0.25
  if (/back|rear|north/.test(s)) return (cz - mz) / sz < -0.25
  if (/right|east/.test(s)) return (cx - mx) / sx > 0.25
  if (/left|west/.test(s)) return (cx - mx) / sx < -0.25
  return true
}

export function modelBounds(elements) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const e of elements)
    if (e.center && e.size)
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], e.center[i] - e.size[i] / 2)
        max[i] = Math.max(max[i], e.center[i] + e.size[i] / 2)
      }
  return { min, max }
}

// Resolves a selector to element ids. An empty selector selects nothing (never "everything" by accident).
export function select(model, sel = {}) {
  const keys = Object.keys(sel || {}).filter((k) => sel[k] !== undefined && sel[k] !== null && !(Array.isArray(sel[k]) && !sel[k].length))
  if (!keys.length) return []
  const bounds = modelBounds(model.elements)
  const kinds = (Array.isArray(sel.kinds) ? sel.kinds : sel.kinds ? [sel.kinds] : []).map((k) => KIND_WORDS[lower(k)] || lower(k))
  const ids = new Set((sel.ids || []).map(Number))
  const hostedBy = sel.hostedBy ? new Set((Array.isArray(sel.hostedBy) ? sel.hostedBy : [sel.hostedBy]).map(Number)) : null
  const name = sel.nameContains ? lower(sel.nameContains) : null
  const kindOf = new Map(model.elements.map((e) => [e.id, e.kind]))
  return model.elements
    .filter((e) => !e.deleted)
    .filter((e) => !ids.size || ids.has(e.id))
    .filter((e) => !kinds.length || kinds.includes(e.kind))
    .filter((e) => storeyMatch(e, sel.storey, model.storeys || []))
    .filter((e) => sel.external === undefined || sel.external === null || e.external === sel.external)
    .filter((e) => sel.loadBearing === undefined || sel.loadBearing === null || e.loadBearing === sel.loadBearing)
    .filter((e) => !name || lower(e.name).includes(name) || lower(e.raw).includes(name) || lower(e.material).includes(name))
    .filter((e) => !hostedBy || hostedBy.has(e.hostId))
    .filter((e) => !sel.hostsOpenings || e.hosts.length > 0)
    .filter((e) => !sel.hostsKind || e.hosts.some((h) => sel.hostsKind === 'any' || kindOf.get(h) === sel.hostsKind))
    .filter((e) => sideMatch(e, sel.side, bounds))
    .map((e) => e.id)
}

// ---- undo -------------------------------------------------------------------

function snapshot(model, ids) {
  return ids.map((id) => {
    const g = model.byId.get(id)
    const el = model.elements.find((e) => e.id === id)
    return {
      id,
      visible: g?.visible,
      position: g?.position.clone(),
      quaternion: g?.quaternion.clone(),
      scale: g?.scale.clone(),
      materials: g ? meshes(g).map((m) => m.material) : [],
      el: el ? { ...el, size: el.size && [...el.size], center: el.center && [...el.center] } : null,
    }
  })
}

function restore(model, snap) {
  for (const s of snap) {
    const g = model.byId.get(s.id)
    if (g) {
      g.visible = s.visible
      g.position.copy(s.position)
      g.quaternion.copy(s.quaternion)
      g.scale.copy(s.scale)
      meshes(g).forEach((m, i) => (m.material = s.materials[i] ?? m.material))
    }
    const i = model.elements.findIndex((e) => e.id === s.id)
    if (i >= 0 && s.el) model.elements[i] = s.el
  }
}

export function undo(model) {
  const step = model.history?.pop()
  if (!step) return null
  restore(model, step.snap)
  for (const id of step.created || []) {
    const g = model.byId.get(id)
    g?.parent?.remove(g)
    model.byId.delete(id)
    model.elements = model.elements.filter((e) => e.id !== id)
  }
  return step.label
}

// ---- actions ----------------------------------------------------------------

const meshes = (g) => {
  const out = []
  g.traverse((o) => o.isMesh && out.push(o))
  return out
}

function paint(g, props) {
  for (const m of meshes(g)) {
    const mat = m.material.clone()
    if (props.color) mat.color.set(props.color)
    if (props.roughness !== undefined) mat.roughness = props.roughness
    if (props.metalness !== undefined) mat.metalness = props.metalness
    if (props.opacity !== undefined) {
      mat.opacity = props.opacity
      mat.transparent = props.opacity < 0.99
      mat.depthWrite = props.opacity >= 0.99
    }
    m.material = mat
  }
}

function refreshGeometry(model, id) {
  const g = model.byId.get(id)
  const el = model.elements.find((e) => e.id === id)
  if (!g || !el || !el.size) return
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g)
  if (b.isEmpty()) return
  const s = b.getSize(new THREE.Vector3())
  const c = b.getCenter(new THREE.Vector3())
  el.size = [s.x, s.y, s.z].map((n) => Math.round(n * 100) / 100)
  el.center = [c.x, c.y, c.z].map((n) => Math.round(n * 100) / 100)
}

const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1))
const UNCOUNTABLE = new Set(['furniture', 'other'])
const plural = (n, w) => (UNCOUNTABLE.has(w) ? `${n} ${w === 'other' ? 'other items' : 'pieces of furniture'}` : `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? '' : 's'}`)

// Computes an exact answer from the element data.
export function measure(model, ids, what = 'count') {
  const els = ids.map((id) => model.elements.find((e) => e.id === id)).filter(Boolean)
  const kinds = [...new Set(els.map((e) => e.kind))]
  const label = kinds.length === 1 ? kinds[0] : 'element'
  if (what === 'list') {
    if (!els.length) return 'None found.'
    const shown = els.slice(0, 25).map((e) => `${e.name}${e.storey ? ` (${e.storey})` : ''}`)
    return `${plural(els.length, label)}: ${shown.join('; ')}${els.length > 25 ? `; and ${els.length - 25} more` : ''}.`
  }
  if (what === 'length') {
    const len = els.reduce((n, e) => n + (e.size ? Math.max(e.size[0], e.size[2]) : 0), 0)
    return `${plural(els.length, label)}, about ${fmt(len)} m in total length.`
  }
  if (what === 'area') {
    const area = els.reduce((n, e) => {
      if (!e.size) return n
      const [w, h, d] = e.size
      return n + (e.kind === 'slab' || e.kind === 'roof' || e.kind === 'ceiling' ? w * d : Math.max(w, d) * h)
    }, 0)
    return `${plural(els.length, label)}, about ${fmt(area)} m² of surface.`
  }
  if (what === 'volume') {
    const vol = els.reduce((n, e) => n + (e.size ? e.size[0] * e.size[1] * e.size[2] : 0), 0)
    return `${plural(els.length, label)}, about ${fmt(vol)} m³ of bounding volume.`
  }
  const byStorey = {}
  for (const e of els) byStorey[e.storey || 'no storey'] = (byStorey[e.storey || 'no storey'] || 0) + 1
  const split = Object.keys(byStorey).length > 1 ? ` (${Object.entries(byStorey).map(([s, n]) => `${n} on ${s}`).join(', ')})` : ''
  return `${plural(els.length, label)}${split}.`
}

let nextId = -1

// Applies a list of ops. Returns { notes, answers, selection } and records one undo step.
export function applyOps(model, ops = []) {
  model.history ??= []
  const notes = []
  const answers = []
  let selection = []
  let focus = [] // what the camera should look at (isolating frames without highlighting)
  const touched = new Set()
  const created = []
  const before = []

  for (const op of ops.slice(0, 20)) {
    const action = ACTIONS.includes(op?.action) ? op.action : null
    if (!action) continue
    const ids = select(model, op.select)
    if (action === 'query') {
      answers.push(measure(model, ids, op.measure || 'count'))
      selection = ids
      continue
    }
    if (!ids.length) {
      notes.push(`Nothing matched for "${action}".`)
      continue
    }
    const fresh = ids.filter((id) => !touched.has(id))
    if (action !== 'highlight') before.push(...snapshot(model, fresh))
    fresh.forEach((id) => touched.add(id))
    const els = ids.map((id) => model.elements.find((e) => e.id === id))
    const label = plural(ids.length, [...new Set(els.map((e) => e.kind))].length === 1 ? els[0].kind : 'element')

    switch (action) {
      case 'highlight':
        selection = ids
        notes.push(`Highlighted ${label}`)
        break
      case 'isolate': {
        const keep = new Set(ids)
        const others = model.elements.filter((e) => !keep.has(e.id) && e.kind !== 'room' && !touched.has(e.id)).map((e) => e.id)
        before.push(...snapshot(model, others))
        others.forEach((id) => touched.add(id))
        for (const e of model.elements) if (e.kind !== 'room') model.byId.get(e.id).visible = keep.has(e.id) && !e.deleted
        focus = ids
        notes.push(`Showing only ${label}`)
        break
      }
      case 'show':
        for (const e of els) if (e.kind !== 'room') model.byId.get(e.id).visible = true
        notes.push(`Showed ${label}`)
        break
      case 'hide':
        for (const e of els) model.byId.get(e.id).visible = false
        notes.push(`Hid ${label}`)
        break
      case 'delete':
        for (const e of els) {
          model.byId.get(e.id).visible = false
          e.deleted = true
        }
        notes.push(`Removed ${label}`)
        break
      case 'recolor':
        for (const e of els) {
          paint(model.byId.get(e.id), { color: op.color })
          e.color = op.color
        }
        notes.push(`Painted ${label} ${op.color}`)
        break
      case 'material': {
        const preset = MATERIALS[lower(op.material)] || null
        if (!preset) {
          notes.push(`Unknown material "${op.material}".`)
          break
        }
        for (const e of els) {
          paint(model.byId.get(e.id), { ...preset, color: op.color || preset.color })
          e.material = lower(op.material)
        }
        notes.push(`Made ${label} ${lower(op.material)}`)
        break
      }
      case 'move': {
        const by = (op.by || [0, 0, 0]).map(Number)
        for (const e of els) {
          model.byId.get(e.id).position.add(new THREE.Vector3(...by))
          refreshGeometry(model, e.id)
        }
        notes.push(`Moved ${label} by ${by.map((v) => `${v}`).join(', ')} m`)
        break
      }
      case 'rotate': {
        const axis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[lower(op.axis) || 'y'] || [0, 1, 0]
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), (Number(op.degrees) || 90) * (Math.PI / 180))
        for (const e of els) {
          const g = model.byId.get(e.id)
          turnAbout(g, e, q)
          refreshGeometry(model, e.id)
        }
        notes.push(`Turned ${label} ${op.degrees || 90}° on ${(op.axis || 'y').toUpperCase()}`)
        break
      }
      case 'scale': {
        const s = Array.isArray(op.scaleBy) ? op.scaleBy.map(Number) : [Number(op.factor) || 1, Number(op.factor) || 1, Number(op.factor) || 1]
        for (const e of els) {
          scaleAbout(model.byId.get(e.id), e, s)
          refreshGeometry(model, e.id)
        }
        notes.push(`Resized ${label} ×${s.map((v) => +v.toFixed(2)).join(' × ')}`)
        break
      }
      case 'duplicate': {
        const offset = (op.offset || [1, 0, 0]).map(Number)
        const count = Math.max(1, Math.min(20, Number(op.count) || 1))
        for (const e of els) {
          const g = model.byId.get(e.id)
          for (let k = 1; k <= count; k++) {
            const copy = g.clone(true)
            meshes(copy).forEach((m) => (m.material = m.material.clone()))
            copy.position.add(new THREE.Vector3(...offset.map((v) => v * k)))
            const id = nextId--
            copy.userData.elementId = id
            g.parent.add(copy)
            model.byId.set(id, copy)
            const el = { ...e, id, name: `${e.name} copy`, hosts: [], connects: [], size: e.size && [...e.size], center: e.center && e.center.map((v, i) => v + offset[i] * k) }
            model.elements.push(el)
            created.push(id)
          }
        }
        notes.push(`Added ${plural(ids.length * count, 'copy')}`)
        break
      }
    }
    if (action !== 'highlight' && action !== 'isolate') selection = ids
  }
  if (!focus.length) focus = selection
  if (before.length || created.length) model.history.push({ snap: before, created, label: notes.join('; ') })
  if (model.history.length > 50) model.history.shift()
  return { notes, answers, selection, focus }
}

// Turn a group in place around its element's center.
function turnAbout(g, el, q) {
  if (!el.center) {
    g.quaternion.premultiply(q)
    return
  }
  const c = new THREE.Vector3(...el.center)
  const parentInv = new THREE.Matrix4().copy(g.parent.matrixWorld).invert()
  const cl = c.clone().applyMatrix4(parentInv)
  g.position.sub(cl).applyQuaternion(q).add(cl)
  g.quaternion.premultiply(q)
}

// Scale a group in place, keeping its base center fixed (so taller walls grow upward).
function scaleAbout(g, el, s) {
  if (!el.center || !el.size) {
    g.scale.multiply(new THREE.Vector3(...s))
    return
  }
  const base = new THREE.Vector3(el.center[0], el.center[1] - el.size[1] / 2, el.center[2])
  const parentInv = new THREE.Matrix4().copy(g.parent.matrixWorld).invert()
  const bl = base.applyMatrix4(parentInv)
  const sv = new THREE.Vector3(...s)
  g.position.sub(bl).multiply(sv).add(bl)
  g.scale.multiply(sv)
}
