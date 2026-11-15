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
