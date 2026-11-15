import * as THREE from 'three'

export const MAX_IMPORT_BYTES=30*1024*1024
const MAX_VERTICES=750000,MAX_TRIANGLES=500000

export function validateModelScene(scene){
  let meshes=0,vertices=0,triangles=0
  scene.traverse(object=>{
    if(!object.isMesh)return
    const positions=object.geometry?.attributes?.position
    if(!positions||positions.count<3)return
    meshes++;vertices+=positions.count;triangles+=(object.geometry.index?.count||positions.count)/3
    if(vertices>MAX_VERTICES||triangles>MAX_TRIANGLES)throw new Error('This mesh is too complex. Use fewer than 750,000 vertices and 500,000 triangles.')
    for(let i=0;i<positions.count;i++)if(!Number.isFinite(positions.getX(i))||!Number.isFinite(positions.getY(i))||!Number.isFinite(positions.getZ(i)))throw new Error('The model contains invalid geometry coordinates.')
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      for(const value of Object.values(material||{})){
        if(!value?.isTexture)continue
        const image=value.image
        if(image&&(image.width>8192||image.height>8192))throw new Error('Use textures no larger than 8192 pixels per side.')
      }
    }
  })
  if(!meshes)throw new Error('The file has no usable mesh geometry.')
  scene.updateMatrixWorld(true)
  const box=new THREE.Box3().setFromObject(scene),size=box.getSize(new THREE.Vector3())
  if(![...box.min,...box.max,...size].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<1e-6)throw new Error('The model has invalid or empty bounds.')
  return {size,vertices,triangles,meshes}
}

export function awaitModel(promise,{signal,timeoutMs=15000}={}){
  signal?.throwIfAborted()
  return new Promise((resolve,reject)=>{
    let settled=false
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value)}
    const abort=()=>finish(reject,new DOMException('Canceled','AbortError'))
    const timer=setTimeout(()=>finish(reject,new Error('The model took too long to load. Try a smaller, self-contained file.')),timeoutMs)
    signal?.addEventListener('abort',abort,{once:true})
    promise.then(value=>finish(resolve,value),error=>finish(reject,error))
  })
}
