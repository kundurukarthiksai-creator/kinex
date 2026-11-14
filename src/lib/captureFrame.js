import { tracker } from '../vision/handTracker.js'

// Grabs the current webcam frame as base64 JPEG (no data: prefix), longest side 640px.
export function captureFrame(maxSide = 640) {
  const v = tracker.video
  if (!v || !v.videoWidth) return null
  const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(v.videoWidth * s)
  c.height = Math.round(v.videoHeight * s)
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}
