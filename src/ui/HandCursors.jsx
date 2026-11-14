import { useEffect, useRef } from 'react'
import { tracker } from '../vision/handTracker.js'
import { PINCH_ON } from '../vision/gestures.js'

// Two DOM cursors driven straight from the tracker every frame, no React renders.
// The ring closes as thumb and index come together, so a pinch is visible before it lands.
export function HandCursors() {
  const els = useRef([])

  useEffect(() => {
    let raf
    const tick = () => {
      raf = requestAnimationFrame(tick)
      tracker.hands.forEach((h, i) => {
        const el = els.current[i]
        if (!el) return
        el.dataset.on = String(h.present)
        if (!h.present) return
        const x = h.cursor.x * window.innerWidth
        const y = h.cursor.y * window.innerHeight
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
        const open = h.gesture.pinch ? 0.42 : Math.min(1, Math.max(0.42, 0.42 + ((h.gesture.pinchRatio - PINCH_ON) / 0.7) * 0.58))
        el.style.setProperty('--open', open.toFixed(3))
        el.style.setProperty('--hold', Math.min(1, h.hold).toFixed(3))
        el.dataset.mode = h.mode
      })
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return [0, 1].map((i) => (
    <div key={i} ref={(el) => (els.current[i] = el)} className="hand-cursor" aria-hidden="true">
      <div className="hold" />
      <div className="ring" />
      <div className="dot" />
    </div>
  ))
}
