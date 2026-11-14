// Copies MediaPipe wasm + downloads the hand model into /public so hand tracking
// works without a CDN (venue Wi-Fi is never to be trusted).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDst = join(root, 'public/mediapipe/wasm')
const modelDst = join(root, 'public/mediapipe/hand_landmarker.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

mkdirSync(wasmDst, { recursive: true })
cpSync(wasmSrc, wasmDst, { recursive: true })
console.log('[kinex] mediapipe wasm copied')

if (!existsSync(modelDst)) {
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()))
    console.log('[kinex] hand model downloaded')
  } catch (err) {
    console.warn('[kinex] could not download hand model, the app will use the CDN:', err.message)
  }
}
