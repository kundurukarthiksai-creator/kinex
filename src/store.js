import { create } from 'zustand'

let seq = 0
export const newId = (name = 'thing') =>
  `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'thing'}-${++seq}`

// Rapier rigid bodies + three groups, keyed by object id. Kept outside React so
// hand tracking can move things every frame without re-rendering anything.
export const bodies = new Map()
export const groups = new Map()

export const useKinex = create((set, get) => ({
  objects: [],
  bursts: [],
  environment: { preset: 'studio', gravity: 'normal' },
  hoverId: null,
  heldIds: [],
  status: { kind: 'idle', text: '' }, // idle | thinking | listening | error | done
  subtitle: { text: '', interim: false, at: 0 },
  narration: '',
  listening: false,
  scanning: false,
  camera: 'off', // off | starting | on | denied
  lastId: null, // the object you touched or built most recently
  inspectId: null, // object open in Inspect mode
  inspect: { explode: 0, wireframe: false, spin: false, focusPart: null, refining: false },
  // HD meshes by object id: { status: image|queued|meshing|ready|failed, stage, progress,
  // queue, image (data URL it is built from), url (GLB blob URL), startedAt, error, show }
  hd: {},
  chatOpen: true,
  handsOn: false, // camera + hand gestures, switched on from the top bar
  // { id, role: 'user'|'assistant', text, status: 'working'|'done'|'error', notes: [string] }
  chat: [],
  handsSeen: 0,
  gestures: ['none', 'none'],

  set: (patch) => set(patch),
  setStatus: (kind, text = '') => set({ status: { kind, text } }),
  setSubtitle: (text, interim = false) => set({ subtitle: { text, interim, at: Date.now() } }),

  addObject: (obj) => set((s) => ({ objects: [...s.objects, obj], lastId: obj.id })),
  setInspect: (patch) => set((s) => ({ inspect: { ...s.inspect, ...patch } })),
  setHD: (id, patch) => set((s) => ({ hd: { ...s.hd, [id]: { ...s.hd[id], ...patch } } })),
  say: (role, text, extra = {}) => {
    const msg = { id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`, role, text, status: 'done', notes: [], ...extra }
    set((s) => ({ chat: [...s.chat.slice(-60), msg] }))
    return msg.id
  },
  editMessage: (id, patch) => set((s) => ({ chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  updateObject: (id, patch) =>
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch, rev: (o.rev || 0) + 1 } : o)) })),
  removeObject: (id, withBurst = true) => {
    const o = get().objects.find((x) => x.id === id)
    if (!o) return
    const body = bodies.get(id)
    const p = body ? body.translation() : { x: o.position[0], y: o.position[1], z: o.position[2] }
    set((s) => ({
      objects: s.objects.filter((x) => x.id !== id),
      hoverId: s.hoverId === id ? null : s.hoverId,
      lastId: s.lastId === id ? null : s.lastId,
      bursts: withBurst
        ? [...s.bursts, { id: `b${Date.now()}${Math.random()}`, at: [p.x, p.y + 0.5, p.z], color: dominantColor(o) }]
        : s.bursts,
    }))
  },
  removeBurst: (id) => set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),
  clear: () => {
    const { objects, removeObject } = get()
    objects.forEach((o) => removeObject(o.id))
  },
}))

export function dominantColor(obj) {
  const weight = {}
  for (const p of obj.parts) {
    const v = p.size[0] * p.size[1] * p.size[2]
    weight[p.color] = (weight[p.color] || 0) + v
  }
  return Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || '#8890A6'
}

// Compact scene description for the model, so "it", "this" and "the red one" resolve.
export function describeScene() {
  const { objects, hoverId, heldIds, environment, inspectId, lastId } = useKinex.getState()
  return {
    environment,
    focus: inspectId || heldIds[0] || hoverId || lastId || objects.at(-1)?.id || null,
    objects: objects.map((o) => {
      const b = bodies.get(o.id)
      const t = b ? b.translation() : { x: o.position[0], y: o.position[1], z: o.position[2] }
      return {
        id: o.id,
        name: o.name,
        color: dominantColor(o),
        position: [t.x, t.y, t.z].map((n) => Math.round(n * 10) / 10),
        scale: Math.round(o.scale * 100) / 100,
        behavior: o.behavior.kind,
      }
    }),
  }
}

const r2 = (n) => Math.round(n * 100) / 100
const deg = (r) => Math.round((r * 180) / Math.PI)

// The model being worked on, part by part with indices, so the AI can edit it.
export function describeFocus() {
  const { objects, inspectId, heldIds, hoverId, lastId } = useKinex.getState()
  const id = inspectId || heldIds[0] || hoverId || lastId || objects.at(-1)?.id
  const o = objects.find((x) => x.id === id)
  if (!o) return null
  return {
    id: o.id,
    name: o.name,
    parts: o.parts.map((p, i) => [i, p.shape, p.size.map(r2), p.position.map(r2), p.rotation.map(deg), p.color, p.material]),
  }
}
