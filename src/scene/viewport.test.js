import { describe, it, expect } from 'vitest'
import { viewportPoint } from './viewport.js'

describe('hand positions in the studio viewport', () => {
  const canvas = { left: 291, top: 122, width: 1200, height: 800 }
  it('aims at the model under the finger when the canvas is offset by the sidebar', () => {
    expect(viewportPoint(891, 522, canvas)).toEqual({ x: 0.5, y: 0.5 })
  })
  it('does not grab scene objects through sidebars or the top toolbar', () => {
    expect(viewportPoint(200, 400, canvas)).toBeNull()
    expect(viewportPoint(800, 70, canvas)).toBeNull()
    expect(viewportPoint(1500, 400, canvas)).toBeNull()
  })
  it('still points at the center after focus mode resizes the canvas', () => {
    expect(viewportPoint(760, 500, { left: 10, top: 100, width: 1500, height: 800 })).toEqual({ x: 0.5, y: 0.5 })
  })
  it('ignores a canvas before it has a size', () => {
    expect(viewportPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})
