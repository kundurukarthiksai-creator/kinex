import { useEffect, useState } from 'react'
import { useKinex } from '../store.js'
import { runCommand, addDetail } from '../ai/commands.js'
import { activeModel } from '../ai/llm.js'
import { libraryInfo } from '../ai/library.js'
import { enterInspect } from '../lib/viewer.js'
import { makeHD } from '../hd/meshes.js'

const STARTERS = ['a vintage camera', 'a wooden rocking chair', 'a red sports car', 'a desk lamp']

// First visit: an invitation, right where the model will appear.
function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-6">
      <div className="pointer-events-auto max-w-[520px] text-center">
        <h2 className="text-[clamp(1.8rem,3.4vw,2.8rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">What should we build?</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-[15px] leading-relaxed text-muted">
          Describe anything. Kinex starts from the closest of thousands of reference models and shapes it to your words, then you keep talking to it.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {STARTERS.map((s) => (
            <button key={s} data-hand onClick={() => runCommand(s)} className="panel rounded-full px-4 py-2 text-[15px] font-medium text-ink hover:bg-white">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// What the builder is doing right now, shown where the model is forming.
function BuildPill() {
  const text = useKinex((s) => [...s.chat].reverse().find((m) => m.status === 'working')?.text)
  if (!text) return null
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
      <p className="panel flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink shadow-sm">
        <span className="breathe inline-block h-2 w-2 rounded-full bg-cobalt" aria-hidden="true" />
        {text}
      </p>
    </div>
  )
}

// Actions for the model you're working on, next to the model rather than in a menu.
function ModelBar({ obj }) {
  const hd = useKinex((s) => s.hd[obj.id]?.status)
  const refining = useKinex((s) => s.inspect.refining)
  const remove = useKinex((s) => s.removeObject)
  const Btn = ({ children, onClick, disabled, title }) => (
    <button data-hand onClick={onClick} disabled={disabled} title={title} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink hover:bg-white disabled:opacity-40">
      {children}
    </button>
  )
  return (
    <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      <div className="panel flex items-center gap-1 rounded-full py-1 pl-4 pr-1 shadow-sm">
        <span className="mr-2 max-w-[22ch] truncate text-sm text-muted">
          <span className="font-semibold text-ink first-letter:uppercase">{obj.name}</span> · {obj.parts.length} parts
          {obj.draft && <span className="ml-2 rounded-full bg-marigold/25 px-2 py-0.5 text-xs font-semibold text-ink">draft from the library</span>}
        </span>
        <Btn onClick={() => enterInspect(obj.id)} title="Look at it from every side">
          Inspect
        </Btn>
        <Btn onClick={() => addDetail(obj.id)} disabled={refining} title="The AI adds small details while you watch">
          {refining ? 'Adding…' : 'Add detail'}
        </Btn>
        <Btn onClick={() => makeHD(obj.id)} disabled={hd && hd !== 'failed'} title="Turn it into a real textured mesh (2–3 minutes)">
          {hd === 'ready' ? 'HD ready' : hd && hd !== 'failed' ? 'Making HD…' : 'Make it HD'}
        </Btn>
        <Btn onClick={() => remove(obj.id)} title="Remove from the scene">
          Remove
        </Btn>
      </div>
    </div>
  )
}

// Which brain is building, and how much it can draw on. Shown small, for the curious.
function EngineChip() {
  const status = useKinex((s) => s.status.kind)
  const [info, setInfo] = useState(null)
  const [engine, setEngine] = useState(activeModel())
  useEffect(() => {
    libraryInfo().then(setInfo)
  }, [status])
  useEffect(() => setEngine(activeModel()), [status])
  const label = engine?.startsWith('local:') ? `${engine.slice(6)} on this PC` : engine ? `${engine} via ASU` : 'offline builder'
  return (
    <p className="pointer-events-none absolute left-4 top-4 z-10 hidden text-xs text-muted lg:block">
      {label}
      {info?.count ? ` · ${info.count.toLocaleString()} reference models${info.liked ? `, ${info.liked} liked` : ''}` : ''}
    </p>
  )
}

export function StageOverlay() {
  const empty = useKinex((s) => s.objects.length === 0 && !s.model && !s.chat.some((m) => m.status === 'working'))
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const model = useKinex((s) => Boolean(s.model))
  const focus = useKinex((s) => s.objects.find((o) => o.id === s.lastId) || s.objects.at(-1))
  return (
    <>
      {empty && <EmptyState />}
      <BuildPill />
      {!inspecting && !model && focus && <ModelBar obj={focus} />}
      <EngineChip />
    </>
  )
}
