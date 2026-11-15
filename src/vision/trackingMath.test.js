import {describe,it,expect} from 'vitest'
import {validHands,matchHands} from './trackingMath.js'
const hand=x=>Array.from({length:21},(_,i)=>({x:x+i*.001,y:.5,z:0}))
describe('tracking continuity',()=>{
 it('rejects corrupt and incomplete detections before smoothing',()=>{
   const invalid=hand(.5);invalid[8].x=NaN
   expect(validHands([hand(.2),invalid,[],hand(.8)]).length).toBe(2)
 })
 it('keeps left/right slots attached when detection order swaps',()=>{
   const a=hand(.2),b=hand(.8),slots=[{present:true,lm:a},{present:true,lm:b}]
   const assignments=matchHands([hand(.79),hand(.21)],slots)
   expect(assignments.find(([slot])=>slot===0)[1][0].x).toBe(.21)
   expect(assignments.find(([slot])=>slot===1)[1][0].x).toBe(.79)
 })
})
