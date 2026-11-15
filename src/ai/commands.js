import { useKinex, describeScene, describeFocus } from '../store.js'
import { planFromText, planFromImage, planDetail, planRemodel, hasLLM } from './llm.js'
import { current, run, undo as undoModel, showAll } from '../model/current.js'
import { describeModel } from '../model/manifest.js'
import { augmentSelect } from '../model/remodel.js'
import { offlinePlan } from './fallback.js'
import { applyActions, streamSpawns, streamEdits, streamDetail, resolveTarget, buildObject, MAX_DETAILED_PARTS } from './apply.js'
import { findReferences, saveLiked, voteOn } from './library.js'
import { toActions } from './schema.js'
import { enterInspect, exitInspect, snapView, rotateModel, resetModelRotation } from '../lib/viewer.js'
import { captureFrame } from '../lib/captureFrame.js'
import { exportWorld } from '../lib/exportGltf.js'
import { makeHD } from '../hd/meshes.js'

let busy = 0

// Remember what each new object was made from: the words for HD image prompts,
// the camera frame for Summon. Objects from earlier commands already have one.
function tagNew(source) {
  for (const o of useKinex.getState().objects) if (!o.source) o.source = source
}

const nameOf = (id) => useKinex.getState().objects.find((o) => o.id === id)?.name || 'model'
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// One line per change, shown under the assistant's reply.
function notesFor(plan, focusId) {
  const st = useKinex.getState()
  const notes = []
  for (const a of toActions(plan, focusId)) {
    if (a.type === 'spawn') notes.push(`Built ${a.name || 'a model'} (${Array.isArray(a.parts) ? a.parts.length : 0} parts)`)
    if (a.type === 'modify') {
      const target = resolveTarget(a.targetId, st.objects)
      const bits = []
      if (a.addParts?.length) bits.push(`added ${a.addParts.length}`)
      if (a.editParts?.length) bits.push(`changed ${a.editParts.length}`)
      if (a.removeParts?.length) bits.push(`removed ${a.removeParts.length}`)
      if (a.color) bits.push('recolored')
      if (a.scale && Math.abs(Number(a.scale) - 1) > 0.01) bits.push(`resized ×${Number(a.scale).toFixed(1)}`)
      if (a.parts?.length) bits.push(`rebuilt with ${a.parts.length} parts`)
      if (a.behavior) bits.push(a.behavior.kind === 'none' ? 'stopped moving' : `now ${a.behavior.kind}s`)
      if (bits.length && target) notes.push(`${cap(target.name)}: ${bits.join(', ')}`)
    }
    if (a.type === 'delete') notes.push('Removed a model')
    if (a.type === 'clear') notes.push('Cleared the scene')
    if (a.type === 'environment' && a.preset) notes.push(`Light: ${a.preset}`)
  }
  return notes
}

// "a castle with a red flag" or "build me a robot" asks for a NEW model; "make it
// taller" / "add a door" / "paint the roof blue" edit the one in focus.
export function isNewThing(text, focusName = '') {
  const t = text.toLowerCase().trim()
  const name = focusName.toLowerCase()
  if (/\b(it|its|it's|this|that|them|those)\b/.test(t)) return false
  if (name && t.includes(name)) return false
  return /^(please\s+)?((build|make|create|generate|design|model|draw|spawn|show|give)( me)?|i want|i'd like|let's (build|make))?\s*(a|an|one|two|three|some)\s+\w/.test(t)
}

// Earlier turns for the AI, so follow-ups like "make it bigger" have context.
function history() {
  return useKinex
    .getState()
    .chat.filter((m) => m.status === 'done' && m.text)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.text }))
}

