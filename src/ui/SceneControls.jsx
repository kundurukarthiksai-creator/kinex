import { useState, useEffect, useRef, useId } from 'react'
import { useKinex } from '../store.js'
import { Icon } from './Icon.jsx'

function Dropdown({ label, icon, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const root = useRef()
  const trigger = useRef()
  const id = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!root.current.contains(event.target)) setOpen(false) }
    document.addEventListener('click', outside)
    return () => document.removeEventListener('click', outside)
  }, [open])
  return <div className="control-dropdown" ref={root} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current.focus() } }}>
    <button className="toolbar-select toolbar-select-button" data-hand ref={trigger} disabled={disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Icon name={icon} size={15}/><span>{options.find(([key]) => key === value)?.[1]}</span><Icon name="chevron" size={11}/></button>
    {open && <div className="control-menu" role="menu" id={id} aria-label={label}>{options.map(([key, name]) => <button data-hand role="menuitemradio" aria-checked={key === value} key={key} onClick={() => { onChange(key); setOpen(false); trigger.current.focus() }}><span>{name}</span>{key === value && <Icon name="check" size={13}/>}</button>)}</div>}
  </div>
}

export function SceneControls() {
  const environment = useKinex((s) => s.environment)
  const grid = useKinex((s) => s.showGrid)
  const thinking = useKinex((s) => s.status.kind === 'thinking')
  const change = (key, value) => useKinex.getState().set({ environment: { ...useKinex.getState().environment, [key]: value } })
  return <div className="scene-controls" aria-label="World settings">
    <Dropdown label="Lighting" icon="sun" value={environment.preset} options={[["studio","Studio light"],["sunset","Golden hour"],["dawn","Soft dawn"],["night","Midnight"]]} onChange={(value) => change('preset',value)} disabled={thinking}/>
    <Dropdown label="Gravity" icon="gravity" value={environment.gravity} options={[["normal","Earth gravity"],["low","Moon gravity"],["zero","Zero gravity"]]} onChange={(value) => change('gravity',value)} disabled={thinking}/>
    <span className="toolbar-divider"/>
    <button data-hand className={`toolbar-icon ${grid ? 'active' : ''}`} aria-label="Toggle floor grid" title="Toggle floor grid" aria-pressed={grid} onClick={() => useKinex.getState().set({ showGrid: !grid })}><Icon name="grid" size={16}/></button>
  </div>
}
