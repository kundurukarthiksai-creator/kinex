import { useKinex } from '../store.js'
import { exitInspect } from '../lib/viewer.js'

let active = null
export function beginOperation(label) {
  const state = useKinex.getState()
  if (active || state.status.kind === 'thinking') return null
  if (state.transaction) { state.setStatus('error','Release the object before starting a new creation.'); return null }
  const token = state.beginChange(label)
  const operation = { label, token, controller:new AbortController(), started:performance.now() }
  active = operation
  state.set({ operation:{label}, narration:'', limitNotice:false })
  state.setStatus('thinking',label)
  return operation
}
export function endOperation(operation, kind) {
  if (active !== operation) return
  const state = useKinex.getState()
  if(operation.controller.signal.aborted){
    exitInspect()
    state.cancelChange(operation.token)
    state.set({narration:'Creation canceled. Your previous world is restored.'})
    state.setStatus('done')
  } else state.commitChange(operation.token)
  state.set({operation:null,lastOperation:{kind:operation.controller.signal.aborted?'canceled':kind,ms:Math.round(performance.now()-operation.started)}})
  if(useKinex.getState().status.kind==='thinking')state.setStatus('idle')
  active = null
}
export function cancelOperation() {
  if(!active)return false
  active.controller.abort()
  useKinex.getState().setStatus('thinking','Canceling creation')
  return true
}
