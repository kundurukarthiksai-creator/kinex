import { describe,it,expect,beforeEach,vi } from 'vitest'
import { useKinex,bodies } from '../store.js'
import { applyActions,streamSpawns,buildObject } from '../ai/apply.js'
import { beginOperation,endOperation,cancelOperation } from '../ai/operations.js'

const object=()=>buildObject({name:'Test',parts:[{shape:'box',size:[1,1,1]}]},[])
beforeEach(()=>{bodies.clear();useKinex.setState({objects:[],past:[],future:[],transaction:null,hd:{},status:{kind:'idle'},lastId:null,worldEpoch:0})})
describe('transactional world history',()=>{
  it('undoes an entire streamed build with one entry and no delayed objects returning',async()=>{
    const state=useKinex.getState(),token=state.beginChange('AI world'),live=new Map()
    const spawn=[1,2,3].map(n=>({name:`Tree ${n}`,parts:[{shape:'box',size:[1,1,1]}]}))
    streamSpawns({spawn:spawn.slice(0,1)},live)
    streamSpawns({spawn},live)
    applyActions({spawn},live)
    state.commitChange(token)
    expect(useKinex.getState().objects).toHaveLength(3)
    expect(useKinex.getState().past).toHaveLength(1)
    expect(state.undo()).toBe(true)
    await new Promise(resolve=>setTimeout(resolve,160))
    expect(useKinex.getState().objects).toHaveLength(0)
    expect(state.redo()).toBe(true)
    expect(useKinex.getState().objects).toHaveLength(3)
  })
  it('restores live position, quaternion, scale and local model references',()=>{
    const s=useKinex.getState(),o=object();s.set({objects:[o],hd:{[o.id]:{status:'ready',url:'/models/CruiseShip.glb',libraryAsset:'ship'}}})
    bodies.set(o.id,{translation:()=>({x:2,y:3.02,z:-1}),rotation:()=>({x:0,y:.6,z:0,w:.8})})
    const token=s.beginChange('Manipulate');s.updateObject(o.id,{scale:2});s.commitChange(token)
    s.undo();const state=useKinex.getState()
    expect(state.objects[0].position).toEqual([2,3,-1]);expect(state.objects[0].quaternion).toEqual([0,.6,0,.8]);expect(state.objects[0].scale).toBe(1)
    expect(state.hd[o.id].libraryAsset).toBe('ship');expect(state.worldEpoch).toBe(1)
    s.redo();expect(useKinex.getState().objects[0].scale).toBe(2)
  })
  it('clears redo after a new edit and groups clearing multiple models',()=>{
    const s=useKinex.getState();s.addObject(object());s.addObject(object());s.clear()
    expect(useKinex.getState().past.at(-1).label).toBe('Clear world');s.undo();expect(useKinex.getState().objects).toHaveLength(2)
    s.setEnvironment({gravity:'low'});expect(useKinex.getState().future).toHaveLength(0)
  })
  it('cancel restores the previous world without adding an undo entry',()=>{
    const s=useKinex.getState();s.addObject(object());const before=s.objects,entries=useKinex.getState().past.length
    const op=beginOperation('Test stream');s.addObject(object());expect(s.undo()).toBe(false)
    expect(cancelOperation()).toBe(true);expect(op.controller.signal.aborted).toBe(true);endOperation(op,'ai')
    expect(useKinex.getState().objects).toHaveLength(1);expect(useKinex.getState().past).toHaveLength(entries);expect(useKinex.getState().operation).toBe(null)
  })
})
