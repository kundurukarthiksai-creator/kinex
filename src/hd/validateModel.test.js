import {describe,it,expect,vi} from 'vitest'
import * as THREE from 'three'
import {validateModelScene,awaitModel} from './validateModel.js'

describe('imported mesh validation',()=>{
 it('accepts finite real geometry and reports bounds',()=>{
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(2,3,4),new THREE.MeshStandardMaterial()))
  expect(validateModelScene(scene).size.toArray()).toEqual([2,3,4])
 })
 it('rejects an empty group and invalid coordinates before mounting',()=>{
  expect(()=>validateModelScene(new THREE.Group())).toThrow('no usable mesh')
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.geometry.attributes.position.setX(0,NaN)
  expect(()=>validateModelScene(mesh)).toThrow('invalid geometry')
 })
 it('rejects excessive geometry before traversing its vertex data',()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(750001*3),3))
  expect(()=>validateModelScene(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()))).toThrow('too complex')
 })
 it('bounds asset waits and ignores a late resolution',async()=>{
  await expect(awaitModel(new Promise(()=>{}),{timeoutMs:5})).rejects.toThrow('too long')
 })
 it('cancels pending asset loads immediately',async()=>{
  const controller=new AbortController(),pending=awaitModel(new Promise(()=>{}),{signal:controller.signal});controller.abort()
  await expect(pending).rejects.toMatchObject({name:'AbortError'})
 })
})
