import { useState, useRef } from 'react'
import { useKinex, dominantColor, newId, bodies } from '../store.js'
import { STARTERS, loadStarter } from '../lib/starters.js'
import { enterInspect, exitInspect } from '../lib/viewer.js'
import { Icon } from './Icon.jsx'
import { StarterArt } from './StarterArt.jsx'
import { InspectPanel } from './InspectPanel.jsx'
import { ModelAppearance } from './ModelAppearance.jsx'
import { MODEL_CATALOG } from '../hd/catalog.js'
import { LearnPanel } from './LearnPanel.jsx'
import { runCommand } from '../ai/commands.js'

const QUICK_PROMPTS = ['A tiny castle with a red flag', 'A rocket ready for launch', 'Make it glow', 'Turn off gravity']

export function Sidebar({ onClose, onNew, onGuide, inert = false }) {
  const scaleChange = useRef(null)
  const [tab, setTab] = useState('create')
  const [pendingStarter, setPendingStarter] = useState(null)
  const objects = useKinex((s) => s.objects)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const selected = useKinex((s) => s.lastId)
  const thinking = useKinex((s) => s.status.kind === 'thinking')
  const finishScale = () => { if (scaleChange.current) useKinex.getState().commitChange(scaleChange.current); scaleChange.current=null }
  const current = objects.find((o) => o.id === selected)
  const pickStarter = (id) => {
    if (objects.length) { setPendingStarter(id); return }
    loadStarter(id)
    onClose()
  }
  const duplicate = (object) => {
    const token = useKinex.getState().beginChange('Duplicate object')
    const t = bodies.get(object.id)?.translation()
    const copy = { ...object, id: newId(object.name), name: `${object.name} copy`.slice(0, 40), position: [Math.min(6, (t?.x ?? object.position[0]) + 1.5), Math.max(0, t?.y ?? object.position[1]), t?.z ?? object.position[2]], born: performance.now(), parts: object.parts.map(({ born, ...part }) => ({ ...part })), rev: 0 }
    useKinex.getState().addObject(copy)
    const hd = useKinex.getState().hd[object.id]
    if (hd?.status === 'ready') useKinex.getState().setHD(copy.id, { ...hd, name: copy.name })
    if (token) useKinex.getState().commitChange(token)
  }
  const remove = (id) => {
    if (useKinex.getState().inspectId === id) exitInspect()
    useKinex.getState().removeObject(id)
  }
  return <aside className="studio-sidebar" aria-label="Creation and scene tools" inert={inert}>
    <div className="sidebar-heading"><span>YOUR WORKSPACE</span><button className="icon-button mobile-only" aria-label="Close tools" onClick={onClose}><Icon name="close"/></button><button className="icon-button new-world-button" data-hand title="Start a new world" aria-label="Start a new world" onClick={onNew} disabled={thinking}><Icon name="plus" size={17}/></button></div>
    <div className="sidebar-tabs" role="tablist" aria-label="Workspace tools">
      <button data-hand role="tab" id="tab-create" aria-controls="panel-create" aria-selected={tab === 'create' && !inspecting} onClick={() => { exitInspect(); setTab('create') }}><Icon name="spark" size={15}/>Create</button>
      <button data-hand role="tab" id="tab-scene" aria-controls="panel-scene" aria-selected={tab === 'scene' || inspecting} onClick={() => { exitInspect(); setTab('scene') }}><Icon name="layers" size={15}/>Scene<span className="count-badge">{objects.length.toString().padStart(2, '0')}</span></button>
      <button data-hand role="tab" id="tab-learn" aria-controls="panel-learn" aria-selected={tab === 'learn' && !inspecting} onClick={() => { exitInspect(); setTab('learn') }}><Icon name="help" size={15}/>Learn</button>
    </div>
    <div className="sidebar-scroll">
      {inspecting ? <section role="tabpanel" id="panel-scene" aria-labelledby="tab-scene"><InspectPanel/></section> : tab === 'learn' ? <section role="tabpanel" id="panel-learn" aria-labelledby="tab-learn"><LearnPanel onClose={onClose}/></section> : tab === 'create' ? <section role="tabpanel" id="panel-create" aria-labelledby="tab-create" className="create-panel">
        <p className="eyebrow">IDEAS INTO DIMENSIONS</p>
        <h2>A little thought.<br/>A whole new world.</h2>
        <p className="sidebar-intro">Describe it. Bring it to life.<br/>Make it yours with your hands.</p>
        <div className="section-heading"><h3>Detailed models</h3><span>Ready offline</span></div>
        <div className="model-library">{MODEL_CATALOG.map(asset=><button data-hand disabled={thinking} key={asset.id} onClick={()=>{runCommand(`Create a ${asset.name}`);onClose()}}><span className={`library-model-icon library-${asset.id}`}><Icon name={asset.id==='ship'?'ship':asset.id==='avocado'?'leaf':asset.id==='bottle'?'bottle':'speaker'} size={28}/></span><span><strong>{asset.name}</strong><small>{asset.id==='ship'?'8 color sections':'Detailed textures'}</small></span><Icon name="plus" size={13}/></button>)}</div>
        <div className="section-heading"><h3>Start somewhere</h3><span>Instant scenes</span></div>
        <button className="featured-starter" data-hand onClick={() => pickStarter('orbit')} disabled={thinking}>
          <div className="starter-visual"><span className="starter-tag"><span/>START HERE</span><StarterArt kind="orbit"/><span className="starter-play"><Icon name="play" size={13}/></span></div>
          <div className="starter-caption"><div><strong>Orbital playground</strong><span>A little space to play.</span></div><Icon name="arrow" size={17}/></div>
        </button>
        <div className="starter-grid">{STARTERS.slice(1).map((starter) => <button data-hand className="small-starter" key={starter.id} disabled={thinking} onClick={() => pickStarter(starter.id)}><StarterArt kind={starter.id}/><span>{starter.id === 'robot' ? 'Robot companion' : starter.id === 'solar' ? 'Solar system' : 'Little retreat'}</span><Icon name="arrow" size={13}/></button>)}</div>
        {pendingStarter && <div className="replace-prompt" role="status"><p>Replace this world with a starter? Your current scene will be cleared.</p><div><button data-hand className="button button-small button-primary" onClick={() => { loadStarter(pendingStarter); setPendingStarter(null); onClose() }}>Load starter</button><button data-hand className="button button-small button-quiet" onClick={() => setPendingStarter(null)}>Keep this world</button></div></div>}
        <div className="section-heading prompt-heading"><h3>Or, just say it</h3><Icon name="mic" size={13}/></div>
        <div className="prompt-list">{QUICK_PROMPTS.map((prompt) => <button data-hand key={prompt} disabled={thinking} onClick={() => { runCommand(prompt); onClose() }}><span>“{prompt}”</span><Icon name="arrow" size={13}/></button>)}</div>
      </section> : <section role="tabpanel" id="panel-scene" aria-labelledby="tab-scene" className="scene-panel">
        <div className="section-heading"><h3>Objects in your world</h3><span>{objects.filter(o=>o.source?.assetId).length} detailed models</span></div>
        {!objects.length && <div className="outliner-empty"><Icon name="cube" size={32}/><h3>Room for an idea.</h3><p>Your creations will appear here. Start with a prompt or a scene.</p><button data-hand className="button button-primary" onClick={() => setTab('create')}>Explore starters<Icon name="arrow" size={14}/></button></div>}
        <div className="object-list">{objects.map((object, index) => <div className={`object-row ${selected === object.id ? 'selected' : ''}`} key={object.id}>
          <button data-hand className="object-select" aria-pressed={selected === object.id} onClick={() => useKinex.getState().set({ lastId: object.id })} onDoubleClick={() => enterInspect(object.id)}><span className="object-swatch" style={{ '--object-color': dominantColor(object) }}><Icon name="cube" size={17}/></span><span><strong>{object.name}</strong><small>{object.building ? 'Building…' : object.source?.assetId ? 'Detailed mesh' : `${object.parts.length} parts`}<span> · </span>{String(index + 1).padStart(2, '0')}</small></span></button>
          <button data-hand className="icon-button" title={`Inspect ${object.name}`} aria-label={`Inspect ${object.name}`} disabled={thinking} onClick={() => enterInspect(object.id)}><Icon name="inspect" size={16}/></button>
        </div>)}</div>
        {current && <div className="selection-details">
          <div className="section-heading"><h3>Selected object</h3><span className="selection-dot"/></div>
          <h4>{current.name}</h4><p>{current.physics === 'float' ? 'Floating' : current.physics === 'static' ? 'Anchored' : 'Physics enabled'} · {current.behavior.kind === 'none' ? 'At rest' : current.behavior.kind}</p>
          <label className="scale-field"><span>Scale <strong>{current.scale.toFixed(2)}×</strong></span><input aria-label="Object scale" type="range" min="0.2" max="3" step="0.05" value={current.scale} disabled={thinking} onPointerDown={()=>{scaleChange.current=useKinex.getState().beginChange('Resize object')}} onPointerUp={finishScale} onPointerCancel={finishScale} onKeyDown={()=>{scaleChange.current??=useKinex.getState().beginChange('Resize object')}} onKeyUp={finishScale} onBlur={finishScale} onChange={(e) => useKinex.getState().updateObject(current.id, { scale: Number(e.target.value) })}/></label>
          <ModelAppearance key={current.id} object={current}/>
          <div className="object-actions"><button data-hand className="button button-small button-secondary" disabled={thinking} onClick={() => duplicate(current)}><Icon name="copy" size={14}/>Duplicate</button><button data-hand className="button button-small button-danger" disabled={thinking} onClick={() => remove(current.id)}><Icon name="trash" size={14}/>Delete</button></div>
        </div>}
      </section>}
    </div>
    <button className="guide-card" data-hand onClick={onGuide}><span className="guide-card-icon"><Icon name="hand" size={19}/></span><span><strong>Your hands. Your controls.</strong><small>Get the 30-second introduction</small></span><Icon name="arrow" size={14}/></button>
    <div className="sidebar-footer"><span className="sunhacks-dot"/>BUILT FOR SUNHACKS 9.0<span>↗</span></div>
  </aside>
}
