import { useKinex, describeScene } from '../store.js'
import { planFromText, planFromImage, planDetail, hasLLM } from './llm.js'
import { offlinePlan } from './fallback.js'
import { localPlan, isCreation, partColorsFromText, COLORS } from './local.js'
import { applyActions, streamSpawns, streamDetail, resolveTarget, MAX_DETAILED_PARTS } from './apply.js'
import { enterInspect, exitInspect, snapView, rotateModel, resetModelRotation } from '../lib/viewer.js'
import { captureFrame } from '../lib/captureFrame.js'
import { exportWorld } from '../lib/exportGltf.js'
import { makeHD } from '../hd/meshes.js'
import { PHOTO_PARTS_LIMIT } from './schema.js'
import { matchLibraryRequest } from '../hd/catalog.js'
import { addLibraryModel } from '../hd/library.js'
import { undoWorld, redoWorld } from '../lib/history.js'
import { beginOperation, endOperation, cancelOperation } from './operations.js'

const cache = new Map()
let unavailableUntil = 0
export { cancelOperation }

function finish(plan, note, live, source, maxParts = 32) {
  const before = new Set(useKinex.getState().objects.map((object)=>object.id))
  const ids = applyActions(plan, live, {maxParts})
  const state = useKinex.getState()
  if(source){
    const liveIds = new Set([...live?.values?.() || []].map((entry)=>entry.id))
    state.set({objects:state.objects.map((object)=>!before.has(object.id)||liveIds.has(object.id)||ids.includes(object.id)?{...object,source:object.source||source}:object)})
  }
  const narration = typeof plan.narration==='string'?plan.narration.slice(0,600):''
  state.set({narration:note?`${note} ${narration}`.trim():narration})
  state.setStatus('done')
}

function instant(plan, kind='local') {
  const state=useKinex.getState(),started=performance.now()
  const token=state.beginChange('Edit world')
  const maxParts = Math.min(96, Math.max(32, ...(plan.spawn || []).map((object) => object.parts?.length || 0)))
  finish(plan,'',new Map(),undefined,maxParts)
  if(token)state.commitChange(token)
  state.set({lastOperation:{kind,ms:Math.round(performance.now()-started)}})
}

const simpleCreation = (text) => /^(?:create|spawn|add|build|make(?: me)?)(?: a| an)?(?: small| big| large| tiny| red| blue| green| yellow| orange| purple| pink| white| black| glowing| metal| wooden| floating)* (?:sphere|ball|cube|box|cylinder|cone|torus|ring|capsule|tree|house|rocket|robot|snowman|tower)[.!?]?$/i.test(text)