// "A castle with a red flag" should be one castle. When one request streams in a main
// model plus small add-ons (4 parts or fewer), fold the add-ons into the main model,
// placed where the AI put them relative to it.
function mergeAccessories(plan, live) {
  const st = useKinex.getState()
  const spawns = Array.isArray(plan?.spawn) ? plan.spawn : []
  const items = [...live.entries()]
    .map(([i, e]) => ({ at: Array.isArray(spawns[i]?.at) ? spawns[i].at.map(Number) : [0, 0, 0], obj: st.objects.find((o) => o.id === e.id) }))
    .filter((x) => x.obj)
  if (items.length < 2) return
  const main = items.reduce((a, b) => (b.obj.parts.length > a.obj.parts.length ? b : a))
  const extras = items.filter((x) => x !== main && x.obj.parts.length <= 4)
  if (!extras.length || main.obj.parts.length < 10) return
  let parts = main.obj.parts
  for (const x of extras) {
    const off = [0, 1, 2].map((i) => (x.at[i] || 0) - (main.at[i] || 0))
    parts = [...parts, ...x.obj.parts.map((p) => ({ ...p, position: p.position.map((v, i) => v + off[i]) }))]
    st.removeObject(x.obj.id, false)
  }
  st.updateObject(main.obj.id, { parts })
  st.set({ lastId: main.obj.id })
}

function finish(plan, note, live, source, replyId, edits, focusId, startedAt) {
  const st = useKinex.getState()
  const notes = notesFor(plan, focusId) // before applying, while indices still match
  if (startedAt && notes.length) notes.push(`Done in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`)
  applyActions(plan, live, edits, focusId)
  if (live) mergeAccessories(plan, live)
  if (source) {
    tagNew(source)
    setTimeout(() => tagNew(source), 4000) // multi-object spawns land staggered
  }
  const text = note ? `${note} ${plan.narration || ''}`.trim() : plan.narration || 'Done.'
  st.set({ narration: text })
  st.setStatus('done', '')
  if (replyId) st.editMessage(replyId, { text, status: 'done', notes })
}

// Live progress in the assistant's reply while parts stream in.
function progress(replyId) {
  let last = ''
  return (live, edits) => {
    const st = useKinex.getState()
    const ids = [...live.values(), ...edits.values()].map((e) => e.id)
    if (!ids.length) return
    const total = ids.reduce((n, id) => n + (st.objects.find((o) => o.id === id)?.parts.length || 0), 0)
    const text = `Building the ${nameOf(ids[0])}… ${total} parts`
    if (text !== last) {
      last = text
      st.editMessage(replyId, { text })
    }
  }
}

