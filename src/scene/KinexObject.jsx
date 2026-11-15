import { memo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, BallCollider, CylinderCollider, ConeCollider, CapsuleCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { useKinex, bodies, groups } from '../store.js'
import { Part } from './Part.jsx'
import { held, liveScale, homes, desiredType, DYNAMIC } from './interaction.js'
import { enterInspect } from '../lib/viewer.js'
import { HDModel } from '../hd/HDModel.jsx'

function PartCollider({ part, scale }) {
  const [w, h, d] = part.size.map((n) => n * scale)
  const position = part.position.map((n) => n * scale)
  const props = { position, rotation: part.rotation, friction: 0.8, restitution: 0.25 }
  switch (part.shape) {
    case 'sphere':
    case 'icosahedron': {
      const max = Math.max(w, h, d)
      const min = Math.min(w, h, d)
      return max / min < 1.3 ? <BallCollider args={[max / 2]} {...props} /> : <CuboidCollider args={[w / 2, h / 2, d / 2]} {...props} />
    }
    case 'cylinder':
    case 'dome':
      return <CylinderCollider args={[h / 2, Math.max(w, d) / 2]} {...props} />
    case 'cone':
    case 'pyramid':
      return <ConeCollider args={[h / 2, Math.max(w, d) / 2]} {...props} />
    case 'capsule': {
      const r = Math.max(w, d) / 2
      return <CapsuleCollider args={[Math.max(0.01, h / 2 - r), r]} {...props} />
    }
    default:
      return <CuboidCollider args={[w / 2, h / 2, d / 2]} {...props} />
  }
}

// Built objects stand upright (they may only turn) until a throw sets them tumbling.
const UPRIGHT = [false, true, false]
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _baseQ = new THREE.Quaternion()

function KinexObject({ obj }) {
  const body = useRef()
  const group = useRef()
  const hovered = useKinex((s) => s.hoverId === obj.id || (s.handTool === 'rotate' && s.lastId === obj.id))
  const hdUrl = useKinex((s) => {
    const h = s.hd[obj.id]
    return h?.status === 'ready' && h.show !== false ? h.url : null
  })
  const hdFormat = useKinex((s) => s.hd[obj.id]?.format || 'glb')
  const objRef = useRef(obj)
  objRef.current = obj

  useEffect(() => {
    const b = body.current
    bodies.set(obj.id, b)
    groups.set(obj.id, group.current)
    homes.set(obj.id, { x: obj.position[0], y: obj.position[1] + 0.02, z: obj.position[2], at: performance.now() })
    return () => {
      bodies.delete(obj.id)
      groups.delete(obj.id)
      homes.delete(obj.id)
      held.delete(obj.id)
      liveScale.delete(obj.id)
    }
  }, [obj.id])

  // A behavior change re-anchors the motion where the object currently is.
  useEffect(() => {
    const b = body.current
    if (!b) return
    const t = b.translation()
    homes.set(obj.id, { x: t.x, y: t.y, z: t.z, at: performance.now() })
  }, [obj.behavior.kind, obj.behavior.targetId, obj.id])

  useFrame((state) => {
    const b = body.current
    const o = objRef.current
    if (!b) return
    const now = performance.now()
    const type = desiredType(o, now)
    if (b.bodyType() !== type) {
      b.setBodyType(type, true)
      if (type === DYNAMIC) b.wakeUp()
    }

    const live = liveScale.get(o.id) || 1
    let s = o.scale * live
    const kind = o.behavior.kind
    if (kind === 'pulse') s *= 1 + Math.sin(state.clock.elapsedTime * 3 * o.behavior.speed) * 0.08
    group.current.scale.setScalar(s)

    if (held.has(o.id) || kind === 'none' || now - o.born < 300) return
    const home = homes.get(o.id)
    if (!home) return
    const t = (now - (home.at ?? 0)) / 1000 * o.behavior.speed
    const p = { x: home.x, y: home.y, z: home.z }
    let yaw = null
    if (kind === 'spin') yaw = t * 1.6
    if (kind === 'float') {
      p.y = home.y + Math.sin(t * 1.4) * 0.25
      yaw = t * 0.4
    }
    if (kind === 'bounce') p.y = home.y + Math.abs(Math.sin(t * 2.6)) * 1.2
    if (kind === 'orbit') {
      const target = o.behavior.targetId && bodies.get(o.behavior.targetId)
      const c = target ? target.translation() : { x: 0, y: home.y, z: 0 }
      const r = Math.max(1.4, Math.hypot(home.x - c.x, home.z - c.z))
      const a0 = Math.atan2(home.z - c.z, home.x - c.x)
      const a = a0 + t * (1.6 / Math.sqrt(r))
      p.x = c.x + Math.cos(a) * r
      p.z = c.z + Math.sin(a) * r
      p.y = target ? c.y + (home.y - c.y) : home.y
      yaw = -a
    }
    b.setNextKinematicTranslation(p)
    if (yaw !== null) {
      if (o.quaternion) _baseQ.fromArray(o.quaternion)
      else _baseQ.setFromEuler(_e.set(0, o.rotationY || 0, 0))
      b.setNextKinematicRotation(_q.setFromEuler(_e.set(0, yaw, 0)).multiply(_baseQ))
    }
  })

  return (
    <RigidBody
      ref={body}
      colliders={false}
      type="kinematicPosition"
      position={[obj.position[0], obj.position[1] + 0.02, obj.position[2]]}
      rotation={obj.quaternion ? undefined : [0, obj.rotationY || 0, 0]}
      quaternion={obj.quaternion}
      linearDamping={0.15}
      angularDamping={0.5}
      ccd
      enabledRotations={UPRIGHT}
    >
      {obj.parts.map((p, i) =>
        // Small trims (rivets, window frames) don't need their own colliders.
        obj.parts.length > 6 && Math.max(...p.size) * obj.scale < 0.15 ? null : (
          <PartCollider key={`${obj.rev}-${i}`} part={p} scale={obj.scale} />
        ),
      )}
      <group
        ref={group}
        userData={{ kinexId: obj.id }}
        name={obj.name}
        onDoubleClick={(e) => {
          e.stopPropagation()
          enterInspect(obj.id)
        }}
      >
        {(() => {
          const blocks = obj.parts.map((p, i) => <Part key={i} part={p} index={i} born={obj.born} hovered={hovered} />)
          return hdUrl ? <HDModel url={hdUrl} format={hdFormat} parts={obj.parts} fallback={blocks} /> : blocks
        })()}
      </group>
    </RigidBody>
  )
}

export default memo(KinexObject)
