import { describe,it,expect,beforeEach } from 'vitest'
import { localPlan,partColorsFromText,COLORS } from './local.js'
import { matchLibraryRequest } from '../hd/catalog.js'
import { offlinePlan } from './fallback.js'
import { applyActions,buildObject } from './apply.js'
import { useKinex } from '../store.js'

beforeEach(()=>useKinex.setState({objects:[],lastId:null,hoverId:null,inspectId:null,heldIds:[],past:[],future:[],transaction:null}))
const make=(name)=>buildObject({name,parts:[{shape:'box',size:[1,1,1]}]},[])
describe('fast scene commands',()=>{
  it('routes ship requests to detailed geometry and avoids unrelated compound requests',()=>{
    expect(matchLibraryRequest('Create a realistic cruise ship with a red hull')?.id).toBe('ship')
    expect(matchLibraryRequest('a blue ship')?.id).toBe('ship')
    expect(matchLibraryRequest('Can you please create a multicolored ship?')?.id).toBe('ship')
    expect(matchLibraryRequest('I want a realistic ship')?.id).toBe('ship')
    expect(matchLibraryRequest('Create a robot with a speaker')).toBe(null)
  })
  it('does not treat a creation as a color edit',()=>expect(localPlan('Create a red sphere')).toBe(null))
  it('parses independent color sections in either word order',()=>{
    expect(partColorsFromText('a ship with a red hull and blue windows')).toEqual({hull:COLORS.red,windows:COLORS.blue})
    expect(partColorsFromText('make the decks white and funnel orange')).toEqual({decks:COLORS.white,funnel:COLORS.orange})
  })
  it('changes colors on the selected object while preserving other model sections',()=>{
    const a=make('Ship'),b=make('Rocket');a.source={colorParts:['hull','windows']};a.appearance={partColors:{windows:COLORS.blue}}
    useKinex.setState({objects:[a,b],lastId:a.id})
    applyActions(localPlan('Make the hull red'))
    expect(useKinex.getState().objects[0].appearance.partColors).toEqual({hull:COLORS.red,windows:COLORS.blue})
    expect(useKinex.getState().objects[1].appearance).toBeUndefined()
    applyActions(localPlan('Make it green'))
    expect(useKinex.getState().objects[0].appearance.color).toBe(COLORS.green)
    expect(useKinex.getState().objects[0].appearance.partColors).toBeUndefined()
  })
  it('handles environment edits without an object or network',()=>{
    applyActions(localPlan('Turn off gravity'));expect(useKinex.getState().environment.gravity).toBe('zero')
    applyActions(localPlan('Set lighting to sunset'));expect(useKinex.getState().environment.preset).toBe('sunset')
  })
  it('does not silently replace an unsupported offline subject with a cube',()=>{
    expect(offlinePlan('Create a kangaroo').actions).toEqual([])
    expect(offlinePlan('Create a lighthouse').actions[0].parts.length).toBeGreaterThan(6)
    expect(offlinePlan('Create a cylinder').actions[0].parts[0].shape).toBe('cylinder')
  })
})