export async function runCommand(raw) {
  const text = String(raw || '').trim()
  if (!text) return
  const st = useKinex.getState()
  const earlier = history()
  st.setSubtitle(text, false)
  st.say('user', text)
  const reply = (msg, status = 'done') => st.say('assistant', msg, { status })
  if (current.model) return remodelCommand(text, earlier)

  // Local intents that never need the model.
  if (/^(export|download|save)( (it|this|the world|world|scene|everything|the model|model))?\.?$/i.test(text)) return exportNow()
  if (/\b(summon|scan|copy|replicate) (this|that|it)\b/i.test(text)) return summon()
  const local = inspectIntent(text)
  if (local) return local === 'silent' ? undefined : reply(typeof local === 'string' ? local : 'Done.')
  if (/\bmake (it|this|that|the \w+) (hd|real|realistic|high.?def(inition)?)\b|\b(hd|realistic) (version|model)\b/i.test(text)) {
    const target = resolveTarget(text.match(/the (\w+) (hd|real)/i)?.[1] || null, st.objects)
    if (!target) return reply('Build something first, then make it HD.', 'error')
    makeHD(target.id)
    return reply(`Making the ${target.name} in HD. It takes a few minutes, and you can keep building meanwhile.`)
  }

  busy++
  st.setStatus('thinking', 'Building')
  st.set({ narration: '' })
  const replyId = st.say('assistant', 'Thinking…', { status: 'working' })
  const startedAt = performance.now()
  const live = new Map()
  const edits = new Map()
  const show = progress(replyId)
  let refs = []
  let draftId = null
  const dropDraft = () => {
    if (draftId) useKinex.getState().removeObject(draftId, false)
    draftId = null
  }
  try {
    // Naming a model ("make the castle taller") makes it the one being worked on.
    const named = [...st.objects].sort((a, b) => b.name.length - a.name.length).find((o) => text.toLowerCase().includes(o.name.toLowerCase()))
    if (named && !st.inspectId) st.set({ lastId: named.id })
    const current = describeFocus()
    const focus = current && !isNewThing(text, current.name) ? current : null

    // New model: start from proven designs in the library. A close match shows up
    // instantly as a draft, and the AI's version replaces it as it streams in.
    if (!focus) {
      st.editMessage(replyId, { text: 'Looking for similar models…' })
      refs = await findReferences(text, 3)
      const best = refs[0]
      if (best && best.similarity >= DRAFT_MATCH) {
        const obj = buildObject({ name: best.name || 'model', position: [0, 0, 0], parts: best.lines }, st.objects)
        obj.draft = true
        draftId = obj.id
        st.addObject(obj)
      }
      st.editMessage(replyId, { text: refs.length ? `Building from ${refs.length} similar models…` : 'Building…' })
    }
    if (!hasLLM) throw new Error('no model')
    const plan = await planFromText(
      text,
      describeScene(),
      (p) => {
        const a = streamSpawns(p, live)
        const b = streamEdits(p, edits, focus?.id)
        if (a && draftId) dropDraft()
        show(live, edits)
        return a || b
      },
      // A new model starts fresh: earlier turns only help when editing the one in focus.
      { focus, history: focus ? earlier : [], refs },
    )
    if (live.size) dropDraft()
    finish(plan, '', live, { text }, replyId, edits, focus?.id, startedAt)
    tagBuild(replyId, text, live, refs)
  } catch (err) {
    console.warn('[kinex] model failed:', err)
    if (draftId && useKinex.getState().objects.some((o) => o.id === draftId)) {
      // The AI didn't answer, but the library had a close match: keep it.
      st.editMessage(replyId, { text: `The AI didn't answer, so here is the closest model from the library: "${refs[0].text.slice(0, 90)}".`, status: 'done', notes: ['From the library'] })
      st.setStatus('done')
      tagBuild(replyId, text, new Map([[0, { id: draftId }]]), refs)
    } else {
      const why = hasLLM ? "The AI didn't answer, so the offline builder took over." : 'No AI model is available (start Ollama or add OPENAI_API_KEY), so the offline builder took over.'
      finish(offlinePlan(text), why, undefined, undefined, replyId)
    }
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
    const msg = 'Turn on Hands in the top bar to use the camera, then hold the object up and summon it.'
    st.setStatus('error', msg)
    st.say('assistant', msg, { status: 'error' })
    return
  }
  if (!hasLLM) {
    st.setStatus('error', 'Summoning needs OPENAI_API_KEY in .env.')
    return
  }
  st.setSubtitle('Summon this', false)
  st.set({ scanning: true, narration: '' })
  st.setStatus('thinking', 'Scanning')
  const replyId = st.say('assistant', 'Looking at what you are holding…', { status: 'working' })
  try {
    const live = new Map()
    const plan = await planFromImage(frame, describeScene(), (p) => streamSpawns(p, live))
    finish(plan, '', live, { text: 'summon', photo: `data:image/jpeg;base64,${frame}` }, replyId)
  } catch (err) {
    console.warn('[kinex] summon failed:', err)
    const msg = "Couldn't recognize that. Hold the object closer, in good light, and try again."
    st.setStatus('error', msg)
    st.editMessage(replyId, { text: msg, status: 'error' })
  } finally {
    st.set({ scanning: false })
  }
}

