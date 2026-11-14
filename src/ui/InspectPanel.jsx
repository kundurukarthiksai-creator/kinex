import { useKinex } from '../store.js'
import { exitInspect, snapView, rotateModel, resetModelRotation, partsBounds } from '../lib/viewer.js'
import { addDetail } from '../ai/commands.js'
import { MAX_DETAILED_PARTS } from '../ai/apply.js'

const AXES = [
  ['x', '#E5484D'],
  ['y', '#3FA36B'],
  ['z', '#2F5BFF'],
]
const VIEWS = [
  ['top', 'Top'],
  ['front', 'Front'],
  ['side', 'Side'],
  ['iso', '3/4'],
]
const fmt = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1))

function Btn({ children, onClick, active = false, className = '', ...rest }) {
  return (
    <button
      data-hand
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink hover:bg-white'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-14 shrink-0 text-sm text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

export function InspectPanel() {
  const obj = useKinex((s) => s.objects.find((o) => o.id === s.inspectId))
  const inspect = useKinex((s) => s.inspect)
  const setInspect = useKinex((s) => s.setInspect)
  if (!obj) return null

  const b = partsBounds(obj.parts)
  const [w, h, d] = b.size.map((v) => v * obj.scale)
  const part = inspect.focusPart !== null ? obj.parts[inspect.focusPart] : null
  const full = obj.parts.length >= MAX_DETAILED_PARTS

  return (
    <div className="panel flex w-[min(340px,calc(100vw-2rem))] flex-col gap-3 rounded-3xl p-4">
      <div>
        <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink first-letter:uppercase">{obj.name}</h2>
        <p className="text-sm text-muted">
          {obj.parts.length} parts, {fmt(w)} × {fmt(h)} × {fmt(d)} m
        </p>
      </div>

      <Row label="View">
        {VIEWS.map(([v, name]) => (
          <Btn key={v} onClick={() => snapView(v)}>
            {name}
          </Btn>
        ))}
      </Row>

      {AXES.map(([axis, color]) => (
        <Row
          key={axis}
          label={
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              Turn {axis.toUpperCase()}
            </span>
          }
        >
          <Btn onClick={() => rotateModel(axis, -90)} aria-label={`Turn ${axis} minus 90 degrees`}>
            −90°
          </Btn>
          <Btn onClick={() => rotateModel(axis, -15)} aria-label={`Turn ${axis} minus 15 degrees`}>
            −15°
          </Btn>
          <Btn onClick={() => rotateModel(axis, 15)} aria-label={`Turn ${axis} plus 15 degrees`}>
            +15°
          </Btn>
          <Btn onClick={() => rotateModel(axis, 90)} aria-label={`Turn ${axis} plus 90 degrees`}>
            +90°
          </Btn>
        </Row>
      ))}

      <Row label="Show">
        <Btn active={inspect.explode > 0} onClick={() => setInspect({ explode: inspect.explode > 0 ? 0 : 1 })}>
          Explode
        </Btn>
        <Btn active={inspect.wireframe} onClick={() => setInspect({ wireframe: !inspect.wireframe })}>
          Wireframe
        </Btn>
        <Btn active={inspect.spin} onClick={() => setInspect({ spin: !inspect.spin })}>
          Spin
        </Btn>
        <Btn onClick={resetModelRotation}>Reset</Btn>
      </Row>
      <label className="flex items-center gap-3 text-sm text-muted">
        <span className="w-14 shrink-0">Spread</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(inspect.explode * 100)}
          onChange={(e) => setInspect({ explode: Number(e.target.value) / 100 })}
          className="w-full accent-[#23263A]"
          aria-label="How far apart the parts spread"
        />
      </label>

      {part && (
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-sm">
          <p className="font-semibold text-ink">
            Part {inspect.focusPart + 1}: {part.shape}
          </p>
          <p className="flex items-center gap-2 text-muted">
            <span className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: part.color }} />
            {part.material}, {part.size.map((v) => fmt(v * obj.scale)).join(' × ')} m
          </p>
          <button data-hand onClick={() => snapView('iso')} className="mt-1 font-medium text-cobalt">
            Show whole model
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          data-hand
          onClick={() => addDetail(obj.id)}
          disabled={inspect.refining || full}
          className="h-11 flex-1 rounded-2xl bg-ink px-4 font-semibold text-white transition-opacity disabled:opacity-40"
          title={full ? `Up to ${MAX_DETAILED_PARTS} parts` : 'The AI adds small details while you watch'}
        >
          {inspect.refining ? 'Adding detail…' : full ? 'Fully detailed' : 'Add detail'}
        </button>
        <button data-hand onClick={exitInspect} className="h-11 rounded-2xl px-4 font-medium text-ink hover:bg-white">
          Done
        </button>
      </div>
    </div>
  )
}
