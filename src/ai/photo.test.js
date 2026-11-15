import { beforeEach, describe, expect, it } from 'vitest'
import { useKinex } from '../store.js'
import { buildObject, streamSpawns, applyActions } from './apply.js'
import { RESPONSE_SCHEMA, schemaForParts, PHOTO_PARTS_LIMIT } from './schema.js'

const part = (i) => ({ shape:'box', size:[.1,.1,.1], position:[i*.02,.5,0], color:'#3875A1', material:'plastic' })
beforeEach(() => useKinex.setState({ objects: [], lastId: null }))

describe('detailed photo reconstruction', () => {
  it('keeps more than 24 streamed photo features when the final result arrives', () => {
    const plan = { narration:'A detailed camera.', spawn:[{ name:'camera', at:[0,0,0], parts:Array.from({length:40},(_,i)=>part(i)) }] }
    const live = new Map()
    streamSpawns(plan, live, {maxParts:PHOTO_PARTS_LIMIT})
    expect(useKinex.getState().objects[0].parts).toHaveLength(40)
    applyActions(plan, live, {maxParts:PHOTO_PARTS_LIMIT})
    expect(useKinex.getState().objects).toHaveLength(1)
    expect(useKinex.getState().objects[0].parts).toHaveLength(40)
    expect(useKinex.getState().objects[0].building).toBe(false)
  })
  it('preserves the normal text-build limit and bounds detailed photo geometry', () => {
    const parts=Array.from({length:100},(_,i)=>part(i))
    expect(buildObject({parts},[]).parts).toHaveLength(24)
    expect(buildObject({parts},[],{maxParts:PHOTO_PARTS_LIMIT}).parts).toHaveLength(64)
    expect(buildObject({parts},[],{maxParts:1000}).parts).toHaveLength(96)
  })
  it('raises the photo schema budget without changing the normal response schema', () => {
    expect(schemaForParts(64).properties.spawn.items.properties.parts.maxItems).toBe(64)
    expect(RESPONSE_SCHEMA.properties.spawn.items.properties.parts.maxItems).toBe(24)
  })
})
