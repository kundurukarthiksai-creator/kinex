import { useKinex } from '../store.js'
import { runCommand } from '../ai/commands.js'

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const hasSpeech = Boolean(Recognition)
let recognition = null
let session = 0

const ERRORS = {
  'not-allowed':'Allow microphone access in your browser, then try again.',
  'service-not-allowed':'Voice input is blocked by this browser. Try Chrome or Edge, or type your command.',
  'audio-capture':'No microphone was found. Connect a microphone or type your command.',
  network:'Voice recognition could not reach its service. Try again or type; local scene commands still work.',
  'no-speech':'No speech was heard. Tap the microphone and speak a short command.',
}

export function startListening() {
  const state=useKinex.getState()
  if(state.status.kind==='thinking'||recognition)return
  if(!Recognition){state.set({voiceState:'error',voiceError:'Voice is available in Chrome and Edge.'});state.setStatus('error','Voice is available in Chrome and Edge. You can type the same commands.');return}
  const ticket=++session
  let current
  try{current=new Recognition()}catch{state.set({voiceState:'error',voiceError:'The microphone could not start. Try typing your command.'});state.setStatus('error','The microphone could not start. Try typing your command.');return}
  recognition=current
  const segments=new Map()
  let failed=false,canceled=false,completed=false
  current.lang='en-US'
  current.interimResults=true
  current.continuous=false
  current.maxAlternatives=1
  state.set({voiceState:'starting',voiceError:''})
  current.onstart=()=>{
    if(ticket!==session)return
    state.set({listening:true,voiceState:'listening'})
    state.setStatus('listening','Listening')
    state.setSubtitle('',true)
  }
  current.onresult=(event)=>{
    if(ticket!==session)return
    for(let index=event.resultIndex;index<event.results.length;index++){
      const result=event.results[index]
      segments.set(index,{text:result[0].transcript.trim(),final:result.isFinal})
    }
    const ordered=[...segments].sort(([a],[b])=>a-b).map(([,value])=>value)
    state.setSubtitle(ordered.map((value)=>value.text).join(' '),ordered.some((value)=>!value.final))
  }
  current.onerror=(event)=>{
    if(ticket!==session)return
    if(event.error==='aborted'){canceled=true;return}
    failed=true
    const message=ERRORS[event.error]||'Voice input stopped. Tap the microphone to try again.'
    state.set({voiceState:'error',voiceError:message})
    state.setStatus('error',message)
  }
  current.onend=()=>{
    if(ticket!==session||completed)return
    completed=true
    recognition=null
    state.set({listening:false,voiceState:failed?'error':'idle'})
    const text=[...segments].sort(([a],[b])=>a-b).filter(([,value])=>value.final).map(([,value])=>value.text).join(' ').trim()
    if(!failed&&!canceled&&text){
      runCommand(text)
    }else if(!failed&&useKinex.getState().status.kind==='listening'){state.setStatus('idle');state.setSubtitle('',false)}
  }
  try{current.start()}
  catch{
    recognition=null
    state.set({listening:false,voiceState:'error',voiceError:'The microphone could not start. Try again.'})
    state.setStatus('error','The microphone could not start. Try again.')
  }
}

export function stopListening() { recognition?.stop() }
export function cancelListening() {
  session++
  recognition?.abort()
  recognition=null
  const state=useKinex.getState()
  state.set({listening:false,voiceState:'idle'})
  if(state.status.kind==='listening'){state.setStatus('idle');state.setSubtitle('',false)}
}
export function toggleListening() { if(recognition)stopListening();else startListening() }
if(import.meta.hot)import.meta.hot.dispose(()=>cancelListening())
