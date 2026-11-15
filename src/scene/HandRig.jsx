import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { tracker } from '../vision/handTracker.js'
import { useKinex, bodies } from '../store.js'
import { world } from '../lib/exportGltf.js'
import { grab, release, liveScale, commitScale, held } from './interaction.js'
import { toggleListening } from '../voice/speech.js'
import { viewer, rotateModelAbout, focusPart } from '../lib/viewer.js'
import { viewportPoint } from './viewport.js'

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const tmp = new THREE.Vector3()
const qTurn = new THREE.Quaternion()
const qBase = new THREE.Quaternion()
const camRight = new THREE.Vector3()
const camUp = new THREE.Vector3()
const camFwd = new THREE.Vector3()
const TUMBLE = 3.4 // radians of model turn per screen-width of hand travel
const rotateStep = new THREE.Quaternion()
const rotateAxis = new THREE.Vector3()

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
  tool: 'move',
  rotateQ: new THREE.Quaternion(),
  rotateAt: new THREE.Vector3(),
  previousX: 0,
  previousY: 0,
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
  const twoHand = useRef(null)

  function talkGesture(p, inp, dt, now) {
    if (inp.victory && !p.locked && now > talkCooldown.current) {
      p.talkT += dt
      if (p.talkT >= TALK_S) {
        toggleListening()
        p.talkT = 0
        p.locked = true
        talkCooldown.current = now + 1200
      }
    } else if (!inp.victory) {
      p.talkT = 0
      if (!inp.fist) p.locked = false
    }
  }

  // Inspect mode: hands turn and zoom the model instead of grabbing things.
  function inspectFrame(now, dt) {
    const aspect = window.innerWidth / window.innerHeight
    const cq = camera.quaternion
    camRight.set(1, 0, 0).applyQuaternion(cq)
    camUp.set(0, 1, 0).applyQuaternion(cq)
    camFwd.set(0, 0, -1).applyQuaternion(cq)
    const active = []
    tracker.hands.forEach((h, i) => {
      const p = pointers.current[i]
      if (!h.present) {
        setUiHover(p, null)
        p.wasPinch = false
        p.insp = null
        return
      }
      const pinch = h.gesture.pinch
      const start = pinch && !p.wasPinch
      const end = !pinch && p.wasPinch
      p.wasPinch = pinch
      const el = document.elementFromPoint(h.cursor.x * window.innerWidth, h.cursor.y * window.innerHeight)
      const point = viewportPoint(h.cursor.x * window.innerWidth, h.cursor.y * window.innerHeight, gl.domElement.getBoundingClientRect())
      const ui = p.insp && !p.insp.ui ? null : el?.closest?.('[data-hand]') || null
      setUiHover(p, ui)
      if (start) {
        if (ui) {
          ui.focus?.()
          ui.click()
          p.insp = { ui: true }
        } else if (point && el === gl.domElement) p.insp = { x: h.cursor.x, y: h.cursor.y, moved: 0 }
      }
      if (pinch && p.insp && !p.insp.ui) active.push({ h, p })
      if (end) {
        // A quick pinch without moving is a tap: zoom to the part under it.
        if (p.insp && !p.insp.ui && p.insp.moved < 0.02 && world.inspectRoot && point) {
          aim(camera, point.x, point.y)
          const hit = raycaster.intersectObject(world.inspectRoot, true).find((x) => x.object.userData?.partIndex !== undefined)
          if (hit) focusPart(hit.object, hit.object.userData.partIndex)
        }
        p.insp = null
      }
      talkGesture(p, { victory: h.gesture.victory, fist: h.gesture.fist }, dt, now)
      h.mode = pinch && p.insp && !p.insp.ui ? 'grab' : h.gesture.victory ? 'talk' : ui ? 'ui' : 'idle'
      h.hold = h.gesture.victory ? p.talkT / TALK_S : 0
    })

    if (active.length === 2) {
      const [a, b] = active
      const dx = (b.h.cursor.x - a.h.cursor.x) * aspect
      const dy = b.h.cursor.y - a.h.cursor.y
      const d = Math.hypot(dx, dy)
      const ang = Math.atan2(dy, dx)
      const t = twoHand.current
      if (t) {
        const dist = viewer.controls?.distance ?? 6
        viewer.controls?.dolly((d - t.d) * dist * 2.5, false)
        let turn = ang - t.ang
        if (turn > Math.PI) turn -= Math.PI * 2
        if (turn < -Math.PI) turn += Math.PI * 2
        rotateModelAbout(camFwd, -turn)
      }
      twoHand.current = { d, ang }
      a.p.insp.moved = b.p.insp.moved = 1
      a.h.mode = b.h.mode = 'stretch'
      return
    }
    twoHand.current = null
    if (active.length === 1) {
      const { h, p } = active[0]
      const dx = (h.cursor.x - p.insp.x) * aspect
      const dy = h.cursor.y - p.insp.y
      p.insp.moved += Math.hypot(dx, dy)
      p.insp.x = h.cursor.x
      p.insp.y = h.cursor.y
      if (dx) rotateModelAbout(camUp, dx * TUMBLE)
      if (dy) rotateModelAbout(camRight, dy * TUMBLE)
    }
  }

  // Mouse fallback: drag an object to grab and throw it; drag empty space to orbit.
  useEffect(() => {
    const el = gl.domElement
    const toNorm = (e) => {
      const r = el.getBoundingClientRect()
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    }
    const down = (e) => {
      if (e.target !== el || e.button !== 0) return
      if (useKinex.getState().inspectId) return // the camera handles the mouse in Inspect
      const n = toNorm(e)
      Object.assign(mouse.current, n, { present: true })
      if (hitObject(camera, n.x, n.y) || (useKinex.getState().handTool === 'rotate' && useKinex.getState().lastId)) {
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
    if (useKinex.getState().inspectId) {
      pointers.current.forEach((p) => p.grabId && endGrab(p, now))
      if (stretch.current) {
        commitScale(stretch.current.id)
        stretch.current = null
      }
      inspectFrame(now, dt)
      return
    }
    const rect = gl.domElement.getBoundingClientRect()
    const inputs = [
      ...tracker.hands.map((h) => {
        const screenX = h.cursor.x * window.innerWidth
        const screenY = h.cursor.y * window.innerHeight
        const point = viewportPoint(screenX, screenY, rect)
        return ({
        present: h.present,
        isHand: true,
        x: point?.x ?? (screenX - rect.left) / Math.max(rect.width, 1),
        y: point?.y ?? (screenY - rect.top) / Math.max(rect.height, 1),
        screenX, screenY,
        inside: Boolean(point),
        pinch: h.present && h.gesture.pinch,
        fist: h.present && h.gesture.fist,
        victory: h.present && h.gesture.victory,
        palm: h.gesture.palm,
        slot: h,
      }) }),
      { present: m.present, isHand: false, inside: m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1, x: m.x, y: m.y, pinch: m.down, fist: false, victory: false, palm: 1, slot: null },
    ]

    let hoverId = null
    inputs.forEach((inp, i) => {
      const p = pointers.current[i]
      const slot = inp.slot
      if (p.grabId && !bodies.has(p.grabId)) endGrab(p, now)
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
      let blocked = false
      if (inp.isHand && !p.grabId) {
        const el = document.elementFromPoint(inp.screenX, inp.screenY)
        ui = el?.closest?.('[data-hand]') || null
        blocked = el !== gl.domElement
      }
      setUiHover(p, ui)

      const hit = p.grabId || !inp.inside || ui || blocked ? null : hitObject(camera, inp.x, inp.y)
      if (hit && !hoverId && !ui) hoverId = hit.id

      if (pinchStart) {
        if (ui) {
          ui.focus?.()
          ui.click()
        } else if (inp.inside && !blocked) {
          // A second hand can join the held object without aiming at the same pixel.
          const other = inp.isHand ? pointers.current[1 - i] : null
          const state = useKinex.getState()
          const targetId = hit?.id || other?.grabId || (state.handTool === 'rotate' ? state.lastId : null)
          const body = targetId && bodies.get(targetId)
          if (!body || !grab(targetId)) return
          const b = body.translation()
          const q = body.rotation()
          p.grabId = targetId
          p.dist = hit?.distance || other?.dist || camera.position.distanceTo(tmp.set(b.x, b.y, b.z))
          p.palm0 = inp.palm
          const point = hit?.point || aim(camera, inp.x, inp.y).at(p.dist, tmp)
          p.offset.set(b.x - point.x, b.y - point.y, b.z - point.z)
          p.tool = state.handTool
          p.previousX = inp.x
          p.previousY = inp.y
          p.rotateQ.set(q.x, q.y, q.z, q.w)
          p.rotateAt.set(b.x, b.y, b.z)
          if (p.tool === 'rotate') body.setEnabledRotations(true, true, true, true)
          state.set({ lastId: targetId })
          p.hist = []
          if (!inp.isHand) m.wheel = 0
        }
      }
      if (pinchEnd && p.grabId) endGrab(p, now)

      if (p.grabId) {
        if (p.tool === 'rotate') {
          const dx = (inp.x - p.previousX) * rect.width / Math.max(rect.height, 1)
          const dy = inp.y - p.previousY
          p.previousX = inp.x
          p.previousY = inp.y
          rotateAxis.set(0, 1, 0).applyQuaternion(camera.quaternion)
          p.rotateQ.premultiply(rotateStep.setFromAxisAngle(rotateAxis, dx * TUMBLE))
          rotateAxis.set(1, 0, 0).applyQuaternion(camera.quaternion)
          p.rotateQ.premultiply(rotateStep.setFromAxisAngle(rotateAxis, dy * TUMBLE)).normalize()
          bodies.get(p.grabId)?.setNextKinematicRotation(p.rotateQ)
          p.target.copy(p.rotateAt)
        } else {
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
      }

      // Hold a fist over something to crush it.
      if (useKinex.getState().handTool === 'move' && inp.fist && !p.grabId && hit && !p.locked) {
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
      talkGesture(p, inp, dt, now)

      if (slot) {
        slot.mode = p.grabId ? p.tool === 'rotate' ? 'rotate' : 'grab' : inp.fist && hit ? 'crush' : inp.victory ? 'talk' : ui ? 'ui' : hit ? 'hover' : 'idle'
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
      camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
      qTurn.setFromAxisAngle(camFwd, -(ang - s.a0))
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
    if (st.hoverId !== hoverId) st.set(hoverId ? { hoverId, lastId: hoverId } : { hoverId })
  })

  function endGrab(p, now) {
    const id = p.grabId
    p.grabId = null
    if (stretch.current?.id === id) {
      commitScale(id)
      stretch.current = null
    }
    release(id, velocityOf(p.hist, now))
    const remaining = pointers.current.find((pointer) => pointer.grabId === id)
    const body = bodies.get(id)
    if (remaining?.tool === 'rotate' && body) {
      const q = body.rotation()
      const t = body.translation()
      remaining.rotateQ.set(q.x, q.y, q.z, q.w)
      remaining.rotateAt.set(t.x, t.y, t.z)
      remaining.target.copy(remaining.rotateAt)
      body.setNextKinematicRotation(remaining.rotateQ)
    }
    p.hist = []
  }

  return null
}
