import { RESPONSE_SCHEMA, EDIT_SCHEMA } from './schema.js'
import { SYSTEM_PROMPT, SUMMON_PROMPT, REFINE_PROMPT, EDIT_PROMPT, userPrompt, refinePrompt } from './prompt.js'
import { parsePartial } from './partialJson.js'

// Models are free: a local one on this PC's GPU (Ollama, "local:" prefix) goes first,
// then ASU's OpenAI-compatible server. In the browser both go through the Vite proxy
// (vite.config.js), which keeps keys off the page. Outside the browser (tests) calls go direct.
const IN_BROWSER = typeof window !== 'undefined' && typeof __LLM_READY__ !== 'undefined'
const DIRECT_KEY = IN_BROWSER ? null : globalThis.process?.env?.OPENAI_API_KEY
const BASE = IN_BROWSER ? __LLM_BASE__ : 'https://openai.rc.asu.edu/v1'
const LOCAL_BASE = IN_BROWSER ? '/ollama/v1' : 'http://localhost:11434/v1'
const ENV_MODEL = typeof __LLM_MODEL__ === 'undefined' ? '' : __LLM_MODEL__
const LOCAL_MODEL = typeof __LOCAL_MODEL__ === 'undefined' ? globalThis.process?.env?.KINEX_LOCAL_MODEL || 'kinex-builder' : __LOCAL_MODEL__
const LOCAL = LOCAL_MODEL && LOCAL_MODEL !== 'off' ? `local:${LOCAL_MODEL}` : null
// kinex-builder = qwen3.5:9b with an 8K context (ollama/Modelfile); plain qwen3.5:9b if it isn't created.
const LOCAL_BACKUP = LOCAL && LOCAL_MODEL === 'kinex-builder' ? 'local:qwen3.5:9b' : null
const READY = Boolean(LOCAL) || (IN_BROWSER ? __LLM_READY__ : Boolean(DIRECT_KEY))

// Order picked by benchmark (README): with library references, ASU gpt-oss builds in
// ~15 s and looks best; the local GPU model is the free offline backup (~40-80 s).
const ASU_READY = IN_BROWSER ? __LLM_READY__ : Boolean(DIRECT_KEY)
let MODELS = [...new Set([...(ASU_READY ? [ENV_MODEL, 'gpt-oss-120b'] : []), LOCAL, LOCAL_BACKUP, ...(ASU_READY ? ['llama4-maverick-17b'] : [])].filter(Boolean))]
export function setModels(list) {
  MODELS = list
  working = null
}

const isLocal = (m) => m.startsWith('local:')
const baseFor = (model) => (isLocal(model) ? LOCAL_BASE : BASE)
const wireName = (model) => (isLocal(model) ? model.slice(6) : model)

// How each model family is told to skip long hidden reasoning before answering.
function fastMode(model) {
  if (isLocal(model)) return { reasoning_effort: 'none' } // Ollama: thinking off (13 s -> 1.3 s)
  if (model.startsWith('gpt-oss')) return { reasoning_effort: 'low' }
  if (model.startsWith('llama') || model.startsWith('gemma')) return {}
  return { chat_template_kwargs: { enable_thinking: false, thinking: false } }
}
const IDLE_MS = 20000 // give up if the stream goes quiet this long
const TOTAL_MS = 120000

export const hasLLM = READY

// Servers differ in what they accept, so start strict and fall back on a 400.
// Each model remembers the first rung that worked.
const LADDER = [
  { format: 'json_schema', noThink: true },
  { format: 'json_schema', noThink: false },
  { format: 'json_object', noThink: false },
  { format: null, noThink: false },
]
const rungFor = new Map()
let working = null

export class LLMError extends Error {}

function body(model, messages, rung, maxTokens, schema = RESPONSE_SCHEMA) {
  return {
    model: wireName(model),
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: maxTokens,
    ...(rung.noThink ? fastMode(model) : {}),
    ...(rung.format === 'json_schema'
      ? { response_format: { type: 'json_schema', json_schema: { name: 'kinex_plan', schema } } }
      : rung.format === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
  }
}

// Pull the JSON object out of whatever the model wrote (reasoning tags, code fences, chatter).
export function extractJson(text) {
  let s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try {
    return JSON.parse(s)
  } catch {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1))
    throw new LLMError('The model did not return JSON.')
  }
}

