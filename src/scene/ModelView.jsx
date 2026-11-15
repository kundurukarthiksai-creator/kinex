import { useKinex } from '../store.js'
import { current, setSelection, elementById } from '../model/current.js'

// Shows the open real model. Click an element to select it (Shift adds to the selection).
export function ModelView() {
  const rev = useKinex((s) => s.model?.rev)
  const m = current.model
  if (!rev || !m) return null

  const onClick = (e) => {
    if (e.delta > 6) return // a drag, not a click
    let o = e.object
    while (o && o.userData?.elementId === undefined) o = o.parent
    if (!o) return
    e.stopPropagation()
    const id = o.userData.elementId
    if (!elementById(id)) return
    const sel = useKinex.getState().selection
    setSelection(e.nativeEvent?.shiftKey ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id])
  }

  return <primitive object={m.root} onClick={onClick} onPointerMissed={(e) => e.button === 0 && e.delta <= 6 && setSelection([])} />
}
