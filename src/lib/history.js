import { useKinex } from '../store.js'
import { exitInspect } from './viewer.js'

export function undoWorld() {
  const state = useKinex.getState()
  if (state.transaction || state.status.kind === 'thinking' || !state.past.length) return false
  exitInspect()
  return useKinex.getState().undo()
}

export function redoWorld() {
  const state = useKinex.getState()
  if (state.transaction || state.status.kind === 'thinking' || !state.future.length) return false
  exitInspect()
  return useKinex.getState().redo()
}
