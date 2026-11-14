import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { tracker } from '../vision/handTracker.js'
import { useKinex, bodies } from '../store.js'
import { world } from '../lib/exportGltf.js'
import { grab, release, liveScale, commitScale, held } from './interaction.js'
import { toggleListening } from '../voice/speech.js'

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const tmp = new THREE.Vector3()
const qTurn = new THREE.Quaternion()
const qBase = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

const CRUSH_S = 0.5
const TALK_S = 0.55

function aim(camera, x, y) {
  ndc.set(x * 2 - 1, -(y * 2 - 1))
  raycaster.setFromCamera(ndc, camera)
  return raycaster.ray
}

function hitObject(camera, x, y) {
  if (!world.root) return null
  aim(camera, x, y)
  const hits = raycaster.intersectObject(world.root, true)
  for (const h of hits) {
    let o = h.object
    while (o && !o.userData?.kinexId) o = o.parent
    if (o && bodies.has(o.userData.kinexId)) return { id: o.userData.kinexId, point: h.point.clone(), distance: h.distance }
  }
  return null
}

const newPointer = () => ({
  grabId: null,
  dist: 0,
  palm0: 1,
  offset: new THREE.Vector3(),
  target: new THREE.Vector3(),
  hist: [],
  wasPinch: false,
  crushT: 0,
  talkT: 0,
  locked: false,
  ui: null,
})

function velocityOf(hist, now) {
  const recent = hist.filter((h) => now - h.t < 110)
  if (recent.length < 2) return { x: 0, y: 0, z: 0 }
  const a = recent[0]
  const b = recent.at(-1)
  const dt = Math.max(0.016, (b.t - a.t) / 1000)
  const boost = 1.25
  return { x: ((b.p.x - a.p.x) / dt) * boost, y: ((b.p.y - a.p.y) / dt) * boost, z: ((b.p.z - a.p.z) / dt) * boost }
}

function setUiHover(p, el) {
  if (p.ui === el) return
  p.ui?.classList.remove('hand-hover')
  el?.classList.add('hand-hover')
  p.ui = el
}

