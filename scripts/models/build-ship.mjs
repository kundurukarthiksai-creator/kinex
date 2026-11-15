import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mkdir, writeFile } from 'node:fs/promises'

// Original, deterministic cruise-ship mesh. Units are arbitrary model meters.
const scene = new THREE.Scene()
scene.name = 'Kinex coastal explorer'
const ship = new THREE.Group(); ship.name = 'Cruise ship'; ship.rotation.y = -.43; scene.add(ship)
const materials = {
  hull: new THREE.MeshStandardMaterial({color:'#D9E0E2',roughness:.32,metalness:.35}),
  decks: new THREE.MeshStandardMaterial({color:'#F2F0E8',roughness:.45,metalness:.05}),
  windows: new THREE.MeshPhysicalMaterial({color:'#213D4B',roughness:.13,metalness:.45,clearcoat:1}),
  rails: new THREE.MeshStandardMaterial({color:'#D1D8DA',roughness:.24,metalness:.78}),
  trim: new THREE.MeshStandardMaterial({color:'#BBA78C',roughness:.7}),
  lifeboats: new THREE.MeshStandardMaterial({color:'#EA8C42',roughness:.4}),
  funnel: new THREE.MeshStandardMaterial({color:'#DF6E54',roughness:.4,metalness:.2}),
  vents: new THREE.MeshStandardMaterial({color:'#263337',roughness:.6}),
}
const groups = Object.fromEntries(Object.keys(materials).map(key=>[key,[]]))
const add=(part,geometry,position=[0,0,0],rotation=[0,0,0])=>{
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1))
  const g=geometry.clone().applyMatrix4(matrix)
  g.deleteAttribute('uv');g.deleteAttribute('uv1')
  if(g.index)groups[part].push(g.toNonIndexed());else groups[part].push(g)
}
const beam=(x)=>{
  const u=(x+3.9)/8.2
  const bow=Math.sqrt(Math.max(.0003,1-Math.pow(u,5.2)))
  const stern=.77+.23*Math.min(1,u*7)
  return 1.43*bow*stern
}
const vertices=[],indices=[]
const longitudinal=100,cross=48
for(let i=0;i<=longitudinal;i++){
  const x=-3.9+8.2*i/longitudinal
  const u=i/longitudinal,bottom=.08+.40*Math.pow(u,5),top=1.63+.07*Math.pow(u,4)
  for(let j=0;j<=cross;j++){
    const angle=-Math.PI/2+Math.PI*j/cross
    vertices.push(x,bottom+(top-bottom)*(1-Math.cos(angle)),beam(x)*Math.sin(angle))
  }
}
for(let i=0;i<longitudinal;i++)for(let j=0;j<cross;j++){
 const a=i*(cross+1)+j,b=a+cross+1,c=a+1,d=b+1
 indices.push(a,b,c,c,b,d)
}
const hull=new THREE.BufferGeometry()
hull.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals()
add('hull',hull)
for(const [x,side]of [[-3.9,-1],[4.3,1]]){
 const u=(x+3.9)/8.2,bottom=.08+.40*Math.pow(u,5),top=1.63+.07*Math.pow(u,4)
 const cap=new THREE.Shape()
 for(let i=0;i<=cross;i++){const a=-Math.PI/2+Math.PI*i/cross,z=beam(x)*Math.sin(a),y=bottom+(top-bottom)*(1-Math.cos(a));i?cap.lineTo(z,y):cap.moveTo(z,y)}
 cap.closePath();add('hull',new THREE.ShapeGeometry(cap,32),[x,0,0],[0,side*Math.PI/2,0])
}


function deckShape(length,width,radius=.25){
 const x=-length/2,z=-width/2,r=Math.min(radius,width/2)
 const shape=new THREE.Shape();shape.moveTo(x+r,z);shape.lineTo(x+length-r,z);shape.quadraticCurveTo(x+length,z,x+length,z+r);shape.lineTo(x+length,z+width-r);shape.quadraticCurveTo(x+length,z+width,x+length-r,z+width);shape.lineTo(x+r,z+width);shape.quadraticCurveTo(x,z+width,x,z+width-r);shape.lineTo(x,z+r);shape.quadraticCurveTo(x,z,x+r,z)
 return shape
}
const outline=new THREE.Shape()
for(let i=0;i<=100;i++){const x=-3.9+8.2*i/100; i?outline.lineTo(x,beam(x)):outline.moveTo(x,beam(x))}
for(let i=100;i>=0;i--){const x=-3.9+8.2*i/100;outline.lineTo(x,-beam(x))}
outline.closePath()
const deck=new THREE.ExtrudeGeometry(outline,{depth:.10,bevelEnabled:true,bevelSegments:3,bevelSize:.035,bevelThickness:.035,steps:1,curveSegments:18})
add('decks',deck,[0,1.64,0],[-Math.PI/2,0,0])

