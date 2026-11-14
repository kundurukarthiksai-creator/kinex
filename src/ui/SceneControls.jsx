import { useKinex } from '../store.js'

const GRAVITY = [
  ['normal', 'Earth'],
  ['low', 'Moon'],
  ['zero', 'Off'],
]
const LIGHT = [
  ['studio', 'Studio'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
]

function Segmented({ label, options, value, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} className="panel flex items-center gap-1 rounded-full p-1 text-sm">
      <span className="px-2 font-medium text-muted">{label}</span>
      {options.map(([v, name]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          data-hand
          onClick={() => onPick(v)}
          className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
            value === v ? 'bg-ink text-white' : 'text-ink hover:bg-white'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

export function SceneControls() {
  const env = useKinex((s) => s.environment)
  const set = useKinex((s) => s.set)
  const count = useKinex((s) => s.objects.length)
  const clear = useKinex((s) => s.clear)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Gravity" options={GRAVITY} value={env.gravity} onPick={(gravity) => set({ environment: { ...env, gravity } })} />
      <Segmented label="Light" options={LIGHT} value={env.preset} onPick={(preset) => set({ environment: { ...env, preset } })} />
      {count > 0 && (
        <button data-hand onClick={clear} className="panel rounded-full px-4 py-2 text-sm font-medium text-ink hover:bg-white">
          Clear all
        </button>
      )}
    </div>
  )
}