export function HandRig() {
  const { camera, gl, controls } = useThree()
  const pointers = useRef([newPointer(), newPointer(), newPointer()]) // left slot, right slot, mouse
  const mouse = useRef({ present: false, x: 0.5, y: 0.5, down: false, wheel: 0 })
  const stretch = useRef(null)
  const talkCooldown = useRef(0)

  // Mouse fallback: drag an object to grab and throw it; drag empty space to orbit.
  useEffect(() => {
    const el = gl.domElement
    const toNorm = (e) => {
      const r = el.getBoundingClientRect()
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    }
    const down = (e) => {
      if (e.target !== el || e.button !== 0) return
      const n = toNorm(e)
      Object.assign(mouse.current, n, { present: true })
      if (hitObject(camera, n.x, n.y)) {
        mouse.current.down = true
        mouse.current.wheel = 0
        if (controls) controls.enabled = false
      }
    }
    const move = (e) => Object.assign(mouse.current, toNorm(e), { present: e.target === el || mouse.current.down })
    const up = () => {
      mouse.current.down = false
      if (controls) controls.enabled = true
    }
    const wheel = (e) => {
      if (mouse.current.down) mouse.current.wheel += e.deltaY
    }
    window.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('wheel', wheel, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [camera, gl, controls])

  useFrame((_, delta) => {
    const now = performance.now()
    const dt = Math.min(delta, 0.05)
    const m = mouse.current
    const inputs = [
      ...tracker.hands.map((h) => ({
        present: h.present,
        isHand: true,
        x: h.cursor.x,
        y: h.cursor.y,
        pinch: h.present && h.gesture.pinch,
        fist: h.present && h.gesture.fist,
        victory: h.present && h.gesture.victory,
        palm: h.gesture.palm,
        slot: h,
      })),
      { present: m.present, isHand: false, x: m.x, y: m.y, pinch: m.down, fist: false, victory: false, palm: 1, slot: null },
    ]

    let hoverId = null
    inputs.forEach((inp, i) => {
      const p = pointers.current[i]
      const slot = inp.slot
      if (!inp.present) {
        if (p.grabId) endGrab(p, now)
        setUiHover(p, null)
        p.wasPinch = false
        p.crushT = p.talkT = 0
        return
      }

      const pinchStart = inp.pinch && !p.wasPinch
      const pinchEnd = !inp.pinch && p.wasPinch
      p.wasPinch = inp.pinch

      // UI under a hand cursor gets pinch-to-click.
      let ui = null
      if (inp.isHand && !p.grabId) {
        const el = document.elementFromPoint(inp.x * window.innerWidth, inp.y * window.innerHeight)
        ui = el?.closest?.('[data-hand]') || null
      }
      setUiHover(p, ui)

      const hit = p.grabId ? null : hitObject(camera, inp.x, inp.y)
      if (hit && !hoverId && !ui) hoverId = hit.id

      if (pinchStart) {
        if (ui) {
          ui.focus?.()
          ui.click()
        } else if (hit && grab(hit.id)) {
          const b = bodies.get(hit.id).translation()
          p.grabId = hit.id
          p.dist = hit.distance
          p.palm0 = inp.palm
          p.offset.set(b.x - hit.point.x, b.y - hit.point.y, b.z - hit.point.z)
          p.hist = []
          if (!inp.isHand) m.wheel = 0
        }
      }
      if (pinchEnd && p.grabId) endGrab(p, now)

      if (p.grabId) {
        const depth = inp.isHand
          ? p.dist * Math.pow(p.palm0 / Math.max(0.02, inp.palm), 1.3)
          : p.dist + m.wheel * 0.01
        const d = THREE.MathUtils.clamp(depth, 2.5, 20)
        const ray = aim(camera, inp.x, inp.y)
        p.target.copy(ray.origin).addScaledVector(ray.direction, d).add(p.offset)
        p.target.set(
          THREE.MathUtils.clamp(p.target.x, -10, 10),
          THREE.MathUtils.clamp(p.target.y, 0, 7.5),
          THREE.MathUtils.clamp(p.target.z, -8, 5.8),
        )
        p.hist.push({ t: now, p: p.target.clone() })
        if (p.hist.length > 12) p.hist.shift()
      }

      // Hold a fist over something to crush it.
      if (inp.fist && !p.grabId && hit && !p.locked) {
        p.crushT += dt
        if (p.crushT >= CRUSH_S) {
          useKinex.getState().removeObject(hit.id)
          p.crushT = 0
          p.locked = true
        }
      } else if (!inp.fist) {
        p.crushT = 0
        if (!inp.victory) p.locked = false
      }

      // Hold a victory sign to talk.
      if (inp.victory && !p.locked && now > talkCooldown.current) {
        p.talkT += dt
        if (p.talkT >= TALK_S) {
          toggleListening()
          p.talkT = 0
          p.locked = true
          talkCooldown.current = now + 1200
        }
      } else if (!inp.victory) p.talkT = 0

      if (slot) {
        slot.mode = p.grabId ? 'grab' : inp.fist && hit ? 'crush' : inp.victory ? 'talk' : ui ? 'ui' : hit ? 'hover' : 'idle'
        slot.hold = inp.fist ? p.crushT / CRUSH_S : inp.victory ? p.talkT / TALK_S : 0
      }
    })

    // Two hands on one object: stretch to scale, twist to turn.
    const [a, b] = pointers.current
    const both = a.grabId && a.grabId === b.grabId ? a.grabId : null
    if (both) {
      const ha = tracker.hands[0].cursor
      const hb = tracker.hands[1].cursor
      const aspect = window.innerWidth / window.innerHeight
      const dx = (hb.x - ha.x) * aspect
      const dy = hb.y - ha.y
      const d = Math.hypot(dx, dy)
      const ang = Math.atan2(dy, dx)
      const body = bodies.get(both)
      if (!stretch.current || stretch.current.id !== both) {
        const r = body.rotation()
        stretch.current = { id: both, d0: Math.max(0.05, d), a0: ang, q0: new THREE.Quaternion(r.x, r.y, r.z, r.w) }
      }
      const s = stretch.current
      const obj = useKinex.getState().objects.find((o) => o.id === both)
      const base = obj?.scale || 1
      liveScale.set(both, THREE.MathUtils.clamp(d / s.d0, 0.15 / base, 6 / base))
      qTurn.setFromAxisAngle(UP, -(ang - s.a0) * 1.5)
      body.setNextKinematicRotation(qBase.copy(qTurn).multiply(s.q0))
      tmp.copy(a.target).add(b.target).multiplyScalar(0.5)
      body.setNextKinematicTranslation(tmp)
      tracker.hands[0].mode = tracker.hands[1].mode = 'stretch'
    } else {
      if (stretch.current) {
        commitScale(stretch.current.id)
        stretch.current = null
      }
    }
    pointers.current.forEach((p) => {
      if (p.grabId && p.grabId !== both && held.has(p.grabId)) bodies.get(p.grabId)?.setNextKinematicTranslation(p.target)
    })

    const st = useKinex.getState()
    if (st.hoverId !== hoverId) st.set({ hoverId })
  })

  function endGrab(p, now) {
    const id = p.grabId
    p.grabId = null
    if (stretch.current?.id === id) {
      commitScale(id)
      stretch.current = null
    }
    release(id, velocityOf(p.hist, now))
    p.hist = []
  }

  return null
}
