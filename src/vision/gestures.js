// Pure gesture math on MediaPipe hand landmarks (21 points, normalized image coords).
export const LM = {
  WRIST: 0, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_TIP: 16, PINKY_MCP: 17, PINKY_TIP: 20,
}

export const PINCH_ON = 0.32
export const PINCH_OFF = 0.5

export const dist = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)

// Wrist to middle knuckle: a scale reference that doesn't change when fingers move.
export const palmSize = (lm, aspect = 1) => dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP], aspect)

// How far a fingertip reaches from the wrist, relative to its knuckle.
export function reach(lm, tip, mcp, aspect = 1) {
  return dist(lm[LM.WRIST], lm[tip], aspect) / Math.max(1e-6, dist(lm[LM.WRIST], lm[mcp], aspect))
}

export function classify(lm, aspect = 1, wasPinching = false) {
  const palm = palmSize(lm, aspect)
  const pinchRatio = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP], aspect) / Math.max(1e-6, palm)
  const index = reach(lm, LM.INDEX_TIP, LM.INDEX_MCP, aspect)
  const middle = reach(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP, aspect)
  const ring = reach(lm, LM.RING_TIP, LM.RING_MCP, aspect)
  const pinky = reach(lm, LM.PINKY_TIP, LM.PINKY_MCP, aspect)

  const curled = (r) => r < 1.25
  const extended = (r) => r > 1.55

  const fist = index < 1.15 && curled(middle) && curled(ring) && curled(pinky)
  const pinch = !fist && pinchRatio < (wasPinching ? PINCH_OFF : PINCH_ON)
  const victory =
    !pinch && extended(index) && extended(middle) && curled(ring) && curled(pinky) &&
    dist(lm[LM.INDEX_TIP], lm[LM.MIDDLE_TIP], aspect) / palm > 0.28
  const open = !pinch && extended(index) && extended(middle) && extended(ring) && extended(pinky) && pinchRatio > 0.7

  const label = fist ? 'fist' : pinch ? 'pinch' : victory ? 'victory' : open ? 'open' : 'point'
  return { label, pinch, fist, victory, open, pinchRatio, palm }
}

// Pinch point (between thumb and index tips), mirrored and stretched so the
// comfortable middle of the camera frame covers the whole screen.
export function cursorFrom(lm, marginX = 0.16, marginTop = 0.1, marginBottom = 0.28) {
  const mx = (lm[LM.THUMB_TIP].x + lm[LM.INDEX_TIP].x) / 2
  const my = (lm[LM.THUMB_TIP].y + lm[LM.INDEX_TIP].y) / 2
  const x = (1 - mx - marginX) / (1 - 2 * marginX)
  const y = (my - marginTop) / (1 - marginTop - marginBottom)
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}
