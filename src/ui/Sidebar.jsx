import { useEffect, useRef, useState } from 'react'
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

export function Sidebar({ panel = 'models', onClose }) {
  const scaleChange = useRef(null)
  const [pendingStarter, setPendingStarter] = useState(null)
  const objects = useKinex(s=>s.objects)
  const selected = useKinex(s=>s.lastId)
  const inspecting = useKinex(s=>Boolean(s.inspectId))
  const busy = useKinex(s=>s.status.kind==='thinking')
  const current=objects.find(o=>o.id===selected)
  const finishScale=()=>{if(scaleChange.current)useKinex.getState().commitChange(scaleChange.current);scaleChange.current=null}
  useEffect(()=>()=>finishScale(),[])
  const pickStarter=id=>{
    if(objects.length){setPendingStarter(id);return}
    loadStarter(id);onClose()
  }
  const duplicate=object=>{
    const state=useKinex.getState(),token=state.beginChange('Duplicate object'),t=bodies.get(object.id)?.translation()
    const copy={...object,id:newId(object.name),name:`${object.name} copy`.slice(0,40),position:[Math.min(6,(t?.x??object.position[0])+1.5),Math.max(0,(t?.y??object.position[1])-.02),t?.z??object.position[2]],born:performance.now(),parts:object.parts.map(({born,...part})=>({...part})),rev:0}
    state.addObject(copy)
    if(state.hd[object.id]?.status==='ready')state.setHD(copy.id,{...state.hd[object.id],name:copy.name})
    if(token)state.commitChange(token)
  }
  return <div className="drawer-body">
    {panel==='demo'?<LearnPanel onClose={onClose}/>:panel==='models'?<>
      <p className="drawer-intro">Pick a model to explore, or describe your own in the prompt.</p>
      <div className="model-library">{MODEL_CATALOG.map(asset=><button data-hand disabled={busy} key={asset.id} onClick={()=>{runCommand(`Create a ${asset.name}`);onClose()}}><span className={`library-model-icon library-${asset.id}`}><Icon name={asset.id==='ship'?'ship':asset.id==='avocado'?'leaf':asset.id==='bottle'?'bottle':'speaker'} size={34}/></span><span><strong>{asset.name}</strong><small>{asset.id==='ship'?'8 editable color sections':'Textured 3D model'}</small></span><Icon name="plus" size={14}/></button>)}</div>
      <div className="section-heading"><h3>Example worlds</h3><span>Replaces this world</span></div>
      <div className="drawer-starters">{STARTERS.map(starter=><button data-hand disabled={busy} key={starter.id} onClick={()=>pickStarter(starter.id)}><StarterArt kind={starter.id}/><span>{starter.name}</span></button>)}</div>
      {pendingStarter&&<div className="replace-prompt" role="status"><p>Replace your world with this example? Undo can restore it.</p><div><button data-hand className="button button-small button-primary" onClick={()=>{loadStarter(pendingStarter);onClose()}}>Load example</button><button data-hand className="button button-small button-quiet" onClick={()=>setPendingStarter(null)}>Cancel</button></div></div>}
      <p className="model-color-hint">The ship is a Kinex model. Textured assets are credited library models. These load locally.</p>
    </>:<>
      {panel==='objects'&&<>
        <p className="drawer-intro">Select a model to edit it or inspect it from every angle.</p>
        <div className="object-list">{objects.map(object=><div className={`object-row ${selected===object.id?'selected':''}`} key={object.id}><button data-hand className="object-select" aria-pressed={selected===object.id} onClick={()=>useKinex.getState().set({lastId:object.id})}><span className="object-swatch" style={{'--object-color':dominantColor(object)}}><Icon name="cube" size={17}/></span><span><strong>{object.name}</strong><small>{object.source?.assetId?'Detailed model':`${object.parts.length} editable parts`}</small></span></button><button data-hand className="icon-button" aria-label={`Inspect ${object.name}`} disabled={busy} onClick={()=>{enterInspect(object.id);onClose()}}><Icon name="inspect" size={17}/></button></div>)}</div>
      </>}
      {!current?<p className="drawer-intro">Create a model first. Its controls will appear here.</p>:<>
        {inspecting&&panel==='edit'?<InspectPanel onDone={onClose}/>:<>
          <div className="selection-details"><h4>{current.name}</h4><label className="scale-field"><span>Size <strong>{current.scale.toFixed(2)}×</strong></span><input aria-label="Object scale" type="range" min="0.2" max="3" step="0.05" value={current.scale} disabled={busy} onPointerDown={()=>{scaleChange.current=useKinex.getState().beginChange('Resize object')}} onPointerUp={finishScale} onPointerCancel={finishScale} onKeyDown={()=>{scaleChange.current??=useKinex.getState().beginChange('Resize object')}} onKeyUp={finishScale} onBlur={finishScale} onChange={e=>useKinex.getState().updateObject(current.id,{scale:Number(e.target.value)})}/></label><ModelAppearance key={current.id} object={current}/><button data-hand className="button button-secondary inspect-drawer-action" disabled={busy} onClick={()=>{enterInspect(current.id);onClose()}}><Icon name="inspect" size={15}/>Inspect model</button></div>
        </>}
        <div className="object-actions"><button data-hand className="button button-small button-secondary" disabled={busy} onClick={()=>{exitInspect();duplicate(current)}}><Icon name="copy" size={14}/>Duplicate</button><button data-hand className="button button-small button-danger" disabled={busy} onClick={()=>{exitInspect();useKinex.getState().removeObject(current.id)}}><Icon name="trash" size={14}/>Delete</button></div>
      </>}
    </>}
  </div>
}
