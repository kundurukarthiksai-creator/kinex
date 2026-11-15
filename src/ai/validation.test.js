import {beforeEach,describe,it,expect} from 'vitest'
import {toActions} from './schema.js'
import {applyActions,buildObject,resolveTarget} from './apply.js'
import {runCommand,inspectIntent} from './commands.js'
import {serializeObjects,normalizeSavedObjects} from '../lib/workspace.js'
import {useKinex,bodies} from '../store.js'

const make=name=>buildObject({name,parts:[{shape:'box',size:[1,1,1],color:'#FFFFFF'}]},[])
beforeEach(()=>{bodies.clear();useKinex.setState({objects:[],lastId:null,inspectId:null,hoverId:null,heldIds:[],past:[],future:[],transaction:null,status:{kind:'idle'},hd:{}})})
describe('untrusted AI scene plans',()=>{
 it('ignores malformed list fields and null items without crashing',()=>{
  expect(()=>applyActions({spawn:[null,3,'x'],modify:{color:'#FFFFFF'},remove:27})).not.toThrow()
  expect(toActions({spawn:{name:'bad'},modify:'bad',remove:'everything'})).toEqual([])
 })
 it('requires a literal boolean to clear the world',()=>{
  useKinex.getState().addObject(make('Keep me'))
  applyActions({clear:'false'})
  expect(useKinex.getState().objects).toHaveLength(1)
 })
 it('bounds excessive actions while allowing all streamed spawns to finalize',()=>{
  const spawn=Array.from({length:12},(_,i)=>({name:`piece ${i}`,parts:[{shape:'box',size:[1,1,1]}]}))
  applyActions({clear:true,spawn})
  expect(useKinex.getState().objects).toHaveLength(12)
 })
})
describe('predictable command targets',()=>{
 it('never substitutes a selected model for an explicitly missing model',()=>{
  const a=make('Cruise ship');useKinex.setState({objects:[a],lastId:a.id})
  expect(resolveTarget('nonexistent robot',[a])).toBe(null)
  applyActions({modify:[{targetId:'nonexistent robot',color:'#E5484D'}]})
  expect(useKinex.getState().objects[0].parts[0].color).toBe('#FFFFFF')
 })
 it('bare delete removes only the selected model',async()=>{
  const a=make('Ship'),b=make('Robot');useKinex.setState({objects:[a,b],lastId:a.id})
  await runCommand('delete')
  expect(useKinex.getState().objects.map(o=>o.id)).toEqual([b.id])
 })
 it('uses complete object names for ambiguous multiword models',async()=>{
  const a=make('Water bottle'),b=make('Water tower');useKinex.setState({objects:[a,b],lastId:b.id})
  await runCommand('make the water bottle red')
  expect(useKinex.getState().objects[0].parts[0].color).toBe('#E5484D')
  expect(useKinex.getState().objects[1].parts[0].color).toBe('#FFFFFF')
 })
 it('reports a missing explicit target instead of claiming a successful edit',async()=>{
  const a=make('Ship');useKinex.setState({objects:[a],lastId:a.id})
  await runCommand('make the robot blue')
  expect(useKinex.getState().status.kind).toBe('error')
  expect(useKinex.getState().objects[0].parts[0].color).toBe('#FFFFFF')
 })
 it('does not treat a new creation as a request to refine the inspected object',()=>{
  const a=make('Ship');useKinex.setState({objects:[a],lastId:a.id,inspectId:a.id})
  expect(inspectIntent('Create a robot with more detail')).toBe(false)
  expect(inspectIntent('Create a wireframe rocket')).toBe(false)
 })
})

describe('bounded world persistence',()=>{
 it('keeps excessive AI requests within the same 100-model limit that saves can restore',()=>{
  const seed=Array.from({length:99},(_,i)=>make(`model ${i}`));useKinex.setState({objects:seed,lastId:seed[0].id,limitNotice:false})
  applyActions({spawn:[{name:'a',parts:[{shape:'box',size:[1,1,1]}]},{name:'b',parts:[{shape:'box',size:[1,1,1]}]}]})
  expect(useKinex.getState().objects).toHaveLength(100);expect(useKinex.getState().limitNotice).toBe(true)
  expect(normalizeSavedObjects(serializeObjects(useKinex.getState().objects,new Map())).objects).toHaveLength(100)
 })
})