export async function runCommand(raw) {
  const text=String(raw||'').trim().slice(0,2000)
  if(!text)return
  const state=useKinex.getState()
  if(/^(?:cancel|stop building|cancel creation)$/i.test(text))return cancelOperation()
  if(state.status.kind==='thinking')return
  state.setSubtitle(text,false)
  if(/^undo(?: that| it)?[.!]?$/i.test(text)){if(!undoWorld())state.set({narration:state.transaction?'Release the object first.':'There is nothing to undo yet.'});return}
  if(/^redo(?: that| it)?[.!]?$/i.test(text)){if(!redoWorld())state.set({narration:'There is nothing to redo yet.'});return}
  if(/^(?:rotate|rotation|move|grab)(?: mode)?[.!]?$/i.test(text)){
    const tool=/rotate|rotation/i.test(text)?'rotate':'move';state.set({handTool:tool,narration:tool==='rotate'?'Rotate mode. Pinch and drag anywhere to turn the selected model.':'Move mode. Pinch over an object to pick it up.'});return
  }
  if(/^(export|download|save)( (it|this|the world|world|scene|everything|the model|model))?\.?$/i.test(text))return exportNow()
  if(/\b(summon|scan|copy|replicate) (this|that|it)\b/i.test(text))return summon()
  if(inspectIntent(text))return
  if(/^(?:add|more) detail(?: to it)?$/i.test(text))return addDetail()
  if(/\bmake (it|this|that|the \w+) (hd|real|realistic|high.?def(inition)?)\b|\b(hd|realistic) (version|model)\b/i.test(text)){
    const object=resolveTarget(text.match(/the (\w+) (hd|real)/i)?.[1]||null,state.objects)
    if(!object){state.setStatus('error','Create an object first.');return}
    const asset=matchLibraryRequest(object.name)||matchLibraryRequest(object.source?.text||'')
    if(asset){
      const operation=beginOperation(`Detail ${object.name}`);if(!operation)return
      try{await addLibraryModel(asset.id,{signal:operation.controller.signal,replaceId:object.id});state.set({narration:`Replaced the shape model with the detailed ${asset.name.toLowerCase()}.`});state.setStatus('done')}
      catch(error){if(!operation.controller.signal.aborted)state.setStatus('error','The detailed model could not load. Your shape is still available.')}
      finally{endOperation(operation,'library')}
    }else makeHD(object.id)
    return
  }
  if(isCreation(text)&&state.inspectId)exitInspect()
  const local=localPlan(text)
  if(local)return instant(local)
  const asset=matchLibraryRequest(text)
  if(asset){
    const operation=beginOperation(`Load ${asset.name}`)
    if(!operation)return
    try{
      const signal=operation.controller.signal
      const id=await addLibraryModel(asset.id,{signal})
      signal.throwIfAborted()
      const partColors=partColorsFromText(text)
      const colorName=Object.keys(COLORS).find(name=>new RegExp(`\\b${name}\\b`).test(text))
      if(Object.keys(partColors).length)state.updateObject(id,{appearance:{partColors}})
      else if(colorName)state.updateObject(id,{appearance:{color:COLORS[colorName]}})
      state.set({narration:asset.kind==='procedural'?'Created the Kinex cruise ship: curved hull, passenger decks, windows and 8 color sections. Try “make the hull blue”.':`Loaded a detailed ${asset.name.toLowerCase()} from the local model library. This is an existing textured asset.`,lessonChecks:{...useKinex.getState().lessonChecks,created:true}})
      state.setStatus('done')
      enterInspect(id)
      return id
    }catch(error){if(!operation.controller.signal.aborted)state.setStatus('error','That library model could not load. Try again or use a simple shape.')}
    finally{endOperation(operation,'library')}
    return
  }
  if(simpleCreation(text))return instant(offlinePlan(text))
  if(cache.has(text.toLowerCase())){
    const plan=structuredClone(cache.get(text.toLowerCase()))
    return instant({...plan,narration:'Reused the shape from your earlier AI creation.'},'cached')
  }
  if(!hasLLM||Date.now()<unavailableUntil||(typeof navigator!=='undefined'&&navigator.onLine===false)){
    state.set({aiState:'offline'})
    const fallback=offlinePlan(text)
    return instant({...fallback,narration:`Offline builder. ${fallback.narration}`},'fallback')
  }
  const operation=beginOperation('Build your idea')
  if(!operation)return
  const maxParts=/realistic|detailed|intricate|high.detail/i.test(text)?64:32
  let kind='ai'
  const live=new Map()
  try{
    const plan=await planFromText(text,describeScene(),(partial)=>streamSpawns(partial,live,{maxParts}),{signal:operation.controller.signal})
    operation.controller.signal.throwIfAborted()
    finish(plan,plan.__partial?'Kept the completed parts after the AI stopped.':'',live,{text,kind:'generated'},maxParts)
    state.set({aiState:plan.__partial?'degraded':'ready',lessonChecks:{...useKinex.getState().lessonChecks,created:true}})
    unavailableUntil=0
    if(isCreation(text)&&plan.spawn?.length&&!plan.modify?.length&&!plan.remove?.length&&!plan.clear&&!plan.environment&&!plan.__partial){
      cache.set(text.toLowerCase(),structuredClone(plan));if(cache.size>12)cache.delete(cache.keys().next().value)
    }
  }catch(error){
    if(!operation.controller.signal.aborted){
      console.warn('[kinex] using offline builder:',String(error.message).slice(0,160))
      unavailableUntil=Date.now()+30000
      state.set({aiState:'offline'})
      finish(offlinePlan(text),'The AI is unavailable; this is the offline version.',live,{text,kind:'offline'},maxParts)
      kind='fallback'
    }
  }finally{endOperation(operation,kind)}
}

export async function summon({frame:suppliedFrame,maxParts=PHOTO_PARTS_LIMIT}={}){
  const state=useKinex.getState()
  if(state.status.kind==='thinking'||state.scanning)return
  const frame=suppliedFrame||captureFrame()
  if(!frame){state.setStatus('error','Enable your camera to capture an object.');return}
  if(!hasLLM){state.setStatus('error','Photo reconstruction needs an AI connection. Local models and shapes still work.');return}
  const operation=beginOperation('Study your object')
  if(!operation)return
  state.setSubtitle('Reconstruct this object',false)
  state.set({scanning:true})
  const live=new Map()
  try{
    let rebuilding=false
    const plan=await planFromImage(frame,describeScene(),(partial)=>{
      const built=streamSpawns(partial,live,{maxParts});if(built&&!rebuilding){rebuilding=true;state.setStatus('thinking','Rebuild your object')}return built
    },{maxParts,signal:operation.controller.signal})
    operation.controller.signal.throwIfAborted()
    if(!plan.spawn?.some((object)=>object.parts?.length)){state.setStatus('error','Hold one object near the center in good light, then try again.');return}
    finish(plan,plan.__partial?'Rebuilt the completed features.':'',live,{text:'summon',photo:`data:image/jpeg;base64,${frame}`,maxParts,kind:'photo'},maxParts)
    state.set({aiState:'ready'})
  }catch(error){if(!operation.controller.signal.aborted)state.setStatus('error','Photo reconstruction is unavailable. Your existing world is unchanged; local models still work.')}
  finally{state.set({scanning:false});endOperation(operation,'photo')}
}

