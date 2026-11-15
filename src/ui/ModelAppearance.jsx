import { useState } from 'react'
import { useKinex } from '../store.js'
import { COLORS } from '../ai/local.js'

export const SHIP_PALETTES = [
  {name:'Coastal',colors:{hull:'#D9E0E2',decks:'#F2F0E8',windows:'#213D4B',rails:'#D1D8DA',trim:'#BBA78C',lifeboats:'#EA8C42',funnel:'#DF6E54',vents:'#263337'}},
  {name:'Ocean',colors:{hull:'#1C4264',decks:'#F4F7FB',windows:'#4A839D',rails:'#CFDDE2',trim:'#BBA78C',lifeboats:'#F28C28',funnel:'#E5484D',vents:'#18272E'}},
  {name:'Coral',colors:{hull:'#B84F47',decks:'#FFF0D8',windows:'#234B53',rails:'#E2C6A4',trim:'#C58E54',lifeboats:'#F5B545',funnel:'#314F63',vents:'#29363D'}},
]

export function modelDescription(object) {
  return object.source?.kind==='procedural'?'Kinex detailed model':object.source?.kind==='library'?'Textured library model':object.source?.file?'Imported model':object.source?.kind==='photo'?'Photo approximation':'Editable shape model'
}

export function ModelAppearance({object}) {
  const [part,setPart]=useState('hull')
  const busy=useKinex(s=>s.status.kind==='thinking'||Boolean(s.transaction))
  const sections=object.source?.colorParts
  const change=(patch)=>useKinex.getState().updateObject(object.id,{appearance:{...object.appearance,...patch}})
  return <div className="model-appearance">
    <p className="model-provenance">{modelDescription(object)}{object.source?.author && <small>{object.source.author} · {object.source.license}</small>}</p>
    {sections?.length ? <>
      <div className="section-heading"><h3>Make it yours</h3><span>8 color sections</span></div>
      <div className="ship-palettes">{SHIP_PALETTES.map(p=><button data-hand disabled={busy} key={p.name} onClick={()=>change({color:undefined,partColors:p.colors})} title={`${p.name} ship palette`}><span>{Object.values(p.colors).slice(0,4).map((c,i)=><i style={{background:c}} key={i}/>)}</span>{p.name}</button>)}</div>
      <label className="part-color-label">Color section<select aria-label="Color section" value={part} onChange={e=>setPart(e.target.value)}>{sections.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <div className="color-swatches" aria-label={`Colors for ${part}`}>{Object.entries(COLORS).map(([name,color])=><button data-hand disabled={busy} key={name} style={{background:color}} aria-label={`Paint ${part} ${name}`} title={name} onClick={()=>change({partColors:{...object.appearance?.partColors,[part]:color}})}/>)}</div>
      <p className="model-color-hint">Try “Make the hull blue” or “Paint the decks white”.</p>
    </>:null}
  </div>
}
