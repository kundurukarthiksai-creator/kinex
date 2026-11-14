import { describe, it, expect } from 'vitest'
import { classify, cursorFrom, LM } from './gestures.js'
import { OneEuro } from './oneEuro.js'

// Synthetic upright hand: wrist at the bottom, knuckles 0.2 above it.
const MCP = { index: [0.45, 0.6], middle: [0.5, 0.6], ring: [0.55, 0.6], pinky: [0.6, 0.62] }
const TIP = { index: LM.INDEX_TIP, middle: LM.MIDDLE_TIP, ring: LM.RING_TIP, pinky: LM.PINKY_TIP }
const MCP_IDX = { index: LM.INDEX_MCP, middle: LM.MIDDLE_MCP, ring: LM.RING_MCP, pinky: LM.PINKY_MCP }

function hand({ ext = {}, thumb = [0.3, 0.65], indexTip } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }))
  for (const f of Object.keys(MCP)) {
    const [x, y] = MCP[f]
    lm[MCP_IDX[f]] = { x, y, z: 0 }
    lm[TIP[f]] = ext[f] ? { x, y: y - 0.17, z: 0 } : { x, y: y + 0.06, z: 0 }
  }
  if (indexTip) lm[LM.INDEX_TIP] = { x: indexTip[0], y: indexTip[1], z: 0 }
  lm[LM.THUMB_TIP] = { x: thumb[0], y: thumb[1], z: 0 }
  return lm
}

const all = { index: true, middle: true, ring: true, pinky: true }

describe('classify', () => {
  it('detects an open palm', () => {
    expect(classify(hand({ ext: all })).label).toBe('open')
  })
  it('detects a fist even though thumb and index are close', () => {
    const g = classify(hand({ thumb: [0.47, 0.64] }))
    expect(g.label).toBe('fist')
    expect(g.pinch).toBe(false)
  })
  it('detects a pinch', () => {
    const g = classify(hand({ ext: { middle: true }, indexTip: [0.42, 0.48], thumb: [0.43, 0.5] }))
    expect(g.label).toBe('pinch')
  })
  it('uses hysteresis: a half-open pinch stays pinched only if it already was', () => {
    // thumb ~0.4 palm-lengths from index tip: between PINCH_ON and PINCH_OFF
    const lm = hand({ indexTip: [0.42, 0.48], thumb: [0.42, 0.56] })
    expect(classify(lm, 1, false).pinch).toBe(false)
    expect(classify(lm, 1, true).pinch).toBe(true)
  })
  it('detects a victory sign', () => {
    const lm = hand({ ext: { index: true, middle: true } })
    lm[LM.INDEX_TIP].x = 0.4
    lm[LM.MIDDLE_TIP].x = 0.56
    expect(classify(lm).label).toBe('victory')
  })
  it('falls back to point', () => {
    expect(classify(hand({ ext: { index: true } })).label).toBe('point')
  })
})

describe('cursorFrom', () => {
  it('mirrors x and clamps to the screen', () => {
    const lm = hand({ indexTip: [0.2, 0.3], thumb: [0.2, 0.3] })
    const c = cursorFrom(lm)
    expect(c.x).toBeGreaterThan(0.8)
    lm[LM.INDEX_TIP] = lm[LM.THUMB_TIP] = { x: -1, y: 5, z: 0 }
    expect(cursorFrom(lm)).toEqual({ x: 1, y: 1 })
  })
})

describe('OneEuro', () => {
  it('smooths jitter on a still signal', () => {
    const f = new OneEuro()
    let out = 0
    for (let i = 0; i < 60; i++) out = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i * 33)
    expect(Math.abs(out - 0.5)).toBeLessThan(0.006)
  })
})