// Streams one completion. onText receives the full text so far after every chunk.
async function streamOnce(model, messages, rung, onText, maxTokens, schema) {
  const ctrl = new AbortController()
  let idle = setTimeout(() => ctrl.abort(), IDLE_MS)
  const total = setTimeout(() => ctrl.abort(), TOTAL_MS)
  let text = ''
  try {
    const res = await fetch(`${baseFor(model)}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(DIRECT_KEY ? { Authorization: `Bearer ${DIRECT_KEY}` } : {}) },
      body: JSON.stringify(body(model, messages, rung, maxTokens, schema)),
    })
    if (!res.ok) {
      const err = new LLMError(`${res.status} ${(await res.text()).slice(0, 200)}`)
      err.status = res.status
      throw err
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      clearTimeout(idle)
      idle = setTimeout(() => ctrl.abort(), IDLE_MS)
      buf += dec.decode(value, { stream: true })
      let nl
      let grew = false
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta
          if (delta?.content) {
            text += delta.content
            grew = true
          }
        } catch {
          /* keep-alive or partial line */
        }
      }
      if (grew) onText?.(text)
    }
    return text
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new LLMError('The model took too long to answer.')
      e.partial = text
      throw e
    }
    err.partial = text
    throw err
  } finally {
    clearTimeout(idle)
    clearTimeout(total)
  }
}

async function generate(userContent, onPartial, { system = SYSTEM_PROMPT, maxTokens = 4096, history = [], schema = RESPONSE_SCHEMA } = {}) {
  if (!READY) throw new LLMError('No AI model available: start Ollama or add OPENAI_API_KEY to .env.')
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userContent }]
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS
  let lastErr
  let asuDown = false
  for (const model of order) {
    if (asuDown && !isLocal(model)) continue
    for (let r = rungFor.get(model) ?? 0; r < LADDER.length; r++) {
      let built = false // once something is in the scene, never start over on another model
      let last = null
      const onText = (t) => {
        const p = parsePartial(t)
        if (!p) return
        last = p
        if (onPartial?.(p)) built = true
      }
      try {
        const text = await streamOnce(model, messages, LADDER[r], onText, maxTokens, schema)
        const plan = extractJson(text)
        rungFor.set(model, r)
        working = model
        return plan
      } catch (err) {
        lastErr = err
        console.warn(`[kinex] ${model} (rung ${r}) failed:`, String(err.message).slice(0, 200))
        if (built) return parsePartial(err.partial) || last // keep what already appeared
        // Bad key: other ASU models won't work either, but the local one still can.
        if (err.status === 401 || err.status === 403) {
          if (!isLocal(model)) asuDown = true
          break
        }
        // 400 = this request shape isn't supported: try a looser rung. Otherwise next model.
        if (err.status !== 400) break
      }
    }
  }
  throw lastErr || new LLMError('The model failed.')
}

// history: earlier turns as [{role, content}], so follow-ups like "bigger" make sense.
export function planFromText(text, scene, onPartial, { focus = null, history = [], refs = [] } = {}) {
  // With a model in focus, the conversation edits it (EDIT_PROMPT); otherwise build, guided
  // by reference models from the library.
  return generate(userPrompt(text, scene, focus, refs), onPartial, {
    history,
    maxTokens: 6144,
    system: focus ? EDIT_PROMPT : SYSTEM_PROMPT,
    schema: focus ? EDIT_SCHEMA : RESPONSE_SCHEMA,
  })
}

export function planFromImage(base64Jpeg, scene, onPartial) {
  return generate(
    [
      { type: 'text', text: `${SUMMON_PROMPT}\n\nCURRENT SCENE:\n${JSON.stringify(scene)}` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
    ],
    onPartial,
  )
}

// Asks for only NEW detail parts for an existing object, streamed like a spawn.
export function planDetail(obj, onPartial) {
  return generate(refinePrompt(obj), onPartial, { system: REFINE_PROMPT, maxTokens: 8192 })
}

// Remodel a real model: the AI returns operations on its existing elements.
export async function planRemodel(text, description, history = []) {
  const { REMODEL_PROMPT, REMODEL_SCHEMA, remodelPrompt } = await import('../model/remodel.js')
  return generate(remodelPrompt(text, description), null, { system: REMODEL_PROMPT, schema: REMODEL_SCHEMA, maxTokens: 3000, history })
}

// Which model answered last ("local:qwen3.5:9b", "gpt-oss-120b"...), for the UI.
export function activeModel() {
  return working || MODELS[0] || null
}
