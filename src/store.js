import { create } from 'zustand'

let seq = 0
let transactionSeq = 0
const HISTORY_LIMIT = 30
export const newId = (name = 'thing') =>
  `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'thing'}-${Date.now().toString(36)}-${++seq}`

export const bodies = new Map()
export const groups = new Map()

export function sceneSnapshot(state, liveBodies = bodies) {
  const objects = state.objects.filter((object) => !object.building).map((object) => {
    const body = liveBodies.get(object.id)
    const position = body?.translation()
    const rotation = body?.rotation()
    return {
      ...object,
      position: position ? [position.x, Math.max(0, position.y - 0.02), position.z] : [...object.position],
      quaternion: rotation ? [rotation.x, rotation.y, rotation.z, rotation.w] : object.quaternion,
      born: 0,
      building: false,
      parts: object.parts.map(({ born, ...part }) => part),
    }
  })
  return {
    objects, environment: { ...state.environment }, projectName: state.projectName,
    lastId: state.lastId, hd: Object.fromEntries(objects.filter((object) => state.hd[object.id]).map((object) => [object.id, { ...state.hd[object.id] }])),
  }
}

export const useKinex = create((set, get) => {
  const restore = (snapshot, extra = {}) => {
    const current = get()
    const hd = { ...snapshot.hd }
    for (const object of snapshot.objects) {
      if (current.hd[object.id]?.status === 'ready' && hd[object.id]?.status !== 'ready') hd[object.id] = current.hd[object.id]
    }
    set({ ...snapshot, hd, objects: snapshot.objects.map((object) => ({ ...object })), hoverId: null, heldIds: [], bursts: [], inspectId: null,
      inspect: { explode: 0, wireframe: false, spin: false, focusPart: null, refining: false }, worldEpoch: current.worldEpoch + 1, ...extra })
  }
  const recordMutation = (label, change) => {
    const before = get().transaction ? null : sceneSnapshot(get())
    const previous = get()
    set(change)
    const after = get()
    if (before && (previous.objects !== after.objects || previous.environment !== after.environment)) {
      set({ past: [...after.past, { label, before, after: sceneSnapshot(after) }].slice(-HISTORY_LIMIT), future: [] })
    }
  }
  return {
    objects: [], projectName: 'Orbital playground', workspaceReady: false, saveState: 'saving', savedAt: null,
    showGrid: true, handTool: 'move', renderQuality: 'high', worldEpoch: 0,
    past: [], future: [], transaction: null,
    environment: { preset: 'studio', gravity: 'normal' }, bursts: [], hoverId: null, heldIds: [],
    status: { kind: 'idle', text: '' }, subtitle: { text: '', interim: false, at: 0 }, narration: '',
    listening: false, voiceState: 'idle', voiceError: '', scanning: false,
    camera: 'off', cameraError: '', handsSeen: 0, gestures: ['none', 'none'],
    trackingMode: 'off', trackingFPS: 0, interactionMessage: '',
    aiState: 'ready', operation: null, lastOperation: null,
    lastId: null, inspectId: null,
    inspect: { explode: 0, wireframe: false, spin: false, focusPart: null, refining: false },
    hd: {},
    lesson: null, lessonChecks: {}, demo: null,

    set: (patch) => set(patch),
    setStatus: (kind, text = '') => set({ status: { kind, text } }),
    setSubtitle: (text, interim = false) => set({ subtitle: { text, interim, at: Date.now() } }),
    beginChange: (label) => {
      const state = get()
      if (state.transaction) return null
      const token = ++transactionSeq
      set({ transaction: { token, label, before: sceneSnapshot(state), objects: state.objects, environment: state.environment, hd: state.hd, projectName: state.projectName } })
      return token
    },
    commitChange: (token) => {
      const state = get(), transaction = state.transaction
      if (!transaction || transaction.token !== token) return
      const changed = transaction.objects !== state.objects || transaction.environment !== state.environment || transaction.hd !== state.hd || transaction.projectName !== state.projectName
      set({ transaction: null, ...(changed ? { past: [...state.past, { label: transaction.label, before: transaction.before, after: sceneSnapshot(state) }].slice(-HISTORY_LIMIT), future: [] } : {}) })
    },
    cancelChange: (token) => {
      const transaction = get().transaction
      if (transaction?.token !== token) return
      restore(transaction.before, { transaction: null })
    },
    undo: () => {
      const state = get()
      if (state.transaction || state.status.kind === 'thinking' || !state.past.length) return false
      const entry = state.past.at(-1)
      restore(entry.before, { past: state.past.slice(0, -1), future: [...state.future, entry], narration: `Undid: ${entry.label}.`, status: { kind: 'done', text: '' } })
      return true
    },
    redo: () => {
      const state = get()
      if (state.transaction || state.status.kind === 'thinking' || !state.future.length) return false
      const entry = state.future.at(-1)
      restore(entry.after, { past: [...state.past, entry], future: state.future.slice(0, -1), narration: `Redid: ${entry.label}.`, status: { kind: 'done', text: '' } })
      return true
    },
    addObject: (object) => recordMutation(`Create ${object.name}`, (state) => ({ objects: [...state.objects, object], lastId: object.id })),
    updateObject: (id, patch) => {
      if (!get().objects.some((object) => object.id === id)) return
      recordMutation('Edit object', (state) => ({ objects: state.objects.map((object) => object.id === id ? { ...object, ...patch, rev: (object.rev || 0) + 1 } : object) }))
    },
    removeObject: (id, withBurst = true) => {
      const object = get().objects.find((item) => item.id === id)
      if (!object) return
      const position = bodies.get(id)?.translation() || { x: object.position[0], y: object.position[1], z: object.position[2] }
      recordMutation(`Delete ${object.name}`, (state) => ({
        objects: state.objects.filter((item) => item.id !== id), hoverId: state.hoverId === id ? null : state.hoverId,
        lastId: state.lastId === id ? state.objects.find((item) => item.id !== id)?.id || null : state.lastId,
        inspectId: state.inspectId === id ? null : state.inspectId,
        bursts: withBurst ? [...state.bursts, { id: `b${Date.now()}${Math.random()}`, at: [position.x, position.y + 0.5, position.z], color: dominantColor(object) }] : state.bursts,
      }))
    },
    clear: () => {
      const token = get().beginChange('Clear world')
      get().objects.forEach((object) => get().removeObject(object.id))
      if (token) get().commitChange(token)
    },
    setEnvironment: (patch) => {
      const environment = { ...get().environment, ...patch }
      if (JSON.stringify(environment) === JSON.stringify(get().environment)) return
      recordMutation('Change environment', { environment })
    },
    setInspect: (patch) => set((state) => ({ inspect: { ...state.inspect, ...patch } })),
    setHD: (id, patch) => set((state) => ({ hd: { ...state.hd, [id]: { ...state.hd[id], ...patch } } })),
    removeBurst: (id) => set((state) => ({ bursts: state.bursts.filter((burst) => burst.id !== id) })),
  }
})

export function dominantColor(object) {
  const weight = {}
  for (const part of object.parts) {
    const volume = part.size[0] * part.size[1] * part.size[2]
    weight[part.color] = (weight[part.color] || 0) + volume
  }
  return Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || '#8890A6'
}

export function describeScene() {
  const { objects, hoverId, heldIds, environment, inspectId, lastId } = useKinex.getState()
  return {
    environment, focus: inspectId || heldIds[0] || hoverId || lastId || objects.at(-1)?.id || null,
    objects: objects.map((object) => {
      const position = bodies.get(object.id)?.translation() || { x: object.position[0], y: object.position[1], z: object.position[2] }
      return { id: object.id, name: object.name, color: dominantColor(object), position: [position.x, position.y, position.z].map((number) => Math.round(number * 10) / 10), scale: Math.round(object.scale * 100) / 100, behavior: object.behavior.kind, assetId: object.source?.assetId }
    }),
  }
}
