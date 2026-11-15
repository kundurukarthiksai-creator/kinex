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
  return <div className={`command-dock ${listening ? 'is-listening' : ''} ${thinking ? 'is-building' : ''}`}>
    <div className="command-dock-heading"><span><span className={`status-dot ${listening || thinking ? 'pulsing' : ''}`}/>{listening ? 'LISTENING TO YOUR IDEA' : thinking ? 'BRINGING YOUR IDEA TO LIFE' : 'YOUR WORDS. A NEW WORLD.'}</span><span className="dock-provider">{!hasLLM||aiState==='offline'?'Local mode':lastOperation?`${lastOperation.kind==='ai'?'AI':lastOperation.kind==='library'?'Model library':lastOperation.kind==='fallback'?'Offline':'Local'} · ${(lastOperation.ms/1000).toFixed(1)}s`:'AI configured'}<Icon name="spark" size={12}/></span></div>
    <form className="command-form" onSubmit={(e) => { e.preventDefault(); send(text) }}>
      <span className="prompt-spark"><Icon name="spark" size={22}/></span>
      <label className="sr-only" htmlFor="kinex-input">Describe what to create or change</label>
      <input ref={input} id="kinex-input" data-hand value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && input.current.blur()} placeholder={voiceState==='starting'?'Starting microphone…':listening ? 'Go on. We’re listening…' : thinking ? 'A little imagination in progress…' : inspecting ? 'Make it blue, add details, or change its shape…' : 'A floating island with a tiny house…'} autoComplete="off" maxLength={2000} disabled={thinking}/>
      <kbd className="prompt-shortcut">/</kbd>
      <button type="button" data-hand className={`mic-button ${listening ? 'active' : ''}`} onClick={toggleListening} disabled={thinking || !hasSpeech} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Use voice'} title={hasSpeech ? 'Speak your idea (M)' : 'Voice is available in Chrome and Edge'}><Icon name="mic" size={19}/></button>
      <button type="submit" data-hand className="send-button" disabled={!text.trim() || thinking} aria-label="Create from prompt" title="Create from your prompt">{thinking ? <span className="loading-spinner"/> : <Icon name="arrow" size={20}/>}</button>
      {thinking && operation && <button type="button" data-hand className="cancel-build" onClick={cancelOperation} aria-label="Cancel creation"><Icon name="close" size={14}/>Cancel</button>}
    </form>
    <div className="command-dock-footer"><span>Type an idea, or use your voice.</span><button data-hand onClick={() => setCapture(true)} disabled={camera !== 'on' || scanning || thinking} title={camera === 'on' ? 'Preview a photo and reconstruct the object in your hand' : 'Enable your camera to recreate a real object'}><Icon name="camera" size={13}/>{scanning ? 'Scanning your object…' : 'Summon a real object'}<Icon name="arrow" size={11}/></button></div>
    {voiceError && <p className="voice-error" role="status">{voiceError}</p>}
    {capture && <CaptureDialog onClose={() => setCapture(false)}/>}
  </div>
}