const levels=[{x:-.20,y:1.78,length:6.55,width:2.18,height:.66},{x:-.28,y:2.50,length:5.90,width:1.95,height:.63},{x:-.55,y:3.20,length:4.80,width:1.67,height:.52}]
for(const [index,level]of levels.entries()){
 add('decks',new RoundedBoxGeometry(level.length,level.height,level.width,3,.045),[level.x,level.y+level.height/2,0])
 const roof=new THREE.ExtrudeGeometry(deckShape(level.length+.25,level.width+.24,.18),{depth:.085,bevelEnabled:true,bevelSegments:2,bevelSize:.02,bevelThickness:.02,steps:1})
 add('decks',roof,[level.x,level.y+level.height+.045,0],[-Math.PI/2,0,0])
 const count=Math.floor((level.length-.4)/.37)
 for(let n=0;n<count;n++){
  const x=level.x-level.length/2+.28+n*(level.length-.56)/(count-1)
  for(const sign of [-1,1]){
   add('windows',new RoundedBoxGeometry(.235,level.height*.6,.022,2,.025),[x,level.y+level.height*.55,sign*(level.width/2+.012)])
  }
 }
 const countEnd=Math.floor(level.width/.32)
 for(let n=0;n<countEnd;n++)for(const sign of [-1,1]){
  const z=-level.width/2+.24+n*(level.width-.48)/(countEnd-1)
  add('windows',new RoundedBoxGeometry(.022,level.height*.56,.22,2,.02),[level.x+sign*(level.length/2+.01),level.y+level.height*.55,z])
 }
 const railY=level.y+level.height+.25,railZ=level.width/2+.075
 for(const sign of [-1,1]){
  for(const height of [railY,railY-.10])add('rails',new CylinderGeometry(.012,level.length+.15,8),[level.x,height,sign*railZ],[0,0,Math.PI/2])
  const posts=Math.floor(level.length/.30)
  for(let n=0;n<=posts;n++)add('rails',new CylinderGeometry(.010,.24,6),[level.x-level.length/2+n*level.length/posts,railY-.12,sign*railZ])
 }
}
function CylinderGeometry(radius,height,segments=20){return new THREE.CylinderGeometry(radius,radius,height,segments)}
// Open upper walkway and bridge, with wraparound windows.
add('trim',new RoundedBoxGeometry(3.7,.06,1.35,2,.03),[-.5,3.84,0])
add('decks',new RoundedBoxGeometry(1.6,.47,1.3,3,.09),[1.1,3.52,0])
for(let n=0;n<4;n++)add('windows',new RoundedBoxGeometry(.025,.22,.22,2,.02),[1.91,3.58,-.43+n*.29])
// Twin-color funnel, exhaust cap and ventilation slats.
add('funnel',new THREE.CylinderGeometry(.31,.39,.70,40),[-.85,4.18,0])
add('vents',new THREE.CylinderGeometry(.315,.315,.09,40),[-.85,4.56,0])
add('decks',new THREE.TorusGeometry(.25,.045,10,40),[-.85,4.61,0],[Math.PI/2,0,0])
add('vents',new THREE.CylinderGeometry(.24,.24,.015,32),[-.85,4.61,0])
for(let n=0;n<9;n++)add('vents',new THREE.BoxGeometry(.022,.18,.43),[-2.15+n*.07,3.95,0])
// Bow rail follows the hull; lifeboats and safety rings add recognizable color.
const railCurve=[]
for(let i=0;i<=180;i++){
 const x=-3.78+7.75*i/180;railCurve.push(new THREE.Vector3(x,1.98,beam(x)*.97))
}
for(const sign of [-1,1]){
 const curve=new THREE.CatmullRomCurve3(railCurve.map(p=>new THREE.Vector3(p.x,p.y,sign*p.z)))
 add('rails',new THREE.TubeGeometry(curve,110,.014,6,false))
 for(let n=0;n<40;n++){
  const x=-3.65+n*7.3/39;add('rails',CylinderGeometry(.012,.26,6),[x,1.85,sign*beam(x)*.97])
 }
 for(const x of [-2.1,-.8,.5]){
  add('lifeboats',new THREE.CapsuleGeometry(.105,.55,5,12),[x,2.12,sign*1.20],[0,0,Math.PI/2])
  add('decks',new THREE.BoxGeometry(.43,.035,.18),[x,2.22,sign*1.20])
 }
 for(const x of [-2.8,2.1])add('lifeboats',new THREE.TorusGeometry(.10,.035,8,20),[x,2.07,sign*1.12])
}
// Navigation mast and radar.
add('rails',CylinderGeometry(.022,.75,10),[.30,4.08,0])
add('decks',new RoundedBoxGeometry(.55,.055,.13,2,.02),[.30,4.48,0],[0,.25,0])
add('windows',new THREE.SphereGeometry(.055,16,12),[.30,4.58,0])
for(const [part,geometries]of Object.entries(groups)){
 if(!geometries.length)continue
 const geometry=mergeGeometries(geometries,false)
 geometry.computeBoundingSphere()
 const mesh=new THREE.Mesh(geometry,materials[part]);mesh.name=part;mesh.userData={kinexPart:part};mesh.castShadow=true;mesh.receiveShadow=true;ship.add(mesh)
}

scene.userData={generator:'Kinex original procedural cruise ship',colorParts:Object.keys(materials)}
globalThis.FileReader=class{
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.()})}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.()})}
}
const binary=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true})
await mkdir('public/models',{recursive:true})
await writeFile('public/models/CruiseShip.glb',Buffer.from(binary))
console.log(`Built cruise ship: ${ship.children.length} material groups, ${(binary.byteLength/1024/1024).toFixed(2)} MB`)