export async function exportNow(){
  const state=useKinex.getState()
  if(!state.objects.length){state.setStatus('error','Create an object before exporting.');return}
  try{await exportWorld();state.set({narration:'Your 3D model is downloading as a GLB file.'});state.setStatus('done')}
  catch{state.setStatus('error','Export could not finish. Try again after the model loads.')}
}

// Inspect-mode phrases handled locally, so they're instant. Returns true if handled.
export function inspectIntent(raw) {
  const t = raw.toLowerCase().replace(/[.!?]+$/, '').trim()
  const st = useKinex.getState()
  const inspecting = Boolean(st.inspectId)

  const open = t.match(/^(inspect|examine|look at|zoom in on|open)\b\s*(?:the\s+)?(.*)$/)
  if (open) {
    const ref = open[2].replace(/^(it|this|that)$/, '')
    const target = resolveTarget(ref || null, st.objects)
    if (!target) {
      st.setStatus('error', 'Build something first, then inspect it.')
      return true
    }
    enterInspect(target.id)
    return true
  }
  if (!inspecting) return false

  if (/^(done|exit|close|back|leave|stop inspecting|go back)\b/.test(t)) {
    exitInspect()
    return true
  }
  const view = t.match(/\b(top|front|back|bottom|left|right|side|iso|isometric)\b.*\bview\b|^(?:show (?:the )?)?(top|front|back|bottom|left|right|side)$/)
  if (view) {
    snapView((view[1] || view[2]).replace('isometric', 'iso'))
    return true
  }
  const rot = t.match(/\b(?:rotate|turn|spin|flip)\b(?:\s+(?:it|this|the model))?(?:\s+by)?\s*(-?\d+)?\s*(?:deg(?:rees)?|°)?\s*(?:on|around|about|along)?\s*(?:the\s+)?([xyz])(?:[\s-]*axis)?\b/)
  if (rot) {
    rotateModel(rot[2], Number(rot[1] || 90))
    return true
  }
  if (/^reset$|\b(reset|straighten)\b.*\b(rotation|orientation|it|model)\b/.test(t)) {
    resetModelRotation()
    return true
  }
  if (/\b(explode|exploded|take it apart|pull apart|break apart)\b/.test(t)) {
    st.setInspect({ explode: 1 })
    return true
  }
  if (/\b(assemble|put it back|collapse|unexplode)\b/.test(t)) {
    st.setInspect({ explode: 0 })
    return true
  }
  const wire = t.match(/\bwire ?frame\b(?:\s+(on|off))?/)
  if (wire) {
    st.setInspect({ wireframe: wire[1] ? wire[1] === 'on' : !st.inspect.wireframe })
    return true
  }
  if (/\b(add|more)\b.*\bdetail|^(?:make it )?detailed$|\brefine\b/.test(t)) {
    addDetail()
    return true
  }
  return false
}

export async function addDetail(id){
  const state=useKinex.getState()
  const object=state.objects.find((item)=>item.id===(id||state.inspectId||state.lastId))
  if(!object||state.status.kind==='thinking'||state.inspect.refining)return
  if(!hasLLM){state.setStatus('error','Connect AI to add new geometry. Local inspection and edits are available.');return}
  if(object.parts.length>=MAX_DETAILED_PARTS){state.setStatus('error','This model has reached the editable part limit.');return}
  const operation=beginOperation('Add model detail')
  if(!operation)return
  state.setInspect({refining:true})
  const live={n:0}
  try{
    const plan=await planDetail(object,(partial)=>streamDetail(partial,object.id,live),{signal:operation.controller.signal})
    operation.controller.signal.throwIfAborted()
    streamDetail(plan,object.id,live)
    state.set({narration:typeof plan.narration==='string'?plan.narration:'Added model detail.'});state.setStatus('done')
  }catch(error){if(!operation.controller.signal.aborted)state.setStatus('error',live.n?`Kept ${live.n} completed details.`:'The AI did not respond. Your model is still available.')}
  finally{state.setInspect({refining:false});endOperation(operation,'ai')}
}
