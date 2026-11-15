import { useEffect, useState } from 'react'
import { useKinex } from '../store.js'
import { Icon } from './Icon.jsx'

export function Subtitle() {
  const subtitle = useKinex((s) => s.subtitle)
  const status = useKinex((s) => s.status)
  const narration = useKinex((s) => s.narration)
  const [fresh, setFresh] = useState(true)
  useEffect(() => {
    setFresh(true)
    if (status.kind === 'thinking' || status.kind === 'listening' || status.kind === 'error') return
    const timer = setTimeout(() => setFresh(false), 8500)
    return () => clearTimeout(timer)
  }, [subtitle, status, narration])
  const note = status.kind === 'thinking' ? `${status.text || 'Building'}…` : status.kind === 'listening' ? 'Listening. Tell us what you imagine.' : status.kind === 'error' ? status.text : narration
  if (!fresh || (!note && !subtitle.text)) return <div className="scene-status-spacer"/>
  return <div className={`scene-status ${status.kind === 'error' ? 'is-error' : ''}`} role={status.kind === 'error' ? 'alert' : 'status'} aria-live={status.kind === 'error' ? 'assertive' : 'polite'}>
    <span className="scene-status-icon">{status.kind === 'thinking' ? <span className="loading-spinner"/> : <Icon name={status.kind === 'error' ? 'help' : status.kind === 'listening' ? 'mic' : 'spark'} size={16}/>}</span>
    <div>{subtitle.text && <p className="scene-transcript" data-interim={subtitle.interim}>{subtitle.text}</p>}{note && <p>{note}</p>}</div>
    <button className="icon-button" data-hand aria-label="Dismiss message" onClick={() => setFresh(false)}><Icon name="close" size={13}/></button>
  </div>
}
