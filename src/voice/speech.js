import { useKinex } from '../store.js'
import { runCommand } from '../ai/commands.js'

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const hasSpeech = Boolean(Recognition)

let rec = null
let finalText = ''

export function startListening() {
  const st = useKinex.getState()
  if (st.status.kind === 'thinking') return
  if (!Recognition) {
    st.setStatus('error', 'Voice needs Chrome or Edge. Type your request instead.')
    return
  }
  if (rec) return
  finalText = ''
  rec = new Recognition()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  rec.onstart = () => {
    st.set({ listening: true })
    st.setStatus('listening', 'Listening')
    st.setSubtitle('', true)
  }
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript
      else interim += r[0].transcript
    }
    useKinex.getState().setSubtitle((finalText + interim).trim(), !!interim)
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') st.setStatus('error', 'Allow microphone access to talk to Kinex.')
    else if (e.error !== 'no-speech' && e.error !== 'aborted') st.setStatus('error', `Voice stopped: ${e.error}.`)
  }
  rec.onend = () => {
    rec = null
    useKinex.getState().set({ listening: false })
    const text = finalText.trim()
    if (text) runCommand(text)
    else if (useKinex.getState().status.kind === 'listening') useKinex.getState().setStatus('idle')
  }
  try {
    rec.start()
  } catch {
    rec = null
  }
}

export function stopListening() {
  rec?.stop()
}

export function toggleListening() {
  if (rec) stopListening()
  else startListening()
}
