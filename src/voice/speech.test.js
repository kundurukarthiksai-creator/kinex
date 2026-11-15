import {describe,it,expect,beforeEach,vi} from 'vitest'
const {runCommand}=vi.hoisted(()=>({runCommand:vi.fn()}))
vi.mock('../ai/commands.js',()=>({runCommand}))
class Recognition {
 static latest
 constructor(){Recognition.latest=this}
 start(){this.onstart?.()}
 stop(){this.onend?.()}
 abort(){this.onerror?.({error:'aborted'});this.onend?.()}
}
vi.stubGlobal('window',{SpeechRecognition:Recognition})
const {startListening,cancelListening}=await import('./speech.js')
const {useKinex}=await import('../store.js')
const result=text=>{const r=[{transcript:text}];r.isFinal=true;return{resultIndex:0,results:[r]}}
beforeEach(()=>{cancelListening();runCommand.mockClear();useKinex.setState({status:{kind:'idle'},voiceError:''})})
describe('voice lifecycle',()=>{
 it('submits final recognition only once even if results or onend are repeated',()=>{
  startListening();const r=Recognition.latest;r.onresult(result('make it blue'));r.onresult(result('make it blue'));r.onend();r.onend()
  expect(runCommand).toHaveBeenCalledExactlyOnceWith('make it blue');expect(useKinex.getState().listening).toBe(false)
 })
 it('allows deliberately repeating a command in a new session',()=>{
  for(let i=0;i<2;i++){startListening();Recognition.latest.onresult(result('bigger'));Recognition.latest.onend()}
  expect(runCommand).toHaveBeenCalledTimes(2)
 })
 it('does not submit a transcript after permission failure and allows retry',()=>{
  startListening();const r=Recognition.latest;r.onresult(result('delete it'));r.onerror({error:'not-allowed'});r.onend()
  expect(runCommand).not.toHaveBeenCalled();expect(useKinex.getState().voiceError).toContain('Allow microphone')
  startListening();expect(useKinex.getState().voiceError).toBe('');expect(useKinex.getState().listening).toBe(true)
 })
 it('ignores late events after cancellation',()=>{
  startListening();const r=Recognition.latest;cancelListening();r.onresult(result('delete it'));r.onend()
  expect(runCommand).not.toHaveBeenCalled();expect(useKinex.getState().listening).toBe(false)
 })
})
