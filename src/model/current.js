import * as THREE from 'three'
import { useKinex } from '../store.js'
import { loadIfc } from './ifc.js'
import { applyOps, undo as undoOps, select } from './ops.js'
import { counts } from './manifest.js'
import { viewer } from '../lib/viewer.js'

// The real model that is open for remodeling (one at a time). Three.js objects live
// here; React only gets a small summary plus a revision number to re-render.
export const current = { model: null }

const HIGHLIGHT = new THREE.Color('#2F5BFF')
let highlighted = []

function publish(extra = {}) {
  const m = current.model
  const st = useKinex.getState()
  st.set({
    model: m ? { name: m.name, kind: m.kind, counts: counts(m.elements), storeys: m.storeys, canUndo: Boolean(m.history?.length), rev: (st.model?.rev || 0) + 1 } : null,
    ...extra,
  })
}

function meshesOf(id) {
  const g = current.model?.byId.get(id)
  const out = []
  g?.traverse((o) => o.isMesh && out.push(o))
  return out
}

// Blue tint on the selected elements; clears the previous selection.
export function setSelection(ids = []) {
  for (const m of highlighted) if (m.material?.emissive) m.material.emissive.setRGB(0, 0, 0)
  highlighted = []
  for (const id of ids) {
    for (const m of meshesOf(id)) {
      if (!m.material?.emissive) continue
      m.material = m.material.clone() // never tint a material another element shares
      m.material.emissive.copy(HIGHLIGHT)
      m.material.emissiveIntensity = 0.35
      highlighted.push(m)
    }
  }
  useKinex.getState().set({ selection: ids })
}

// Point the camera at some elements (or the whole model).
export function frame(ids) {
  const m = current.model
  if (!m || !viewer.controls) return
  const box = new THREE.Box3()
  const list = ids?.length ? ids.map((id) => m.byId.get(id)).filter((g) => g?.visible !== false) : [m.root]
  for (const g of list) box.expandByObject(g)
  if (box.isEmpty()) return
  viewer.controls.fitToBox(box, true, { paddingTop: 0.6, paddingBottom: 0.6, paddingLeft: 0.6, paddingRight: 0.6 })
}

function openLimits() {
  const c = viewer.controls
  if (!c) return
  Object.assign(c, { minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: 0.5, maxDistance: 200 })
}

export async function openIfc(buffer, name) {
  const st = useKinex.getState()
  st.set({ modelLoading: name })
  try {
    closeModel(false)
    current.model = await loadIfc(buffer, name)
    current.model.history = []
    publish({ modelLoading: null, selection: [], inspectId: null })
    openLimits()
    setTimeout(() => {
      frame()
      viewer.controls?.rotate(0.6, -0.15, true)
    }, 60)
    const c = counts(current.model.elements)
    return c
  } catch (err) {
    console.error('[kinex] could not open model', err)
    st.set({ modelLoading: null })
    throw err
  }
}

export async function openSampleHouse() {
  const res = await fetch(`${import.meta.env.BASE_URL}models/duplex.ifc`)
  return openIfc(await res.arrayBuffer(), 'Duplex Apartment')
}

export function closeModel(update = true) {
  highlighted = []
  current.model = null
  if (update) {
    publish({ selection: [] })
    viewer.controls?.setLookAt(0, 4.2, 13, 0, 1.1, 0, true)
    Object.assign(viewer.controls || {}, { minPolarAngle: 0.05, maxPolarAngle: Math.PI / 2.08, minDistance: 5, maxDistance: 24 })
  }
}

// Runs edit operations (from the chat or the panel) and updates selection + view.
export function run(ops, { focus = true } = {}) {
  const m = current.model
  if (!m) return { notes: [], answers: [], selection: [] }
  const res = applyOps(m, ops)
  setSelection(res.selection.filter((id) => !m.elements.find((e) => e.id === id)?.deleted))
  publish()
  const shows = ops.some((o) => ['highlight', 'isolate', 'query'].includes(o.action))
  if (focus && shows && res.focus.length) frame(res.focus)
  return res
}

export function undo() {
  const m = current.model
  if (!m) return null
  const label = undoOps(m)
  setSelection([])
  publish()
  return label
}

// Everything visible again (keeps deletions, which Undo brings back).
export function showAll() {
  const m = current.model
  if (!m) return
  const hidden = m.elements.filter((e) => !e.deleted && e.kind !== 'room' && m.byId.get(e.id)?.visible === false).map((e) => e.id)
  if (hidden.length) run([{ action: 'show', select: { ids: hidden } }], { focus: false })
  frame()
}

export const elementById = (id) => current.model?.elements.find((e) => e.id === id) || null
export const idsWhere = (sel) => (current.model ? select(current.model, sel) : [])
