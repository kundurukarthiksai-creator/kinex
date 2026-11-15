import {describe,it,expect} from 'vitest'
import {MeshStandardMaterial} from 'three'
import {applyAppearance} from './appearance.js'

describe('portable material edits',()=>{
 it('stores new colors and finishes in standard material properties',()=>{
  const material=new MeshStandardMaterial({color:'#ffffff'})
  applyAppearance(material,{color:'#E5484D',material:'metal'})
  expect(material.color.getHexString()).toBe('e5484d');expect(material.metalness).toBe(.9);expect(material.roughness).toBe(.22)
 })
})

describe('visible material commands on detailed meshes',()=>{
 it('makes an actual mesh glow rather than only changing its invisible proxy',()=>{
  const material=new MeshStandardMaterial({color:'#E5484D'})
  applyAppearance(material,{material:'glow'})
  expect(material.emissiveIntensity).toBeGreaterThan(1)
  expect(material.emissive.getHexString()).toBe('e5484d')
 })
 it('applies a transparent glass approximation',()=>{
  const material=new MeshStandardMaterial()
  applyAppearance(material,{material:'glass'})
  expect(material.transparent).toBe(true)
  expect(material.opacity).toBeLessThan(.6)
 })
})
