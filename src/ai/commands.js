import { useKinex, describeScene } from '../store.js'
import { planFromText, planFromImage, planDetail, hasLLM } from './llm.js'
import { offlinePlan } from './fallback.js'
import { applyActions, streamSpawns, streamDetail, resolveTarget, MAX_DETAILED_PARTS } from './apply.js'
import { enterInspect, exitInspect, snapView, rotateModel, resetModelRotation } from '../lib/viewer.js'
import { captureFrame } from '../lib/captureFrame.js'
import { exportWorld } from '../lib/exportGltf.js'

let busy = 0

function finish(plan, note, live) {
  const st = useKinex.getState()
  applyActions(plan, live)
  st.set({ narration: note ? `${note} ${plan.narration || ''}`.trim() : plan.narration || '' })
  st.setStatus('done', '')
}

export async function runCommand(raw) {
  const text = String(raw || '').trim()
  if (!text) return
  const st = useKinex.getState()
  st.setSubtitle(text, false)

  // Local intents that never need the model.
  if (/^(export|download|save)( (it|this|the world|world|scene|everything|the model|model))?\.?$/i.test(text)) return exportNow()
  if (/\b(summon|scan|copy|replicate) (this|that|it)\b/i.test(text)) return summon()
  if (inspectIntent(text)) return

  busy++
  st.setStatus('thinking', 'Building')
  st.set({ narration: '' })
  try {
    if (!hasLLM) throw new Error('no key')
    const live = new Map()
    const plan = await planFromText(text, describeScene(), (p) => streamSpawns(p, live))
    finish(plan, '', live)
  } catch (err) {
    console.warn('[kinex] model failed, using offline builder:', err)
    const why = hasLLM ? "The AI didn't answer, so the offline builder took over." : 'No OPENAI_API_KEY in .env, so the offline builder took over.'
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
  if (!hasLLM) {
    st.setStatus('error', 'Summoning needs OPENAI_API_KEY in .env.')
    return
  }
  st.setSubtitle('Summon this', false)
  st.set({ scanning: true, narration: '' })
  st.setStatus('thinking', 'Scanning')
  try {
    const live = new Map()
    const plan = await planFromImage(frame, describeScene(), (p) => streamSpawns(p, live))
    finish(plan, '', live)
  } catch (err) {
    console.warn('[kinex] summon failed:', err)
    st.setStatus('error', "Couldn't recognize that. Hold the object closer, in good light, and try again.")
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
    st.set({ narration: useKinex.getState().inspectId ? 'Your model is downloading as a .glb file.' : 'Your world is downloading as a .glb file.' })
    st.setStatus('done')
  } catch (err) {
    console.error(err)
    st.setStatus('error', 'Export failed. Try again in a second.')
  }
}

// Inspect-mode phrases handled locally, so they're instant. Returns true if handled.
export function inspectIntent(raw) {
  const t = raw.toLowerCase().replace(/[.!?]+$/, '').trim()
  const st = useKinex.getState()
  const inspecting = Boolean(st.inspectId)

  const open = t.match(/^(inspect|examine|look at|zoom in on|open)\b\s*(?:the\s+)?(.*)$/)
  if (open) {
    const ref = open[2].replace(/^(it|this|that)$/, '')
    const target = resolveTarget(ref || null, st.objects)
    if (!target) {
      st.setStatus('error', 'Build something first, then inspect it.')
      return true
    }
    enterInspect(target.id)
    return true
  }
  if (!inspecting) return false

  if (/^(done|exit|close|back|leave|stop inspecting|go back)\b/.test(t)) {
    exitInspect()
    return true
  }
  const view = t.match(/\b(top|front|back|bottom|left|right|side|iso|isometric)\b.*\bview\b|^(?:show (?:the )?)?(top|front|back|bottom|left|right|side)$/)
  if (view) {
    snapView((view[1] || view[2]).replace('isometric', 'iso'))
    return true
  }
  const rot = t.match(/\b(?:rotate|turn|spin|flip)\b(?:\s+(?:it|this|the model))?(?:\s+by)?\s*(-?\d+)?\s*(?:deg(?:rees)?|°)?\s*(?:on|around|about|along)?\s*(?:the\s+)?([xyz])(?:[\s-]*axis)?\b/)
  if (rot) {
    rotateModel(rot[2], Number(rot[1] || 90))
    return true
  }
  if (/^reset$|\b(reset|straighten)\b.*\b(rotation|orientation|it|model)\b/.test(t)) {
    resetModelRotation()
    return true
  }
  if (/\b(explode|exploded|take it apart|pull apart|break apart)\b/.test(t)) {
    st.setInspect({ explode: 1 })
    return true
  }
  if (/\b(assemble|put it back|collapse|unexplode)\b/.test(t)) {
    st.setInspect({ explode: 0 })
    return true
  }
  const wire = t.match(/\bwire ?frame\b(?:\s+(on|off))?/)
  if (wire) {
    st.setInspect({ wireframe: wire[1] ? wire[1] === 'on' : !st.inspect.wireframe })
    return true
  }
  if (/\b(add|more)\b.*\bdetail|\bdetailed\b|\brefine\b/.test(t)) {
    addDetail()
    return true
  }
  return false
}

// Streams extra detail parts onto the inspected (or last touched) object.
export async function addDetail(id) {
  const st = useKinex.getState()
  const obj = st.objects.find((o) => o.id === (id || st.inspectId || st.lastId))
  if (!obj || st.inspect.refining) return
  if (!hasLLM) {
    st.setStatus('error', 'Adding detail needs OPENAI_API_KEY in .env.')
    return
  }
  if (obj.parts.length >= MAX_DETAILED_PARTS) {
    st.setStatus('error', `The ${obj.name} already has as much detail as Kinex can show (${MAX_DETAILED_PARTS} parts).`)
    return
  }
  st.setSubtitle(`More detail on the ${obj.name}`, false)
  st.set({ narration: '' })
  st.setStatus('thinking', 'Adding detail')
  st.setInspect({ refining: true })
  const live = { n: 0 }
  try {
    const plan = await planDetail(obj, (p) => streamDetail(p, obj.id, live))
    streamDetail(plan, obj.id, live)
    const total = useKinex.getState().objects.find((o) => o.id === obj.id)?.parts.length ?? 0
    st.set({ narration: `${plan.narration || 'Added detail.'} Now ${total} parts.` })
    st.setStatus('done')
  } catch (err) {
    console.warn('[kinex] add detail failed:', err)
    st.setStatus('error', live.n ? `Added ${live.n} details before the AI stopped.` : "The AI didn't answer. Try Add detail again.")
  } finally {
    st.setInspect({ refining: false })
  }
}
