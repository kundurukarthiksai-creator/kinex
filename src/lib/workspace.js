import { useKinex, bodies, newId, MAX_OBJECTS } from '../store.js'
import { sanitizePart } from '../ai/apply.js'
import { PHYSICS, BEHAVIORS, PRESETS, GRAVITY } from '../ai/schema.js'
import { loadStarter } from './starters.js'
import { MODEL_CATALOG, modelURL } from '../hd/catalog.js'

const DB = 'kinex-studio-workspace'
const STORE = 'workspace'
const assetCache = new Map()
let database
let saveQueue = Promise.resolve()
let revision = 0

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Workspace storage is unavailable.'))
  })
  return database
}

async function readWorkspace() {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function writeWorkspace(value) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(value, 'current')
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export function serializeObjects(objects, liveBodies = bodies) {
  return objects.filter((o) => !o.building).map((o) => {
    const body = liveBodies.get(o.id)
    const t = body?.translation()
    const q = body?.rotation()
    return {
      ...o,
      position: t ? [t.x, Math.max(0, t.y - 0.02), t.z] : [...o.position],
      quaternion: q ? [q.x, q.y, q.z, q.w] : o.quaternion,
      born: 0,
      building: false,
      source: { kind: o.source?.kind, text: o.source?.text || o.name, ...(o.source?.file ? { file: o.source.file } : {}), ...(o.source?.assetId ? {assetId:o.source.assetId,kind:o.source.kind} : {}) },
      parts: o.parts.map(({ born, ...part }) => part),
    }
  })
}

export function normalizeSavedObjects(objects) {
  if (!Array.isArray(objects) || objects.length > MAX_OBJECTS) throw new Error('Invalid saved world.')
  const ids = new Map()
  const normalized = objects.map((o) => {
    if (!o || !Array.isArray(o.parts) || !o.parts.length || o.parts.length > 96) throw new Error('Invalid saved model.')
    const name = String(o.name || 'Object').slice(0, 40)
    const id = newId(name)
    ids.set(o.id, id)
    const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback
    const clamp = (value, lo, hi, fallback = 0) => Math.min(hi, Math.max(lo, number(value, fallback)))
    return {
      id, name,
      position: [clamp(o.position?.[0], -10, 10), clamp(o.position?.[1], 0, 8), clamp(o.position?.[2], -9, 6)],
      quaternion: Array.isArray(o.quaternion) && o.quaternion.length === 4 && o.quaternion.every(Number.isFinite) && Math.hypot(...o.quaternion) > 0.1 ? o.quaternion.map((v) => v / Math.hypot(...o.quaternion)) : undefined,
      rotationY: number(o.rotationY),
      scale: clamp(o.scale, 0.15, 6, 1),
      physics: PHYSICS.includes(o.physics) ? o.physics : 'dynamic',
      behavior: { kind: BEHAVIORS.includes(o.behavior?.kind) ? o.behavior.kind : 'none', speed: clamp(o.behavior?.speed, 0.1, 4, 1), targetId: o.behavior?.targetId },
      parts: o.parts.map((part) => sanitizePart({ ...part, rotation: (part.rotation || [0, 0, 0]).map((v) => number(v) * 180 / Math.PI) })),
      rev: 0, born: 0,
      appearance: {partColors:Object.fromEntries(Object.entries(o.appearance?.partColors || {}).filter(([key,value]) => MODEL_CATALOG.find((asset)=>asset.id===o.source?.assetId)?.colorParts?.includes(key) && /^#[0-9a-f]{6}$/i.test(value))),color:typeof o.appearance?.color==='string'&&/^#[0-9a-f]{6}$/i.test(o.appearance.color)?o.appearance.color:undefined,material:['metal','matte','plastic','glass','wood','glow'].includes(o.appearance?.material)?o.appearance.material:undefined},
      source: { kind:['generated','offline','photo'].includes(o.source?.kind)?o.source.kind:undefined, text: String(o.source?.text || name).slice(0, 2000), ...(o.source?.file ? { file: String(o.source.file).slice(0, 200) } : {}), ...(MODEL_CATALOG.some((asset)=>asset.id===o.source?.assetId)?(() => { const a=MODEL_CATALOG.find((asset)=>asset.id===o.source.assetId); return {assetId:a.id,kind:a.kind||'library',author:a.author,license:a.license,url:a.source,colorParts:a.colorParts} })():{}) },
    }
  })
  normalized.forEach((o) => { o.behavior.targetId = ids.get(o.behavior.targetId) || null })
  return { objects: normalized, ids }
}

export function saveWorkspace() {
  const ticket = ++revision
  const st = useKinex.getState()
  const objects = serializeObjects(st.objects)
  const environment = { ...st.environment }
  const projectName = st.projectName
  const preferences = { renderQuality: st.renderQuality, showGrid: st.showGrid }
  const meshes = objects.map((o) => [o.id, st.hd[o.id]]).filter(([, h]) => h?.status === 'ready' && h.url)
  st.set({ saveState: 'saving' })
  const task = async () => {
    const assets = await Promise.all(meshes.map(async ([id, h]) => {
      if(h.libraryAsset)return {id,libraryAsset:h.libraryAsset,show:h.show}
      let blob = assetCache.get(h.url)
      if (!blob) {
        const response = await fetch(h.url)
        if (!response.ok) throw new Error('Could not save a model.')
        blob = await response.blob()
        assetCache.set(h.url, blob)
      }
      return { id, blob, format: h.format || 'glb', name: h.name, show: h.show, imported: h.imported }
    }))
    await writeWorkspace({ version: 1, projectName, objects, environment, assets, preferences })
    if (ticket === revision) useKinex.getState().set({ saveState: 'saved', savedAt: Date.now() })
  }
  saveQueue = saveQueue.catch(() => {}).then(task).catch((error) => {
    console.warn('[kinex] local save failed:', error.message)
    if (ticket === revision) useKinex.getState().set({ saveState: 'error' })
  })
  return saveQueue
}

export async function initializeWorkspace() {
  try {
    const saved = await readWorkspace()
    if (saved?.version === 1) {
      const { objects, ids } = normalizeSavedObjects(saved.objects)
      const hd = {}
      for (const asset of saved.assets || []) {
        const id = ids.get(asset.id)
        const library = MODEL_CATALOG.find((model)=>model.id===asset.libraryAsset)
        if(id&&library){hd[id]={status:'ready',url:modelURL(library),format:'glb',name:library.name,show:asset.show,libraryAsset:library.id,progress:100,dismissed:true};continue}
        if (!id || !(asset.blob instanceof Blob)) continue
        const url = URL.createObjectURL(asset.blob)
        assetCache.set(url, asset.blob)
        hd[id] = { status: 'ready', url, format: asset.format, name: asset.name, show: asset.show, imported: asset.imported, progress: 100, dismissed: true }
      }
      useKinex.getState().set({ objects, hd, projectName: String(saved.projectName || 'Untitled world').slice(0, 60), lastId: objects[0]?.id || null, environment: { preset: PRESETS.includes(saved.environment?.preset) ? saved.environment.preset : 'studio', gravity: GRAVITY.includes(saved.environment?.gravity) ? saved.environment.gravity : 'normal' }, saveState: 'saved', savedAt: Date.now() })
      useKinex.getState().set({ renderQuality: saved.preferences?.renderQuality === 'balanced' ? 'balanced' : 'high', showGrid: saved.preferences?.showGrid !== false })
    } else loadStarter('orbit', { record: false })
  } catch {
    loadStarter('orbit', { record: false })
    useKinex.getState().set({ saveState: 'error' })
  }
  useKinex.getState().set({ workspaceReady: true })
  let timer
  const schedule = () => {
    clearTimeout(timer)
    useKinex.getState().set({ saveState: 'saving' })
    timer = setTimeout(() => {
      if (useKinex.getState().status.kind === 'thinking') { schedule(); return }
      saveWorkspace()
    }, 900)
  }
  const unsubscribe = useKinex.subscribe((state, previous) => {
    if (state.objects !== previous.objects || state.environment !== previous.environment || state.hd !== previous.hd || state.projectName !== previous.projectName || state.renderQuality !== previous.renderQuality || state.showGrid !== previous.showGrid || (previous.heldIds.length && !state.heldIds.length) || (previous.status.kind === 'thinking' && state.status.kind !== 'thinking')) schedule()
  })
  if (useKinex.getState().saveState !== 'error') schedule()
  return () => { clearTimeout(timer); unsubscribe() }
}
