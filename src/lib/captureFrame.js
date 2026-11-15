import { tracker } from '../vision/handTracker.js'

// A sharper still for object reconstruction; no video is uploaded.
export function captureFrame(maxSide = 1280) {
  const v = tracker.video
  if (!v || !v.videoWidth) return null
  const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(v.videoWidth * s)
  c.height = Math.round(v.videoHeight * s)
  const context = c.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(v, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.94).split(',')[1]
}
