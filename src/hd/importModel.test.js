import {beforeEach,describe,it,expect,vi} from 'vitest'
import * as THREE from 'three'
const {loadModel}=vi.hoisted(()=>({loadModel:vi.fn()}))
vi.mock('./HDModel.jsx',()=>({loadModel,forgetModel:vi.fn()}))
import {importModelFile} from './importModel.js'
import {useKinex} from '../store.js'
beforeEach(()=>{loadModel.mockReset();useKinex.setState({objects:[],hd:{},past:[],future:[],transaction:null,status:{kind:'idle'}})})
describe('import failure recovery',()=>{
 it('rejects oversized files before loading or allocating an object URL',async()=>{
  await importModelFile({name:'huge.glb',size:31*1024*1024})
  expect(loadModel).not.toHaveBeenCalled();expect(useKinex.getState().status.kind).toBe('error');expect(useKinex.getState().status.text).toContain('30 MB')
 })
 it('does not save an empty OBJ as a ready invisible model',async()=>{
  loadModel.mockResolvedValue(new THREE.Group())
  await importModelFile(new File(['# no geometry'],'empty.obj'))
  expect(useKinex.getState().objects).toHaveLength(0);expect(useKinex.getState().status.kind).toBe('error');expect(useKinex.getState().transaction).toBe(null)
 })
 it('imports a valid mesh as one undoable operation',async()=>{
  loadModel.mockResolvedValue(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()))
  await importModelFile(new File(['mesh'],'valid.obj'))
  expect(useKinex.getState().objects).toHaveLength(1);expect(useKinex.getState().past).toHaveLength(1)
  useKinex.getState().undo();expect(useKinex.getState().objects).toHaveLength(0)
 })
})
