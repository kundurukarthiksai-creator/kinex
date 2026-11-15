import { useRef } from 'react'
import { useKinex } from '../store.js'
import { importModelFile, IMPORT_EXTENSIONS } from '../hd/importModel.js'
import { exportNow } from '../ai/commands.js'

const LIGHT = [
  ['studio', 'Studio'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
]

function Segmented({ label, options, value, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 rounded-full bg-white/60 p-0.5 text-sm">
      <span className="px-2 text-muted">{label}</span>
      {options.map(([v, name]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          data-hand
          onClick={() => onPick(v)}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${value === v ? 'bg-ink text-white' : 'text-ink hover:bg-white'}`}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, onClick, children, title }) {
  return (
    <button
      data-hand
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
        on ? 'bg-ink text-white' : 'bg-white/70 text-ink hover:bg-white'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-marigold' : 'bg-muted/40'}`} aria-hidden="true" />
      {children}
    </button>
  )
}

export function TopBar() {
  const env = useKinex((s) => s.environment)
  const set = useKinex((s) => s.set)
  const count = useKinex((s) => s.objects.length)
  const clear = useKinex((s) => s.clear)
  const chatOpen = useKinex((s) => s.chatOpen)
  const handsOn = useKinex((s) => s.handsOn)
  const file = useRef()

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-[#EEF0F5] px-4">
      <p className="mr-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-ink">Kinex</p>
      <div className="hidden items-center gap-2 lg:flex">
        <Segmented label="Light" options={LIGHT} value={env.preset} onPick={(preset) => set({ environment: { ...env, preset } })} />
      </div>
      <button
        data-hand
        onClick={() => file.current.click()}
        className="h-9 rounded-full px-3 text-sm font-medium text-ink hover:bg-white"
        title="Open a building (.ifc) or a 3D file (.glb, .gltf, .obj, .stl), or drop one on the page"
      >
        Open 3D file
      </button>
      <input
        ref={file}
        type="file"
        accept={IMPORT_EXTENSIONS.map((e) => `.${e}`).join(',')}
        className="hidden"
        onChange={(e) => {
          ;[...e.target.files].forEach((f) => importModelFile(f))
          e.target.value = ''
        }}
      />
      {count > 0 && (
        <>
          <button data-hand onClick={exportNow} className="h-9 rounded-full px-3 text-sm font-medium text-ink hover:bg-white">
            Export
          </button>
          <button data-hand onClick={clear} className="h-9 rounded-full px-3 text-sm font-medium text-ink hover:bg-white">
            Clear all
          </button>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Toggle on={handsOn} onClick={() => set({ handsOn: !handsOn })} title="Use your webcam and hand gestures to move and view models">
          Hands
        </Toggle>
        <Toggle on={chatOpen} onClick={() => set({ chatOpen: !chatOpen })} title="Talk to Kinex to build and refine your model">
          Chat
        </Toggle>
      </div>
    </header>
  )
}
