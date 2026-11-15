import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { viewer, snapView } from '../lib/viewer.js'
import { useKinex } from '../store.js'

const SIZE = 120
const R = 40
const AXES = [
  { key: 'x', v: [1, 0, 0], color: '#E5484D', pos: 'right', neg: 'left' },
  { key: 'y', v: [0, 1, 0], color: '#3FA36B', pos: 'top', neg: 'bottom' },
  { key: 'z', v: [0, 0, 1], color: '#2F5BFF', pos: 'front', neg: 'back' },
]
const inv = new THREE.Quaternion()
const tmp = new THREE.Vector3()

// World X / Y / Z, turned to match the camera. Tapping an axis end looks along it.
// Lines are SVG; the ends are real buttons so a pinch can click them.
export function AxisGizmo() {
  const lines = useRef({})
  const ends = useRef({})
  const inspecting = useKinex((s) => Boolean(s.inspectId))

  useEffect(() => {
    let raf
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const cam = viewer.camera
      if (!cam) return
      inv.copy(cam.quaternion).invert()
      for (const a of AXES) {
        tmp.set(...a.v).applyQuaternion(inv)
        const x = tmp.x * R
        const y = -tmp.y * R
        const depth = tmp.z // toward the viewer is positive
        const line = lines.current[a.key]
        if (line) {
          line.setAttribute('x2', SIZE / 2 + x)
          line.setAttribute('y2', SIZE / 2 + y)
          line.setAttribute('x1', SIZE / 2 - x)
          line.setAttribute('y1', SIZE / 2 - y)
        }
        const p = ends.current[`${a.key}+`]
        const n = ends.current[`${a.key}-`]
        if (p) {
          p.style.transform = `translate(${SIZE / 2 + x}px, ${SIZE / 2 + y}px) translate(-50%, -50%)`
          p.style.zIndex = String(Math.round(50 + depth * 10))
          p.style.opacity = String(0.65 + 0.35 * (depth + 1) * 0.5)
        }
        if (n) {
          n.style.transform = `translate(${SIZE / 2 - x}px, ${SIZE / 2 - y}px) translate(-50%, -50%)`
          n.style.zIndex = String(Math.round(50 - depth * 10))
        }
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <nav
      aria-label="View axes"
      className="panel absolute bottom-4 right-4 z-30 rounded-full"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} className="absolute inset-0" aria-hidden="true">
        {AXES.map((a) => (
          <line key={a.key} ref={(el) => (lines.current[a.key] = el)} stroke={a.color} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        ))}
      </svg>
      {AXES.map((a) => (
        <span key={a.key}>
          <button
            data-hand
            ref={(el) => (ends.current[`${a.key}+`] = el)}
            onClick={() => snapView(a.pos)}
            aria-label={`Look from the ${a.pos}`}
            title={`${a.key.toUpperCase()} axis: look from the ${a.pos}`}
            className="absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-white shadow-sm"
            style={{ background: a.color }}
          >
            {a.key.toUpperCase()}
          </button>
          <button
            data-hand
            ref={(el) => (ends.current[`${a.key}-`] = el)}
            onClick={() => snapView(a.neg)}
            disabled={a.neg === 'bottom' && !inspecting}
            aria-label={`Look from the ${a.neg}`}
            className="absolute left-0 top-0 h-4 w-4 rounded-full border-2 bg-white disabled:opacity-30"
            style={{ borderColor: a.color }}
          />
        </span>
      ))}
    </nav>
  )
}
