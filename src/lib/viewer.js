import * as THREE from 'three'
import { useKinex } from '../store.js'
import { inspectPose } from '../scene/interaction.js'

// Camera + Inspect controller. Stage registers the CameraControls instance here so
// UI, voice and hands can all drive the same camera.
export const viewer = { controls: null, camera: null, saved: null }

const WORLD_LIMITS = { minPolarAngle: 0.05, maxPolarAngle: Math.PI / 2.08, minDistance: 5, maxDistance: 24 }
const INSPECT_LIMITS = { minPolarAngle: 0, maxPolarAngle: Math.PI, minDistance: 0.4, maxDistance: 40 }
const DEG = Math.PI / 180

// Axis-aligned bounds of an object's parts in its own frame (unscaled). Rotated parts
// count with their full diagonal so nothing pokes outside.
export function partsBounds(parts) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of parts) {
    const rotated = p.rotation?.some((r) => Math.abs(r) > 0.01)
    const half = rotated ? Array(3).fill(Math.hypot(...p.size) / 2) : p.size.map((s) => s / 2)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.position[i] - half[i])
      max[i] = Math.max(max[i], p.position[i] + half[i])
    }
  }
  if (!parts.length) return { center: [0, 0.5, 0], size: [1, 1, 1], radius: 0.9 }
  const center = min.map((m, i) => (m + max[i]) / 2)
  const size = min.map((m, i) => max[i] - m)
  return { center, size, radius: Math.hypot(...size) / 2 }
}

// Where the inspected model floats: centered, resting just above the studio floor.
export function inspectAnchor(obj) {
  const r = partsBounds(obj.parts).radius * obj.scale
  return { position: new THREE.Vector3(0, r + 0.15, 0), radius: r }
}

function applyLimits(limits) {
  const c = viewer.controls
  if (!c) return
  Object.assign(c, limits)
}

function distanceFor(radius) {
  const fov = (viewer.camera?.fov ?? 40) * DEG
  return (radius / Math.sin(fov / 2)) * 1.15
}

export function enterInspect(id) {
  const st = useKinex.getState()
  const obj = st.objects.find((o) => o.id === id)
  if (!obj || !viewer.controls) return
  if (!st.inspectId) {
    viewer.saved = {
      position: viewer.controls.getPosition(new THREE.Vector3()),
      target: viewer.controls.getTarget(new THREE.Vector3()),
    }
  }
  inspectPose.q.identity()
  inspectPose.targetQ.identity()
  st.set({ inspectId: id, lastId: id, hoverId: null })
  st.setInspect({ explode: 0, wireframe: false, spin: false, focusPart: null })
  applyLimits(INSPECT_LIMITS)
  snapView('iso')
}

export function exitInspect() {
  const st = useKinex.getState()
  if (!st.inspectId) return
  st.set({ inspectId: null })
  st.setInspect({ explode: 0, wireframe: false, spin: false, focusPart: null })
  applyLimits(WORLD_LIMITS)
  const s = viewer.saved
  if (s) viewer.controls?.setLookAt(s.position.x, s.position.y, s.position.z, s.target.x, s.target.y, s.target.z, true)
  viewer.saved = null
}

const VIEWS = {
  iso: [1, 0.75, 1.25],
  front: [0, 0, 1],
  back: [0, 0, -1],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
  right: [1, 0, 0],
  left: [-1, 0, 0],
}
VIEWS.side = VIEWS.right

// Points the camera along an axis at the inspected model, or at the world.
export function snapView(name) {
  const c = viewer.controls
  const dir = VIEWS[name]
  if (!c || !dir) return
  const st = useKinex.getState()
  const obj = st.objects.find((o) => o.id === st.inspectId)
  let target
  let dist
  if (obj) {
    const a = inspectAnchor(obj)
    target = a.position
    dist = distanceFor(a.radius)
  } else {
    target = c.getTarget(new THREE.Vector3())
    dist = c.getPosition(new THREE.Vector3()).distanceTo(target)
    if (name === 'bottom') return // the floor is in the way
  }
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist)
  c.setLookAt(target.x + d.x, target.y + d.y, target.z + d.z, target.x, target.y, target.z, true)
  useKinex.getState().setInspect({ focusPart: null })
}

const _q = new THREE.Quaternion()
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }

// Turns the inspected model about a world axis (animated by InspectView).
export function rotateModel(axis, degrees) {
  const a = AXES[axis]
  if (!a) return
  inspectPose.targetQ.premultiply(_q.setFromAxisAngle(a, degrees * DEG)).normalize()
}

// Turns the model about an arbitrary world axis by radians (hands use camera axes).
export function rotateModelAbout(axisVec, radians) {
  inspectPose.targetQ.premultiply(_q.setFromAxisAngle(axisVec, radians)).normalize()
}

export function resetModelRotation() {
  inspectPose.targetQ.identity()
}

// Zoom the camera onto one part of the inspected model.
export function focusPart(mesh, index) {
  if (!viewer.controls || !mesh) return
  viewer.controls.fitToBox(mesh, true, { paddingTop: 0.4, paddingBottom: 0.4, paddingLeft: 0.4, paddingRight: 0.4 })
  useKinex.getState().setInspect({ focusPart: index })
}
