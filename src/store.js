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
  handsSeen: 0,
  gestures: ['none', 'none'],

  set: (patch) => set(patch),
  setStatus: (kind, text = '') => set({ status: { kind, text } }),
  setSubtitle: (text, interim = false) => set({ subtitle: { text, interim, at: Date.now() } }),

  addObject: (obj) => set((s) => ({ objects: [...s.objects, obj] })),
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
  const { objects, hoverId, heldIds, environment } = useKinex.getState()
  return {
    environment,
    focus: heldIds[0] || hoverId || objects.at(-1)?.id || null,
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
