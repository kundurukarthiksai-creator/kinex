import { useKinex } from '../store.js'
import { current, run, undo, showAll, closeModel, elementById, frame } from '../model/current.js'

const KIND_LABEL = {
  wall: 'Walls', door: 'Doors', window: 'Windows', slab: 'Floors & slabs', roof: 'Roof', stair: 'Stairs', railing: 'Railings',
  beam: 'Beams', column: 'Columns', ceiling: 'Ceilings', furniture: 'Furniture', member: 'Members', panel: 'Panels', room: 'Rooms', other: 'Other',
}
const ORDER = ['wall', 'door', 'window', 'slab', 'roof', 'ceiling', 'stair', 'railing', 'furniture', 'beam', 'column', 'member', 'panel', 'other', 'room']
const fmt = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1))

function Btn({ children, onClick, active = false, disabled = false, title }) {
  return (
    <button
      data-hand
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-35 ${active ? 'bg-ink text-white' : 'text-ink hover:bg-white'}`}
    >
      {children}
    </button>
  )
}

function Details({ ids }) {
  const els = ids.map(elementById).filter(Boolean)
  if (!els.length) return null
  const one = els.length === 1 ? els[0] : null
  const host = one?.hostId ? elementById(one.hostId) : null
  const sel = { ids }
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-sm">
      {one ? (
        <>
          <p className="font-semibold text-ink first-letter:uppercase">{one.name}</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted">
            <dt>Type</dt>
            <dd className="text-ink">{one.kind}</dd>
            {one.storey && (
              <>
                <dt>Floor</dt>
                <dd className="text-ink">{one.storey}</dd>
              </>
            )}
            {one.external !== null && (
              <>
                <dt>Side</dt>
                <dd className="text-ink">{one.external ? 'Exterior' : 'Interior'}</dd>
              </>
            )}
            {one.material && (
              <>
                <dt>Material</dt>
                <dd className="text-ink">{one.material}</dd>
              </>
            )}
            {one.size && (
              <>
                <dt>Size</dt>
                <dd className="text-ink">{one.size.map(fmt).join(' × ')} m</dd>
              </>
            )}
            {host && (
              <>
                <dt>In wall</dt>
                <dd className="text-ink">{host.name}</dd>
              </>
            )}
            {one.hosts.length > 0 && (
              <>
                <dt>Openings</dt>
                <dd className="text-ink">{one.hosts.length} door/window{one.hosts.length === 1 ? '' : 's'}</dd>
              </>
            )}
            {one.connects.length > 0 && (
              <>
                <dt>Joins</dt>
                <dd className="text-ink">{one.connects.length} wall{one.connects.length === 1 ? '' : 's'}</dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p className="font-semibold text-ink">{els.length} items selected</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <Btn onClick={() => run([{ action: 'delete', select: sel }])}>Remove</Btn>
        <Btn onClick={() => run([{ action: 'hide', select: sel }])}>Hide</Btn>
        <Btn onClick={() => run([{ action: 'isolate', select: sel }])}>Show only this</Btn>
        <Btn onClick={() => frame(ids)}>Zoom to</Btn>
      </div>
    </div>
  )
}

// The open model, item by item: what's in it, by type and floor, and what's selected.
export function ModelPanel() {
  const model = useKinex((s) => s.model)
  const selection = useKinex((s) => s.selection)
  if (!model) return null
  const storeys = [...(model.storeys || [])].sort((a, b) => a.elevation - b.elevation)
  const kinds = ORDER.filter((k) => model.counts[k])
  const total = Object.entries(model.counts).reduce((n, [k, v]) => n + (k === 'room' ? 0 : v), 0)
  const visibleOf = (k) => current.model?.elements.some((e) => e.kind === k && !e.deleted && current.model.byId.get(e.id)?.visible !== false)

  return (
    <div className="flex w-full flex-col gap-4 p-1">
      <div>
        <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">{model.name}</h2>
        <p className="text-sm text-muted">{total} items from the original file. Click anything in the model to see what it is.</p>
      </div>

      <div className="flex flex-wrap gap-1">
        <Btn onClick={undo} disabled={!model.canUndo}>
          Undo
        </Btn>
        <Btn onClick={showAll}>Show everything</Btn>
        <Btn onClick={() => closeModel()}>Close model</Btn>
      </div>

      {selection.length > 0 && <Details ids={selection} />}

      {storeys.length > 1 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink">Floors</h3>
          <div className="flex flex-wrap gap-1">
            {storeys.map((s) => (
              <Btn key={s.name} onClick={() => run([{ action: 'isolate', select: { storey: s.name } }])}>
                {s.name}
              </Btn>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-sm font-semibold text-ink">What's in it</h3>
        <ul className="flex flex-col">
          {kinds.map((k) => {
            const on = k === 'room' ? false : visibleOf(k)
            return (
              <li key={k} className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-0">
                <button
                  data-hand
                  className="flex-1 text-left text-ink hover:text-cobalt"
                  onClick={() => run([{ action: 'highlight', select: { kinds: [k] } }])}
                  title={`Highlight all ${KIND_LABEL[k]?.toLowerCase() || k}`}
                >
                  {KIND_LABEL[k] || k} <span className="text-muted">{model.counts[k]}</span>
                </button>
                {k !== 'room' && (
                  <button
                    data-hand
                    className="rounded-full px-2 py-0.5 text-muted hover:bg-white hover:text-ink"
                    onClick={() => run([{ action: on ? 'hide' : 'show', select: { kinds: [k] } }], { focus: false })}
                  >
                    {on ? 'Hide' : 'Show'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
