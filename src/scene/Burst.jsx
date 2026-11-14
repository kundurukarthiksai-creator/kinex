import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useKinex } from '../store.js'

const COUNT = 28
const LIFE = 0.9
const geo = new THREE.IcosahedronGeometry(0.09, 0)
const dummy = new THREE.Object3D()

function Burst({ burst }) {
  const mesh = useRef()
  const t0 = useRef(null)
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: burst.color, roughness: 0.4 }), [burst.color])
  const shards = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const dir = new THREE.Vector3().randomDirection()
        dir.y = Math.abs(dir.y) + 0.3
        return { v: dir.multiplyScalar(3 + Math.random() * 4), r: new THREE.Vector3().random().multiplyScalar(8), s: 0.6 + Math.random() }
      }),
    [],
  )

  useFrame((state) => {
    if (!mesh.current) return
    t0.current ??= state.clock.elapsedTime
    const t = state.clock.elapsedTime - t0.current
    if (t > LIFE) {
      useKinex.getState().removeBurst(burst.id)
      return
    }
    const fade = 1 - t / LIFE
    shards.forEach((sh, i) => {
      dummy.position.set(burst.at[0] + sh.v.x * t, burst.at[1] + sh.v.y * t - 4.9 * t * t, burst.at[2] + sh.v.z * t)
      dummy.rotation.set(sh.r.x * t, sh.r.y * t, sh.r.z * t)
      dummy.scale.setScalar(sh.s * fade)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geo, material, COUNT]} castShadow frustumCulled={false} />
}

export function Bursts() {
  const bursts = useKinex((s) => s.bursts)
  return bursts.map((b) => <Burst key={b.id} burst={b} />)
}
