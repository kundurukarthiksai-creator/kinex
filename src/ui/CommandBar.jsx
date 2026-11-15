import { useState, useRef } from 'react'
import { useKinex } from '../store.js'
import { runCommand, cancelOperation } from '../ai/commands.js'
import { toggleListening, hasSpeech } from '../voice/speech.js'
import { hasLLM } from '../ai/llm.js'
import { Icon } from './Icon.jsx'
import { CaptureDialog } from './CaptureDialog.jsx'

export function CommandBar() {
  const [text, setText] = useState('')
  const [capture, setCapture] = useState(false)
  const input = useRef()
  const storageError=useKinex(s=>s.saveState==='error')
  const voiceState = useKinex(s=>s.voiceState)
  const voiceError = useKinex(s=>s.voiceError)
  const aiState = useKinex(s=>s.aiState)
  const operation = useKinex(s=>s.operation)
  const lastOperation = useKinex(s=>s.lastOperation)
  const listening = useKinex((s) => s.listening)
  const thinking = useKinex((s) => s.status.kind === 'thinking')
  const camera = useKinex((s) => s.camera)
  const scanning = useKinex((s) => s.scanning)
  const inspecting = useKinex((s) => Boolean(s.inspectId))
  const send = (value) => {
    if (!value.trim() || thinking) return
    runCommand(value.trim())
    setText('')
  }
  const stateLabel = voiceState==='starting'?'Starting microphone…':listening?'Listening…':thinking?'Building your model…':storageError?'Session only · Export to keep your work':!hasLLM||aiState==='offline'?'Local mode':lastOperation?`${lastOperation.kind==='ai'?'AI':lastOperation.kind==='library'?'Model library':lastOperation.kind==='fallback'?'Offline builder':'Local edit'} · ${(lastOperation.ms/1000).toFixed(1)}s`:'Type a description or use your voice'
  return <div className={`command-dock ${listening?'is-listening':''} ${thinking?'is-building':''}`}>
    <form className="command-form" onSubmit={e=>{e.preventDefault();send(text)}}>
      <Icon name="spark" size={19} className="prompt-spark"/>
      <label className="sr-only" htmlFor="kinex-input">Describe what to create or change</label>
      <input ref={input} id="kinex-input" data-hand value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Escape'&&input.current.blur()} placeholder={listening?'Listening to your command…':thinking?'Building…':inspecting?'Ask for a change, e.g. “make the hull blue”':'Describe a model, e.g. “a detailed cruise ship”'} autoComplete="off" maxLength={2000} disabled={thinking}/>
      <button type="button" data-hand className="photo-button" aria-label="Recreate from photo" onClick={()=>setCapture(true)} disabled={camera!=='on'||scanning||thinking} title={camera==='on'?'Preview a photo and build a 3D approximation':'Enable hand controls to use the camera'}><Icon name="camera" size={18}/></button>
      <button type="button" data-hand className={`mic-button ${listening?'active':''}`} onClick={toggleListening} disabled={thinking||!hasSpeech} aria-pressed={listening} aria-label={listening?'Stop listening':'Use voice'} title={hasSpeech?'Speak a command (M)':'Voice is available in Chrome and Edge'}><Icon name="mic" size={19}/></button>
      {thinking&&operation?<button type="button" data-hand className="cancel-build" onClick={cancelOperation} aria-label="Cancel creation"><Icon name="close" size={16}/></button>:<button type="submit" data-hand className="send-button" disabled={!text.trim()||thinking} aria-label="Create from prompt" title="Create or change"><Icon name="arrow" size={20}/></button>}
    </form>
    <div className="command-state"><span className={listening||thinking?'status-dot pulsing':'status-dot'}/><span>{stateLabel}</span><kbd>/</kbd></div>
    {voiceError&&<p className="voice-error" role="status">{voiceError}</p>}
    {capture&&<CaptureDialog onClose={()=>setCapture(false)}/>}
  </div>
}
