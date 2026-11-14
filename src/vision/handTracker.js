import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { OneEuro } from './oneEuro.js'
import { classify, cursorFrom, LM } from './gestures.js'
import { useKinex } from '../store.js'

const BASE = import.meta.env.BASE_URL
const LOCAL_WASM = `${BASE}mediapipe/wasm`
const LOCAL_MODEL = `${BASE}mediapipe/hand_landmarker.task`
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const GRACE_MS = 140 // keep a hand alive through a dropped frame or two

function makeSlot(i) {
  return {
    i,
    present: false,
    seenAt: 0,
    lm: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
    filters: Array.from({ length: 21 }, () => [new OneEuro(), new OneEuro(), new OneEuro()]),
    gesture: { label: 'none', pinch: false, fist: false, victory: false, open: false, pinchRatio: 1, palm: 0.2 },
    cursor: { x: 0.5, y: 0.5 },
    // written by the HandRig so the cursor overlay can show what the hand is doing
    mode: 'idle', // idle | hover | grab | ui | stretch
    hold: 0, // 0..1 progress of a hold gesture (fist / victory)
  }
}

// Shared, mutable, read every frame. Never put this in React state.
export const tracker = {
  video: null,
  landmarker: null,
  running: false,
  fps: 0,
  hands: [makeSlot(0), makeSlot(1)],
}

let lastVideoTime = -1
let fpsCount = 0
let fpsAt = 0

async function createLandmarker(wasm, model, delegate) {
  const files = await FilesetResolver.forVisionTasks(wasm)
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

async function loadLandmarker() {
  const attempts = [
    [LOCAL_WASM, LOCAL_MODEL, 'GPU'],
    [LOCAL_WASM, LOCAL_MODEL, 'CPU'],
    [CDN_WASM, CDN_MODEL, 'GPU'],
    [CDN_WASM, CDN_MODEL, 'CPU'],
  ]
  let lastErr
  for (const [w, m, d] of attempts) {
    try {
      return await createLandmarker(w, m, d)
    } catch (err) {
      lastErr = err
      console.warn(`[kinex] hand landmarker failed (${w}, ${d})`, err)
    }
  }
  throw lastErr
}

let starting = null
export function startTracker(video) {
  if (tracker.running) return Promise.resolve()
  starting ??= boot(video).finally(() => (starting = null))
  return starting
}

async function boot(video) {
  const st = useKinex.getState()
  st.set({ camera: 'starting' })
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false,
    })
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()
    tracker.video = video
    tracker.landmarker ??= await loadLandmarker()
    tracker.running = true
    st.set({ camera: 'on' })
    requestAnimationFrame(loop)
  } catch (err) {
    console.error('[kinex] camera/tracker failed', err)
    st.set({ camera: err?.name === 'NotAllowedError' ? 'denied' : 'error' })
  }
}

function loop() {
  if (!tracker.running) return
  requestAnimationFrame(loop)
  const v = tracker.video
  if (v.readyState < 2 || v.currentTime === lastVideoTime) return
  lastVideoTime = v.currentTime
  const now = performance.now()
  let res
  try {
    res = tracker.landmarker.detectForVideo(v, now)
  } catch (err) {
    console.warn('[kinex] detect failed', err)
    return
  }
  process(res?.landmarks || [], now, v.videoWidth / Math.max(1, v.videoHeight))
  fpsCount++
  if (now - fpsAt > 1000) {
    tracker.fps = fpsCount
    fpsCount = 0
    fpsAt = now
  }
}

function process(detections, now, aspect) {
  const slots = tracker.hands
  const used = new Set()
  // Match each detection to the slot whose wrist was closest last frame, so a
  // held object never jumps between hands.
  const assigned = detections.map((lm) => {
    let best = -1
    let bestD = Infinity
    slots.forEach((s, i) => {
      if (used.has(i)) return
      const d = s.present ? Math.hypot(s.lm[0].x - lm[0].x, s.lm[0].y - lm[0].y) : 5 + i
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    used.add(best)
    return [best, lm]
  })

  for (const [i, raw] of assigned) {
    const s = slots[i]
    if (!s.present || now - s.seenAt > 300) s.filters.forEach((f) => f.forEach((x) => x.reset()))
    for (let k = 0; k < 21; k++) {
      s.lm[k].x = s.filters[k][0].filter(raw[k].x, now)
      s.lm[k].y = s.filters[k][1].filter(raw[k].y, now)
      s.lm[k].z = s.filters[k][2].filter(raw[k].z, now)
    }
    s.gesture = classify(s.lm, aspect, s.gesture.pinch)
    s.cursor = cursorFrom(s.lm)
    s.present = true
    s.seenAt = now
  }
  for (let i = 0; i < slots.length; i++) {
    if (!used.has(i) && slots[i].present && now - slots[i].seenAt > GRACE_MS) {
      slots[i].present = false
      slots[i].gesture = { ...slots[i].gesture, label: 'none', pinch: false, fist: false, victory: false, open: false }
      slots[i].mode = 'idle'
      slots[i].hold = 0
    }
  }

  // Only touch React state when something a person would notice changes.
  const seen = slots.filter((s) => s.present).length
  const labels = slots.map((s) => (s.present ? s.gesture.label : 'none'))
  const st = useKinex.getState()
  if (st.handsSeen !== seen || labels.some((l, i) => l !== st.gestures[i])) st.set({ handsSeen: seen, gestures: labels })
}

export { LM }
