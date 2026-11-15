import { useKinex } from '../store.js'
import { undoWorld, redoWorld } from '../lib/history.js'
import { Icon } from './Icon.jsx'

export function HistoryControls() {
  const past = useKinex((state) => state.past)
  const future = useKinex((state) => state.future)
  const busy = useKinex((state) => state.status.kind === 'thinking' || Boolean(state.transaction))
  return <div className="history-controls" aria-label="Edit history">
    <button data-hand className="toolbar-icon" aria-label="Undo" title={past.length ? `Undo ${past.at(-1).label} (Ctrl/Cmd+Z)` : 'Nothing to undo'} disabled={!past.length || busy} onClick={undoWorld}><Icon name="undo" size={16}/></button>
    <button data-hand className="toolbar-icon" aria-label="Redo" title={future.length ? `Redo ${future.at(-1).label} (Ctrl/Cmd+Shift+Z)` : 'Nothing to redo'} disabled={!future.length || busy} onClick={redoWorld}><Icon name="redo" size={16}/></button>
  </div>
}
