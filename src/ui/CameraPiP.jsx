import { useEffect, useRef } from 'react'
import { useKinex } from '../store.js'
import { tracker, startTracker } from '../vision/handTracker.js'

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]
const MODE_COLOR = { grab: '#FFB000', stretch: '#FFB000', crush: '#E5484D' }

const INSPECT_GESTURES = [
  { key: 'pinch', name: 'Pinch and drag', does: 'turn the model' },
  { key: 'two', name: 'Pinch with both hands', does: 'zoom, twist to roll' },
  { key: 'tap', name: 'Quick pinch on a part', does: 'zoom to it' },
  { key: 'victory', name: 'Hold a peace sign', does: 'talk' },
]

const GESTURES = [
  { key: 'pinch', name: 'Pinch', does: 'grab, release to throw' },
  { key: 'two', name: 'Pinch with both hands', does: 'stretch and turn' },
  { key: 'fist', name: 'Hold a fist', does: 'crush' },
  { key: 'victory', name: 'Hold a peace sign', does: 'talk' },
]

export function CameraPiP() {
  const video = useRef()
  const canvas = useRef()
  const camera = useKinex((s) => s.camera)
  const scanning = useKinex((s) => s.scanning)
  const gestures = useKinex((s) => s.gestures)
  const handsSeen = useKinex((s) => s.handsSeen)
  const inspecting = useKinex((s) => Boolean(s.inspectId))

  useEffect(() => {
    startTracker(video.current)
  }, [])

  useEffect(() => {
    let raf
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, c.width, c.height)
      for (const h of tracker.hands) {
        if (!h.present) continue
        const col = MODE_COLOR[h.mode] || '#2F5BFF'
        ctx.strokeStyle = col
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (const [a, b] of BONES) {
          ctx.moveTo(h.lm[a].x * c.width, h.lm[a].y * c.height)
          ctx.lineTo(h.lm[b].x * c.width, h.lm[b].y * c.height)
        }
        ctx.stroke()
        ctx.fillStyle = '#FFFFFF'
        for (const p of h.lm) {
          ctx.beginPath()
          ctx.arc(p.x * c.width, p.y * c.height, 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  const active = new Set(gestures)
  const twoHands = handsSeen === 2 && gestures[0] === 'pinch' && gestures[1] === 'pinch'

  return (
    <aside className="fixed right-4 top-4 z-40 w-[240px] sm:w-[280px]" aria-label="Camera and gestures">
      <div className="panel relative aspect-[4/3] overflow-hidden rounded-2xl">
        <div className="absolute inset-0 -scale-x-100">
          <video ref={video} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvas} width={320} height={240} className="absolute inset-0 h-full w-full" />
        </div>
        {scanning && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="scanline" />
          </div>
        )}
        {camera !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-start justify-end gap-2 p-4 text-sm">
            {camera === 'starting' && <p className="breathe text-muted">Starting the camera and hand model</p>}
            {(camera === 'denied' || camera === 'error' || camera === 'off') && (
              <>
                <p className="text-muted">
                  {camera === 'denied'
                    ? 'Camera access is blocked. Allow it in the address bar, then turn it on.'
                    : 'Kinex follows your hands through the webcam. Video stays on this device.'}
                </p>
                <button
                  data-hand
                  onClick={() => startTracker(video.current)}
                  className="rounded-full bg-ink px-4 py-2 font-medium text-white"
                >
                  Turn on camera
                </button>
              </>
            )}
          </div>
        )}
        {camera === 'on' && (
          <p className="absolute bottom-2 left-3 text-xs font-medium text-white/90 drop-shadow">
            {handsSeen === 0 ? 'Raise a hand' : handsSeen === 1 ? 'One hand' : 'Two hands'}
          </p>
        )}
      </div>

      {camera === 'on' && (
        <ul className="panel mt-2 rounded-2xl px-4 py-3 text-sm leading-snug">
          {(inspecting ? INSPECT_GESTURES : GESTURES).map((g) => {
            const on = g.key === 'two' ? twoHands : !twoHands && active.has(g.key)
            return (
              <li key={g.key} className={`flex items-baseline gap-2 py-0.5 transition-colors ${on ? 'text-cobalt' : 'text-muted'}`}>
                <span className={`inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${on ? 'bg-cobalt' : 'bg-line'}`} />
                <span>
                  <span className={on ? 'font-semibold' : 'font-medium text-ink'}>{g.name}</span> to {g.does}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
