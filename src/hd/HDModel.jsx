import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { partsBounds } from '../lib/viewer.js'

const gltf = new GLTFLoader()
const cache = new Map() // url -> Promise<THREE.Object3D>

// Loads a model by format: glb / gltf (generated or imported), obj, stl.
export function loadModel(url, format = 'glb') {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        if (format === 'obj') {
          import('three/examples/jsm/loaders/OBJLoader.js').then(({ OBJLoader }) => new OBJLoader().load(url, resolve, undefined, reject))
        } else if (format === 'stl') {
          import('three/examples/jsm/loaders/STLLoader.js').then(({ STLLoader }) =>
            new STLLoader().load(
              url,
              (geo) => {
                geo.computeVertexNormals()
                resolve(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#B8BFCC', roughness: 0.45, metalness: 0.1 })))
              },
              undefined,
              reject,
            ),
          )
        } else gltf.load(url, (g) => resolve(g.scene), undefined, reject)
      }),
    )
  }
  return cache.get(url)
}

// Fits a generated mesh into the space its block version occupies: same footprint
// center, resting on the same base, longest side matching.
function fit(scene, parts) {
  const target = partsBounds(parts)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const s = Math.max(...target.size) / Math.max(size.x, size.y, size.z, 1e-6)
  const center = box.getCenter(new THREE.Vector3())
  const minY = target.center[1] - target.size[1] / 2
  return {
    scale: s,
    position: [target.center[0] - center.x * s, Math.max(0, minY) - box.min.y * s, target.center[2] - center.z * s],
  }
}

// Renders an HD (generated or imported) model in place of the block parts.
// `fallback` (the block version) stays on screen until the mesh has loaded.
export function HDModel({ url, format = 'glb', parts, wireframe = false, born, fallback = null }) {
  const [scene, setScene] = useState(null)
  const group = useRef()
  const appearAt = useRef(null)

  useEffect(() => {
    let live = true
    loadModel(url, format)
      .then((s) => {
        if (!live) return
        // Own materials per copy, so wireframe in Inspect doesn't leak into the world.
        const copy = s.clone(true)
        copy.traverse((o) => {
          if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone()
        })
        setScene(copy)
      })
      .catch((e) => console.warn('[kinex] HD model failed to load', e))
    return () => {
      live = false
    }
  }, [url, format])

  useEffect(() => {
    scene?.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => m && (m.wireframe = wireframe))
    })
  }, [scene, wireframe])

  const placement = useMemo(() => (scene ? fit(scene, parts) : null), [scene, parts])

  // A short grow-in so the swap from blocks to the real model reads as an upgrade.
  useFrame(() => {
    if (!group.current || !placement) return
    appearAt.current ??= born ?? performance.now()
    const t = Math.min(1, (performance.now() - appearAt.current) / 600)
    const e = 1 - Math.pow(1 - t, 3)
    group.current.scale.setScalar(placement.scale * (0.6 + 0.4 * e))
  })

  if (!scene || !placement) return fallback
  return (
    <group ref={group} position={placement.position} scale={placement.scale * 0.6}>
      <primitive object={scene} />
    </group>
  )
}
