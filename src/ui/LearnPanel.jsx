import { useEffect, useState } from 'react'
import { useKinex } from '../store.js'
import { runCommand } from '../ai/commands.js'
import { newWorkspace } from '../lib/starters.js'
import { enterInspect } from '../lib/viewer.js'
import { Icon } from './Icon.jsx'

const STEPS = [
  {title:'A detailed ship, instantly',text:'Load the coastal explorer. Its curved hull, cabins and railings are real 3D geometry.',action:'Create a realistic ship',seconds:'0–15 sec'},
  {title:'Let AI build alongside it',text:'Ask AI for a lighthouse. If the connection drops, the local builder keeps the demo usable.',action:'Create a detailed lighthouse with a red roof, white tower and yellow lamp',seconds:'15–40 sec'},
  {title:'Make it yours, hands first',text:'Select the ship. In Rotate mode, pinch thumb to index and move your hand. Release before your next command.',action:'Select ship & rotate',seconds:'40–65 sec'},
  {title:'Inspect and teach',text:'Compare decks, hull and windows. Try the Ocean palette, switch to wireframe, then undo a color change.',action:'Inspect the ship',seconds:'65–90 sec'},
]

export function LearnPanel({onClose}) {
  const [answer,setAnswer]=useState(null)
  const [now,setNow]=useState(Date.now())
  const objects=useKinex(s=>s.objects)
  const demo=useKinex(s=>s.demo)
  const checks=useKinex(s=>s.lessonChecks)
  const inspecting=useKinex(s=>Boolean(s.lessonChecks.inspected))
  const busy=useKinex(s=>s.status.kind==='thinking')
  const ship=objects.find(o=>o.source?.assetId==='ship')
  useEffect(()=>{if(!demo)return;const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id)},[demo?.startedAt])
  const start=()=>{
    if(busy)return
    newWorkspace()
    useKinex.getState().set({projectName:'Marine design lab',lesson:'marine',lessonChecks:{},demo:{step:0,startedAt:Date.now()}})
    setAnswer(null);setNow(Date.now())
  }
  const act=()=>{
    if(demo.step===2||demo.step===3){
      if(!ship){useKinex.getState().setStatus('error','Create the ship first.');return}
      useKinex.getState().set({lastId:ship.id,handTool:'rotate'})
      if(demo.step===3)enterInspect(ship.id)
      onClose()
    }else {runCommand(STEPS[demo.step].action);onClose()}
  }
  return <div className="learn-panel">
    <p className="eyebrow">LEARN IN THREE DIMENSIONS</p><h2>Marine design lab.</h2>
    <p className="sidebar-intro">Create a passenger ship. Explore how its hull, decks and safety equipment fit together.</p>
    <div className="lesson-fact"><span>LOOK CLOSER</span><h3>Why does a ship float?</h3><p>Water pushes upward on the hull. A ship floats when the weight of the water it displaces balances its own weight.</p><small>This scene illustrates the shape. It does not simulate water or buoyancy.</small></div>
    <ol className="lesson-checks"><li data-done={Boolean(ship)}><Icon name={ship?'check':'cube'} size={14}/>Create a detailed ship</li><li data-done={Boolean(checks.manipulated)}><Icon name={checks.manipulated?'check':'hand'} size={14}/>Turn a model with your hand</li><li data-done={inspecting}><Icon name={inspecting?'check':'inspect'} size={14}/>Inspect its construction</li></ol>
    <p className="lesson-question">Which part displaces most of the water?</p><div className="lesson-answers">{['The hull','The funnel','The radar'].map(label=><button data-hand key={label} aria-pressed={answer===label} onClick={()=>setAnswer(label)}>{label}</button>)}</div>
    {answer && <p className="lesson-answer" role="status">{answer==='The hull'?'Yes. The submerged hull pushes water aside, producing buoyancy.':'Look at the part below the decks. That is the hull.'}</p>}
    <div className="section-heading"><h3>Live demo</h3><span>90-second walkthrough</span></div>
    {!demo?<button data-hand className="button button-primary demo-start" disabled={busy} onClick={start}><Icon name="play" size={13}/>Start the guided demo</button>:<div className="demo-card"><div className="demo-timing"><span>STEP {demo.step+1} OF 4</span><span>{Math.max(0,Math.floor((now-demo.startedAt)/1000))}s / 90s</span></div><h3>{STEPS[demo.step].title}</h3><small>{STEPS[demo.step].seconds}</small><p>{STEPS[demo.step].text}</p><button data-hand disabled={busy} className="button button-primary button-small" onClick={act}>{STEPS[demo.step].action}<Icon name="arrow" size={12}/></button><div className="demo-navigation">{demo.step<3?<button data-hand disabled={busy} onClick={()=>useKinex.getState().set({demo:{...demo,step:demo.step+1}})}>Next step →</button>:<span>Ready to present.</span>}<button data-hand onClick={()=>useKinex.getState().set({demo:null})}>End guide</button></div></div>}
    <p className="model-color-hint">Starting the guide opens a new lab scene. Undo restores your previous world. Step actions run when you choose them.</p>
  </div>
}
