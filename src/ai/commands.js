import { useKinex, describeScene } from '../store.js'
import { planFromText, planFromImage, hasGemini } from './gemini.js'
import { offlinePlan } from './fallback.js'
import { applyActions } from './apply.js'
import { captureFrame } from '../lib/captureFrame.js'
import { exportWorld } from '../lib/exportGltf.js'

let busy = 0

function finish(plan, note) {
  const st = useKinex.getState()
  applyActions(plan)
  st.set({ narration: note ? `${note} ${plan.narration || ''}`.trim() : plan.narration || '' })
  st.setStatus('done', '')
}

export async function runCommand(raw) {
  const text = String(raw || '').trim()
  if (!text) return
  const st = useKinex.getState()
  st.setSubtitle(text, false)

  // Local intents that never need the model.
  if (/^(export|download|save)( (it|this|the world|world|scene|everything))?\.?$/i.test(text)) return exportNow()
  if (/\b(summon|scan|copy|replicate) (this|that|it)\b/i.test(text)) return summon()

  busy++
  st.setStatus('thinking', 'Building')
  st.set({ narration: '' })
  try {
    if (!hasGemini) throw new Error('no key')
    finish(await planFromText(text, describeScene()))
  } catch (err) {
    console.warn('[kinex] gemini failed, using offline builder:', err)
    const why = hasGemini ? "Gemini didn't answer, so the offline builder took over." : 'No Gemini key in .env, so the offline builder took over.'
    finish(offlinePlan(text), why)
  } finally {
    busy--
    if (!busy && useKinex.getState().status.kind === 'thinking') st.setStatus('idle')
  }
}

export async function summon() {
  const st = useKinex.getState()
  if (useKinex.getState().scanning) return
  const frame = captureFrame()
  if (!frame) {
    st.setStatus('error', 'Turn on the camera to summon a real object.')
    return
  }
  if (!hasGemini) {
    st.setStatus('error', 'Summoning needs a Gemini key in .env.')
    return
  }
  st.setSubtitle('Summon this', false)
  st.set({ scanning: true, narration: '' })
  st.setStatus('thinking', 'Scanning')
  try {
    finish(await planFromImage(frame, describeScene()))
  } catch (err) {
    console.warn('[kinex] summon failed:', err)
    st.setStatus('error', "Couldn't read the camera frame. Hold the object closer and try again.")
  } finally {
    st.set({ scanning: false })
  }
}

export async function exportNow() {
  const st = useKinex.getState()
  if (!st.objects.length) {
    st.setStatus('error', 'Build something first, then export it.')
    return
  }
  try {
    await exportWorld()
    st.set({ narration: 'Your world is downloading as kinex-world.glb.' })
    st.setStatus('done')
  } catch (err) {
    console.error(err)
    st.setStatus('error', 'Export failed. Try again in a second.')
  }
}
