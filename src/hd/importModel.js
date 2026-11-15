import { useKinex, MAX_OBJECTS } from '../store.js'
import { buildObject } from '../ai/apply.js'
import { loadModel, forgetModel } from './HDModel.jsx'
import { MAX_IMPORT_BYTES,validateModelScene,awaitModel } from './validateModel.js'
import { beginOperation,endOperation } from '../ai/operations.js'

export const IMPORT_EXTENSIONS=['glb','gltf','obj','stl']
const LONGEST_SIDE=2.2

export async function importModelFile(file){
  const state=useKinex.getState()
  if(state.objects.length>=MAX_OBJECTS){state.setStatus('error',`Delete a model before importing; the world limit is ${MAX_OBJECTS}.`);return}
  const ext=file.name.split('.').pop().toLowerCase()
  if(!IMPORT_EXTENSIONS.includes(ext)){state.setStatus('error','Choose a GLB, embedded GLTF, OBJ or STL file.');return}
  if(!file.size||file.size>MAX_IMPORT_BYTES){state.setStatus('error',file.size?'Choose a model smaller than 30 MB.':'That file is empty. Choose a valid 3D model.');return}
  const operation=beginOperation(`Open ${file.name}`)
  if(!operation)return
  const format=ext==='gltf'?'glb':ext
  let url
  try{
    url=URL.createObjectURL(file)
    const scene=await awaitModel(loadModel(url,format),{signal:operation.controller.signal})
    operation.controller.signal.throwIfAborted()
    const {size}=validateModelScene(scene)
    const k=LONGEST_SIDE/Math.max(size.x,size.y,size.z)
    const [w,h,d]=[size.x*k,size.y*k,size.z*k].map(n=>Math.max(n,.05))
    const name=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim().slice(0,40)||'Model'
    const object=buildObject({name,position:[0,0,0],physics:'dynamic',parts:[{shape:'box',size:[w,h,d],position:[0,h/2,0],color:'#B8BFCC',material:'matte'}]},useKinex.getState().objects)
    object.source={text:name,file:file.name}
    state.setHD(object.id,{status:'ready',url,format,name,progress:100,imported:true,dismissed:true})
    state.addObject(object)
    state.set({narration:`Opened ${file.name}. Choose Inspect to see it from every side.`});state.setStatus('done')
    return object.id
  }catch(error){
    if(url){forgetModel(url);URL.revokeObjectURL(url)}
    if(!operation.controller.signal.aborted)state.setStatus('error',error?.message&&/mesh|geometry|bounds|textures|load/.test(error.message)?error.message:`Could not read ${file.name}. Choose a valid, self-contained ${ext.toUpperCase()} file.`)
  }finally{endOperation(operation,'import')}
}
