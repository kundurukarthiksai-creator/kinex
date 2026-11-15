import { useEffect, useState } from 'react'
import { useKinex } from '../store.js'
import { makeHD } from '../hd/meshes.js'
import { enterInspect } from '../lib/viewer.js'

const STAGES = {
  photo: 'Using your photo',
  picturing: 'Drawing a reference picture',
  queued: 'Waiting in line',
  conditioning: 'Reading the picture',
  shape: 'Shaping the mesh',
  texture: 'Painting textures',
  texturing: 'Painting textures',
  export: 'Finishing',
  postprocess: 'Finishing',
  exporting: 'Finishing',
  retrying: 'Hit a server hiccup, trying again',
}

function clock(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function statusLine(h) {
  if (h.status === 'ready') return h.cached ? 'Ready (from cache)' : 'Ready'
  if (h.status === 'failed') return h.error || 'Something went wrong'
  if (h.status === 'queued' && h.queue > 1) return `Waiting in line, ${h.queue - 1} ahead`
  const label = STAGES[h.stage] || (h.stage ? h.stage.replace(/_/g, ' ') : 'Starting')
  return h.progress > 0 && h.status === 'meshing' ? `${label}, ${h.progress}%` : label
}

// Models being turned into real textured meshes, with the picture each one is built from.
export function HDTray() {
  const hd = useKinex((s) => s.hd)
  const objects = useKinex((s) => s.objects)
  const setHD = useKinex((s) => s.setHD)
  const [, tick] = useState(0)
  const entries = Object.entries(hd).filter(([id, h]) => !h.dismissed && objects.some((o) => o.id === id))
  const active = entries.some(([, h]) => h.status !== 'ready' && h.status !== 'failed')

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [active])

  if (!entries.length) return null
  return (
    <aside aria-label="HD models" className="fixed bottom-[148px] right-4 z-30 flex w-[280px] flex-col gap-2 sm:right-6">
      {entries.map(([id, h]) => (
        <div key={id} className="panel flex gap-3 rounded-2xl p-2 pr-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white">
            {h.image ? (
              <img src={h.image} alt={`Reference for ${h.name}`} className="h-full w-full object-cover" />
            ) : (
              <div className="breathe h-full w-full bg-cyc" />
            )}
            {h.status !== 'ready' && h.status !== 'failed' && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/60">
                <div className="h-full bg-cobalt transition-[width] duration-700" style={{ width: `${Math.max(4, h.progress || 0)}%` }} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate font-semibold text-ink first-letter:uppercase">{h.name} in HD</p>
            <p className={`text-sm leading-snug ${h.status === 'failed' ? 'text-crush' : 'text-muted'}`}>
              {statusLine(h)}
              {h.status !== 'ready' && h.status !== 'failed' && <span className="tabular-nums">, {clock(Date.now() - h.startedAt)}</span>}
            </p>
            <div className="mt-1 flex gap-3 text-sm font-medium">
              {h.status === 'ready' && (
                <>
                  <button data-hand className="text-cobalt" onClick={() => enterInspect(id)}>
                    Inspect
                  </button>
                  <button data-hand className="text-ink" onClick={() => setHD(id, { show: h.show === false })}>
                    {h.show === false ? 'Show HD' : 'Show blocks'}
                  </button>
                </>
              )}
              {h.status === 'failed' && (
                <button data-hand className="text-cobalt" onClick={() => makeHD(id)}>
                  Try again
                </button>
              )}
              {(h.status === 'ready' || h.status === 'failed') && (
                <button data-hand className="text-muted" onClick={() => setHD(id, { dismissed: true })}>
                  Hide
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </aside>
  )
}
