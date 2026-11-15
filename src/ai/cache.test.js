import{beforeEach,describe,it,expect,vi}from'vitest'
const{planFromText}=vi.hoisted(()=>({planFromText:vi.fn()}))
vi.mock('./llm.js',()=>({hasLLM:true,planFromText,planFromImage:vi.fn(),planDetail:vi.fn()}))
import{runCommand}from'./commands.js'
import{useKinex}from'../store.js'
beforeEach(()=>{planFromText.mockReset();useKinex.setState({objects:[],hd:{},lastId:null,inspectId:null,hoverId:null,heldIds:[],past:[],future:[],transaction:null,operation:null,status:{kind:'idle'}})})
describe('AI cache poisoning recovery',()=>{
 it.each([{spawn:[null],suffix:'null'},{spawn:'wrong type',suffix:'string'}])('does not cache malformed creation arrays: $suffix',async({spawn,suffix})=>{
  planFromText.mockResolvedValue({narration:'Incomplete model',spawn})
  const prompt=`Create a detailed crystal dragon with ${suffix} details`
  await expect(runCommand(prompt)).resolves.toBeUndefined()
  await expect(runCommand(prompt)).resolves.toBeUndefined()
  expect(planFromText).toHaveBeenCalledTimes(2)
  expect(useKinex.getState().objects).toHaveLength(0)
  expect(useKinex.getState().transaction).toBe(null)
 })
})