export async function exportNow() {
  const st = useKinex.getState()
  if (!st.objects.length) {
    st.setStatus('error', 'Build something first, then export it.')
    st.say('assistant', 'Build something first, then export it.', { status: 'error' })
    return
  }
  try {
    await exportWorld()
    const msg = useKinex.getState().inspectId ? 'Your model is downloading as a .glb file.' : 'Your world is downloading as a .glb file.'
    st.set({ narration: msg })
    st.setStatus('done')
    st.say('assistant', msg)
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
    return `Opened the ${target.name}. Drag to turn it, scroll to zoom, click a part to zoom in. Tell me what to change.`
  }
  // Only the bare phrase: "add a door with brass detail" is a specific edit for the AI.
  if (/^(add (more )?details?|more details?|(make it )?(more )?detailed|refine( it)?)$/.test(t) && st.objects.length) {
    addDetail()
    return 'silent' // addDetail writes its own reply
  }
  if (!inspecting) return false

  if (/^(done|exit|close|back|leave|stop inspecting|go back)\b/.test(t)) {
    exitInspect()
    return 'Back to the world.'
  }
  const view = t.match(/\b(top|front|back|bottom|left|right|side|iso|isometric)\b.*\bview\b|^(?:show (?:the )?)?(top|front|back|bottom|left|right|side)$/)
  if (view) {
    const name = (view[1] || view[2]).replace('isometric', 'iso')
    snapView(name)
    return name === 'iso' ? 'Three-quarter view.' : `${name[0].toUpperCase()}${name.slice(1)} view.`
  }
  const rot = t.match(/\b(?:rotate|turn|spin|flip)\b(?:\s+(?:it|this|the model))?(?:\s+by)?\s*(-?\d+)?\s*(?:deg(?:rees)?|°)?\s*(?:on|around|about|along)?\s*(?:the\s+)?([xyz])(?:[\s-]*axis)?\b/)
  if (rot) {
    const deg = Number(rot[1] || 90)
    rotateModel(rot[2], deg)
    return `Turned it ${deg}° on ${rot[2].toUpperCase()}.`
  }
  if (/^reset$|\b(reset|straighten)\b.*\b(rotation|orientation|it|model)\b/.test(t)) {
    resetModelRotation()
    return 'Rotation reset.'
  }
  if (/\b(explode|exploded|take it apart|pull apart|break apart)\b/.test(t)) {
    st.setInspect({ explode: 1 })
    return 'Exploded, so you can see every part.'
  }
  if (/\b(assemble|put it back|collapse|unexplode)\b/.test(t)) {
    st.setInspect({ explode: 0 })
    return 'Put back together.'
  }
  const wire = t.match(/\bwire ?frame\b(?:\s+(on|off))?/)
  if (wire) {
    const on = wire[1] ? wire[1] === 'on' : !st.inspect.wireframe
    st.setInspect({ wireframe: on })
    return on ? 'Wireframe on.' : 'Wireframe off.'
  }
  return false
}

// Streams extra detail parts onto the inspected (or last touched) object.
export async function addDetail(id) {
  const st = useKinex.getState()
  const obj = st.objects.find((o) => o.id === (id || st.inspectId || st.lastId))
  if (!obj || st.inspect.refining) return
  const fail = (msg) => {
    st.setStatus('error', msg)
    st.say('assistant', msg, { status: 'error' })
  }
  if (!hasLLM) return fail('Adding detail needs OPENAI_API_KEY in .env.')
  if (obj.parts.length >= MAX_DETAILED_PARTS) return fail(`The ${obj.name} already has as much detail as Kinex can show (${MAX_DETAILED_PARTS} parts).`)
  const replyId = st.say('assistant', `Adding detail to the ${obj.name}…`, { status: 'working' })
  st.setSubtitle(`More detail on the ${obj.name}`, false)
  st.set({ narration: '' })
  st.setStatus('thinking', 'Adding detail')
  st.setInspect({ refining: true })
  const live = { n: 0 }
  try {
    const count = () => useKinex.getState().objects.find((o) => o.id === obj.id)?.parts.length ?? 0
    const plan = await planDetail(obj, (p) => {
      const r = streamDetail(p, obj.id, live)
      st.editMessage(replyId, { text: `Adding detail to the ${obj.name}… ${count()} parts` })
      return r
    })
    streamDetail(plan, obj.id, live)
    const text = plan.narration || 'Added detail.'
    st.set({ narration: `${text} Now ${count()} parts.` })
    st.setStatus('done')
    st.editMessage(replyId, { text, status: 'done', notes: [`${obj.name[0].toUpperCase()}${obj.name.slice(1)}: added ${live.n} details, now ${count()} parts`] })
  } catch (err) {
    console.warn('[kinex] add detail failed:', err)
    const msg = live.n ? `Added ${live.n} details before the AI stopped.` : "The AI didn't answer. Try Add detail again."
    st.setStatus('error', msg)
    st.editMessage(replyId, { text: msg, status: 'error' })
  } finally {
    st.setInspect({ refining: false })
  }
}

