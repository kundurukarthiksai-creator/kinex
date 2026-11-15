import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useKinex } from '../store.js'
import { Part } from './Part.jsx'
import { inspectPose } from './interaction.js'
import { partsBounds, inspectAnchor, focusPart, rotateModelAbout } from '../lib/viewer.js'
import { world } from '../lib/exportGltf.js'
import { HDModel } from '../hd/HDModel.jsx'

const UP = new THREE.Vector3(0, 1, 0)
const AXIS_COLORS = { x: '#E5484D', y: '#3FA36B', z: '#2F5BFF' }

// The model's own X / Y / Z axes through its center. They turn with the model, so
// you can see which axis a rotation is about.
function Axes({ length }) {
  const lines = useRef([])
  useFrame(() => {
    const turning = inspectPose.q.angleTo(inspectPose.targetQ) > 0.01
    lines.current.forEach((l) => {
      if (!l) return
      const target = turning ? 0.95 : 0.4
      l.material.opacity += (target - l.material.opacity) * 0.15
    })
  })
  const axes = [
    ['x', [length, 0, 0]],
    ['y', [0, length, 0]],
    ['z', [0, 0, length]],
  ]
  return axes.map(([name, end], i) => (
    <group key={name}>
      <Line
        ref={(l) => (lines.current[i] = l)}
        points={[end.map((v) => -v), end]}
        color={AXIS_COLORS[name]}
        lineWidth={2}
        transparent
        opacity={0.4}
        depthTest={false}
        renderOrder={10}
      />
      <Html position={end} center style={{ pointerEvents: 'none' }}>
        <span className="axis-label" style={{ color: AXIS_COLORS[name] }}>
          {name.toUpperCase()}
        </span>
      </Html>
    </group>
  ))
}

function InspectModel({ obj }) {
  const outer = useRef()
  const model = useRef()
  const explode = useKinex((s) => s.inspect.explode)
  const wireframe = useKinex((s) => s.inspect.wireframe)
  const showAxes = useKinex(s=>Boolean(s.inspect.showAxes))
  const spin = useKinex((s) => s.inspect.spin)
  const focused = useKinex((s) => s.inspect.focusPart)
  const hdUrl = useKinex((s) => {
    const h = s.hd[obj.id]
    return h?.status === 'ready' && h.show !== false ? h.url : null
  })
  const hdFormat = useKinex((s) => s.hd[obj.id]?.format || 'glb')
  const ex = useRef({ k: 0 })
  const bounds = useMemo(() => partsBounds(obj.parts), [obj.parts])
  const anchor = useMemo(() => inspectAnchor(obj), [obj])

  useEffect(() => {
    // Export the model itself (not the helper axes), in its own frame.
    const m = model.current
    world.inspectRoot = m
    return () => {
      if (world.inspectRoot === m) world.inspectRoot = null
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    ex.current.k += (explode - ex.current.k) * (1 - Math.exp(-dt * 6))
    if (spin) rotateModelAbout(UP, dt * 0.6)
    inspectPose.q.slerp(inspectPose.targetQ, 1 - Math.exp(-dt * 10))
    if (!outer.current) return
    outer.current.quaternion.copy(inspectPose.q)
    outer.current.position.copy(anchor.position)
  })

  const onClick = (e) => {
    if (e.delta > 6) return // that was a drag, not a click
    const index = e.object.userData?.partIndex
    if (index === undefined) return
    e.stopPropagation()
    focusPart(e.object, index)
  }

  return (
    <group ref={outer} onClick={onClick}>
      <group ref={model} scale={obj.scale} name={obj.name}>
        <group position={bounds.center.map((v) => -v)}>
          {hdUrl && <HDModel url={hdUrl} format={hdFormat} parts={obj.parts} wireframe={wireframe} appearance={obj.appearance} />}
          {!hdUrl && obj.parts.map((p, i) => (
            <Part
              key={i}
              part={p}
              index={i}
              born={obj.born}
              hovered={focused === i}
              explode={ex.current}
              center={bounds.center}
              wireframe={wireframe}
            />
          ))}
        </group>
      </group>
      {showAxes&&<Axes length={anchor.radius * 1.25} />}
    </group>
  )
}

export function InspectView() {
  const obj = useKinex((s) => (s.inspectId ? s.objects.find((o) => o.id === s.inspectId) : null))
  if (!obj) return null
  return <InspectModel key={obj.id} obj={obj} />
}
