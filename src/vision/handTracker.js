import { OneEuro } from './oneEuro.js'
import { classify, cursorFrom, LM } from './gestures.js'
import { useKinex } from '../store.js'
import { validHands, matchHands } from './trackingMath.js'

const BASE = import.meta.env.BASE_URL
const LOCAL_WASM = `${BASE}mediapipe/wasm`
const LOCAL_MODEL = `${BASE}mediapipe/hand_landmarker.task`
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const GRACE_MS = 200 // keep a hand alive through a dropped frame or two

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
let worker = null
let pendingWorker = null
let workerBusy = false
let lastInferenceAt = 0
let frameErrors = 0
const FRAME_MS = 1000 / 24

async function createLandmarker(wasm, model, delegate) {
  const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision')
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
let generation = 0
let loopFrame = 0
export function startTracker(video) {
  if (tracker.running) return Promise.resolve()
  if (!video) return Promise.resolve()
  if (!starting) {
    const pending = boot(video)
    starting = pending
    pending.finally(() => { if (starting === pending) starting = null })
  }
  return starting
}

async function boot(video) {
  const ticket = ++generation
  const st = useKinex.getState()
  st.set({ camera: 'starting', cameraError: '' })
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
      audio: false,
    })
    if (ticket !== generation) { stream.getTracks().forEach((track) => track.stop()); return }
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    tracker.video = video
    await video.play()
    const workerReady = await createInferenceWorker(ticket)
    if (ticket !== generation) { stream.getTracks().forEach(track=>track.stop()); return }
    if (!workerReady) {
      const model=tracker.landmarker || await loadLandmarker()
      if(ticket!==generation){if(model!==tracker.landmarker)model.close();return}
      tracker.landmarker=model;st.set({trackingMode:'main'})
    }
    if (ticket !== generation) { stream.getTracks().forEach((track) => track.stop()); return }
    tracker.running = true
    fpsAt = performance.now()
    fpsCount = 0
    st.set({ camera: 'on' })
    loopFrame = requestAnimationFrame(loop)
  } catch (err) {
    stream?.getTracks().forEach((track) => track.stop())
    if (ticket !== generation) return
    console.error('[kinex] camera/tracker failed', err)
    const denied = err?.name === 'NotAllowedError'
    st.set({ camera: denied ? 'denied' : 'error', cameraError: denied ? 'Allow camera access in your browser, then try again.' : err?.name === 'NotFoundError' ? 'Connect a webcam to use hand controls. Mouse controls still work.' : 'We couldn’t start hand tracking. Try the camera again.' })
  }
}

export function stopTracker() {
  generation++
  starting = null
  tracker.running = false
  pendingWorker?.cancel()
  pendingWorker = null
  worker?.terminate()
  worker = null
  workerBusy = false
  cancelAnimationFrame(loopFrame)
  tracker.video?.srcObject?.getTracks().forEach((track) => track.stop())
  if (tracker.video) { tracker.video.pause(); tracker.video.srcObject = null }
  tracker.video = null
  tracker.fps = 0
  lastVideoTime = -1
  tracker.hands.forEach((hand) => {
    hand.present = false
    hand.mode = 'idle'
    hand.hold = 0
    hand.gesture = { ...hand.gesture, label: 'none', pinch: false, fist: false, victory: false }
  })
  useKinex.getState().set({ camera: 'off', cameraError: '', handsSeen: 0, gestures: ['none', 'none'], trackingMode: 'off', trackingFPS: 0, interactionMessage: '' })
}

function completedFrame(landmarks) {
  const video = tracker.video
  if (!tracker.running || !video) return
  const now = performance.now()
  process(landmarks, now, video.videoWidth / Math.max(1, video.videoHeight))
  fpsCount++
  if (now - fpsAt >= 1000) {
    tracker.fps = Math.round(fpsCount * 1000 / Math.max(1, now - fpsAt))
    fpsCount = 0
    fpsAt = now
    useKinex.getState().set({ trackingFPS: tracker.fps })
  }
}

async function createInferenceWorker(ticket) {
  if (!window.Worker || !window.createImageBitmap) return false
  const candidate = new Worker(`${BASE}mediapipe/hand-worker.js`)
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker setup timed out')), 12000)
      pendingWorker={candidate,cancel:()=>{clearTimeout(timeout);candidate.terminate();reject(new Error('Camera canceled'))}}
      candidate.onerror = () => { clearTimeout(timeout); reject(new Error('Worker could not start')) }
      candidate.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve() }
        if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)) }
      }
      candidate.postMessage({ type: 'init', bundle: new URL(`${BASE}mediapipe/vision_bundle.js`, location.href).href, wasm: new URL(LOCAL_WASM, location.href).href, model: new URL(LOCAL_MODEL, location.href).href })
    })
    if(pendingWorker?.candidate===candidate)pendingWorker=null
    if(ticket!==generation){candidate.terminate();return false}
    worker = candidate
    candidate.onmessage = ({ data }) => {
      workerBusy = false
      if (data.type === 'result') { frameErrors = 0; completedFrame(data.landmarks) }
      if (data.type === 'frame-error' && ++frameErrors >= 3) fallbackToMain()
    }
    candidate.onerror = () => fallbackToMain()
    useKinex.getState().set({ trackingMode: 'worker' })
    return true
  } catch (error) {
    candidate.terminate()
    if(pendingWorker?.candidate===candidate)pendingWorker=null
    if(ticket!==generation)return false
    console.info('[kinex] using compatible hand-tracking fallback:', error.message)
    return false
  }
}

async function fallbackToMain() {
  const ticket=generation
  worker?.terminate()
  worker = null
  workerBusy = false
  if (!tracker.running) return
  useKinex.getState().set({ trackingMode: 'starting' })
  try {
    tracker.landmarker ??= await loadLandmarker()
    if (tracker.running && ticket===generation) useKinex.getState().set({ trackingMode: 'main' })
  } catch { if(ticket!==generation)return;stopTracker(); useKinex.getState().set({ camera: 'error', cameraError: 'Hand tracking stopped. Try the camera again; mouse controls still work.' }) }
}

function loop() {
  if (!tracker.running) return
  loopFrame = requestAnimationFrame(loop)
  const video = tracker.video
  const now = performance.now()
  if (!video || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < FRAME_MS || workerBusy) return
  if (!worker && !tracker.landmarker) return
  lastVideoTime = video.currentTime
  lastInferenceAt = now
  if (worker) {
    workerBusy = true
    const currentWorker = worker
    const width = Math.min(640, video.videoWidth)
    const height = Math.round(video.videoHeight * width / Math.max(1, video.videoWidth))
    createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).then((frame) => {
      if (!tracker.running || worker !== currentWorker) { frame.close(); workerBusy = false; return }
      currentWorker.postMessage({ type: 'frame', frame, timestamp: now }, [frame])
    }).catch(() => { if(worker===currentWorker){workerBusy=false;if(++frameErrors>=3)fallbackToMain()} })
  } else {
    try { completedFrame(tracker.landmarker.detectForVideo(video, now).landmarks) }
    catch (error) { console.warn('[kinex] skipped a tracking frame:', error.message) }
  }
}

function process(detections, now, aspect) {
  const slots = tracker.hands
  const assigned = matchHands(validHands(detections), slots)
  const used = new Set(assigned.map(([index]) => index))

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

if (import.meta.hot) import.meta.hot.dispose(() => stopTracker())