// A real model is open: the AI picks existing elements and Kinex edits them exactly.
async function remodelCommand(text, earlier) {
  const st = useKinex.getState()
  const t = text.toLowerCase().replace(/[.!?]+$/, '').trim()
  if (/^(undo|undo that|undo it|go back|revert( that)?)$/.test(t)) {
    const label = undoModel()
    st.say('assistant', label ? `Undid it: ${label}.` : 'Nothing to undo yet.')
    return
  }
  if (/^(show (me )?(everything|all|it all|the whole (thing|house|model|building))|reset( the)? view|show all)$/.test(t)) {
    showAll()
    st.say('assistant', 'Everything is back in view.')
    return
  }
  if (!hasLLM) {
    st.say('assistant', 'Editing by chat needs OPENAI_API_KEY in .env. You can still click items and use the panel on the left.', { status: 'error' })
    return
  }
  const replyId = st.say('assistant', 'Looking through the model…', { status: 'working' })
  st.setStatus('thinking', 'Thinking')
  const t0 = performance.now()
  try {
    const plan = await planRemodel(text, describeModel(current.model), earlier)
    const ops = (Array.isArray(plan.ops) ? plan.ops : []).map((op) => ({ ...op, select: augmentSelect(text, op.select) }))
    console.info('[kinex] remodel', JSON.stringify({ about: plan.about, ops }))
    const res = run(ops)
    const answer = res.answers.join(' ')
    const notes = [...res.notes, `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s`]
    st.editMessage(replyId, { text: [answer, plan.narration].filter(Boolean).join(' ') || 'Done.', status: 'done', notes })
    st.setStatus('done')
  } catch (err) {
    console.warn('[kinex] remodel failed', err)
    st.editMessage(replyId, { text: "The AI didn't answer. Try again in a moment.", status: 'error' })
    st.setStatus('error', "The AI didn't answer.")
  }
}

// How close a library model must be to show it instantly as a draft (cosine similarity).
const DRAFT_MATCH = 0.65 // embeddinggemma cosine; "desk lamp" vs "table lamp" ~0.68

// Marks a build reply so the chat can offer 👍 (save to the library) and 👎.
function tagBuild(replyId, text, live, refs) {
  const ids = [...live.values()].map((e) => e.id)
  if (!ids.length) return
  useKinex.getState().editMessage(replyId, { build: { text, objectId: ids[0], refIds: refs.map((r) => r.id), refs: refs.map((r) => r.text.slice(0, 80)) } })
}

// 👍 saves the model to the shared library so similar requests start from it; 👎 lowers
// the references it was built from, so weaker designs stop surfacing.
export async function rateBuild(messageId, liked) {
  const st = useKinex.getState()
  const msg = st.chat.find((m) => m.id === messageId)
  if (!msg?.build) return
  const obj = st.objects.find((o) => o.id === msg.build.objectId)
  st.editMessage(messageId, { rated: liked ? 'up' : 'down' })
  try {
    if (liked && obj) await saveLiked({ text: msg.build.text, name: obj.name, parts: obj.parts })
    await voteOn(msg.build.refIds, liked ? 1 : -1)
  } catch (err) {
    console.warn('[kinex] could not save the rating', err)
    st.editMessage(messageId, { rated: null })
  }
}
