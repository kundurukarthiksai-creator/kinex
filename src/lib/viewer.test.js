import{beforeEach,describe,it,expect,vi}from'vitest'
import * as THREE from 'three'
import{useKinex}from'../store.js'
import{buildObject}from'../ai/apply.js'
import{viewer,enterInspect,exitInspect,flushPendingInspect}from'./viewer.js'
beforeEach(()=>{viewer.controls=null;viewer.camera=null;viewer.saved=null;viewer.pendingInspect=null;useKinex.setState({objects:[],inspectId:null})})
describe('camera startup ordering',()=>{
 it('honors an inspection selected before the 3D camera controls finish mounting',()=>{
  const o=buildObject({name:'Ship',parts:[{shape:'box',size:[1,1,1]}]},[]);useKinex.setState({objects:[o]})
  enterInspect(o.id);expect(viewer.pendingInspect).toBe(o.id)
  viewer.controls={getPosition:()=>new THREE.Vector3(0,4,13),getTarget:()=>new THREE.Vector3(0,1,0),setLookAt:vi.fn(),setFocalOffset:vi.fn()};viewer.camera={fov:40,aspect:1.5}
  flushPendingInspect();expect(useKinex.getState().inspectId).toBe(o.id);expect(viewer.pendingInspect).toBe(null);expect(viewer.controls.setLookAt).toHaveBeenCalled()
 })
 it('cancels a pending inspection when the user returns to the world',()=>{
  const o=buildObject({parts:[{shape:'box',size:[1,1,1]}]},[]);useKinex.setState({objects:[o]});enterInspect(o.id);exitInspect();expect(viewer.pendingInspect).toBe(null)
 })
})
