import * as THREE from 'three'
import { MODEL_CATALOG, modelURL } from './catalog.js'
import { loadModel } from './HDModel.jsx'
import { awaitModel } from './validateModel.js'
import { buildObject } from '../ai/apply.js'
import { useKinex, bodies, MAX_OBJECTS } from '../store.js'

export async function addLibraryModel(assetId, { position = [0,0,0], signal, replaceId } = {}) {
  if(!replaceId&&useKinex.getState().objects.length>=MAX_OBJECTS)throw new Error(`The world limit is ${MAX_OBJECTS} models.`)
  const asset = MODEL_CATALOG.find((item) => item.id === assetId)
  if (!asset) throw new Error('Unknown library model')
  const url = modelURL(asset)
  signal?.throwIfAborted()
  const scene = await awaitModel(loadModel(url),{signal})
  signal?.throwIfAborted()
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
  const scale = (asset.size || 2.4) / Math.max(size.x,size.y,size.z,1e-6)
  const [w,h,d] = [size.x*scale,size.y*scale,size.z*scale].map((value)=>Math.max(.05,value))
  const state = useKinex.getState()
  const object = buildObject({name:asset.name,position,physics:'dynamic',parts:[{shape:'box',size:[w,h,d],position:[0,h/2,0],color:asset.color,material:'matte'}]},state.objects)
  object.source = {text:asset.name,assetId:asset.id,kind:asset.kind||'library',author:asset.author,license:asset.license,url:asset.source,colorParts:asset.colorParts}
  const existing=state.objects.find(item=>item.id===replaceId)
  if(existing){
    const t=bodies.get(existing.id)?.translation(),q=bodies.get(existing.id)?.rotation()
    Object.assign(object,{id:existing.id,position:t?[t.x,Math.max(0,t.y-.02),t.z]:existing.position,quaternion:q?[q.x,q.y,q.z,q.w]:existing.quaternion,scale:existing.scale,physics:existing.physics,behavior:existing.behavior})
  }
  state.setHD(object.id,{status:'ready',show:true,url,format:'glb',name:asset.name,progress:100,libraryAsset:asset.id,dismissed:true})
  if(existing)state.updateObject(existing.id,object);else state.addObject(object)
  return object.id
}
