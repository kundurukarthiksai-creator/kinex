import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { ASSEMBLY_STAGGER, ASSEMBLY_PART_MS } from './interaction.js'

// Every geometry fits a 1x1x1 box centered at the origin, so part.size is just mesh.scale.
const GEOMETRIES = {
  box: () => new RoundedBoxGeometry(1, 1, 1, 3, 0.05),
  sphere: () => new THREE.SphereGeometry(0.5, 40, 24),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
  cone: () => new THREE.ConeGeometry(0.5, 1, 40),
  pyramid: () => new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4),
  dome: () => new THREE.SphereGeometry(0.5, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0),
  torus: () => new THREE.TorusGeometry(0.35, 0.15, 20, 48).scale(1, 1, 1 / 0.3),
  capsule: () => new THREE.CapsuleGeometry(0.5, 1, 8, 24).scale(1, 0.5, 1),
  icosahedron: () => new THREE.IcosahedronGeometry(0.5, 0),
}
const geoCache = {}
export const geometryFor = (shape) => (geoCache[shape] ??= (GEOMETRIES[shape] || GEOMETRIES.box)())

export function makeMaterial(color, kind) {
  const c = new THREE.Color(color)
  switch (kind) {
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.85, metalness: 0 })
    case 'metal':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.9 })
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.4, ior: 1.4 })
    case 'glow':
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, toneMapped: false })
    case 'wood':
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.72, metalness: 0, sheen: 0.3 })
    default: // plastic
      return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 })
  }
}

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const backOut = (t) => {
  const s = 1.6
  const x = t - 1
  return x * x * ((s + 1) * x + s) + 1
}
const HOVER = new THREE.Color('#2F5BFF')

// `explode` (optional) is a shared {k} the inspector animates; parts then slide away
// from `center` by k. `wireframe` shows the mesh structure.
export function Part({ part, index, born, hovered, explode, center, wireframe = false }) {
  const ref = useRef()
  const done = useRef(reduceMotion)
  const material = useMemo(() => makeMaterial(part.color, part.material), [part.color, part.material])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    if (part.material === 'glow') return
    material.emissive.copy(hovered ? HOVER : new THREE.Color(0))
    material.emissiveIntensity = hovered ? 0.18 : 0
  }, [hovered, material, part.material])

  useEffect(() => {
    material.wireframe = wireframe
  }, [wireframe, material])

  const offset = (k) => {
    if (!explode || !center || !k) return [0, 0, 0]
    return [0, 1, 2].map((i) => (part.position[i] - center[i]) * k * 0.6)
  }

  // Transforms are driven imperatively; passing them as props would reset the
  // assembly animation on every re-render.
  useLayoutEffect(() => {
    if (!ref.current) return
    if (!done.current) {
      ref.current.position.set(part.position[0], part.position[1] + 1.4, part.position[2])
      ref.current.scale.setScalar(0.0001)
      return
    }
    const o = offset(explode?.k)
    ref.current.position.set(part.position[0] + o[0], part.position[1] + o[1], part.position[2] + o[2])
    ref.current.scale.set(...part.size)
  }, [part])

  useFrame(() => {
    const r = ref.current
    if (!r) return
    const o = offset(explode?.k)
    const [x, y, z] = part.position
    if (done.current) {
      if (explode) r.position.set(x + o[0], y + o[1], z + o[2])
      return
    }
    const start = part.born ?? born + index * ASSEMBLY_STAGGER
    const t = Math.min(1, Math.max(0, (performance.now() - start) / ASSEMBLY_PART_MS))
    const e = t === 0 ? 0 : backOut(t)
    r.position.set(x + o[0], y + o[1] + (1 - Math.min(e, 1)) * 1.4, z + o[2])
    const s = Math.max(0.0001, e)
    r.scale.set(part.size[0] * s, part.size[1] * s, part.size[2] * s)
    if (t >= 1) {
      r.position.set(x + o[0], y + o[1], z + o[2])
      r.scale.set(...part.size)
      done.current = true
    }
  })

  return (
    <mesh
      ref={ref}
      geometry={geometryFor(part.shape)}
      material={material}
      rotation={part.rotation}
      userData={{ partIndex: index }}
      castShadow
      receiveShadow
    />
  )
}
