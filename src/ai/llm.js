import { RESPONSE_SCHEMA, EDIT_SCHEMA } from './schema.js'
import { SYSTEM_PROMPT, SUMMON_PROMPT, REFINE_PROMPT, EDIT_PROMPT, userPrompt, refinePrompt } from './prompt.js'
import { parsePartial } from './partialJson.js'

// ASU's OpenAI-compatible server, reached through the Vite proxy (see vite.config.js),
// which adds the key from .env. Outside the browser (tests) it calls the server directly.
const IN_BROWSER = typeof window !== 'undefined' && typeof __LLM_READY__ !== 'undefined'
const DIRECT_KEY = IN_BROWSER ? null : globalThis.process?.env?.OPENAI_API_KEY
const READY = IN_BROWSER ? __LLM_READY__ : Boolean(DIRECT_KEY)
const BASE = IN_BROWSER ? __LLM_BASE__ : 'https://openai.rc.asu.edu/v1'
const ENV_MODEL = typeof __LLM_MODEL__ === 'undefined' ? '' : __LLM_MODEL__
// Fastest good builders first (see README: model benchmark). The rest are backups.
let MODELS = [...new Set([ENV_MODEL, 'gpt-oss-120b', 'llama4-maverick-17b', 'deepseek-v4-1-flash'].filter(Boolean))]
export function setModels(list) {
  MODELS = list
  working = null
}

// Grok (xAI) goes first when its key is set; it is reached through the /xai proxy.
const XAI_READY = IN_BROWSER && typeof __XAI_READY__ !== 'undefined' && __XAI_READY__
const XAI_BASE = '/xai/v1'
const isGrok = (m) => m.startsWith('grok')
const baseFor = (model) => (isGrok(model) ? XAI_BASE : BASE)
let grokPicked = false

// Picks Grok's fastest chat model from the account's own model list (names change often).
async function addGrok() {
  if (!XAI_READY || grokPicked) return
  grokPicked = true
  const fixed = typeof __XAI_MODEL__ !== 'undefined' && __XAI_MODEL__
  let pick = fixed
  if (!pick) {
    try {
      const ids = ((await (await fetch(`${XAI_BASE}/models`)).json()).data || []).map((m) => m.id).filter((id) => isGrok(id) && !/image|vision|imagine|embed/.test(id))
      const score = (id) => (/non-reasoning/.test(id) ? 4 : 0) + (/fast/.test(id) ? 2 : 0) + (/mini/.test(id) ? -1 : 0) + Number(id.match(/grok-(\d+)/)?.[1] || 0) * 0.1
      pick = ids.sort((a, b) => score(b) - score(a))[0]
    } catch (err) {
      console.warn('[kinex] could not list Grok models', err)
    }
  }
  if (pick) {
    MODELS = [pick, ...MODELS.filter((m) => m !== pick)]
    console.info('[kinex] using Grok:', pick)
  }
}

// How each model family is told to skip long hidden reasoning before answering.
function fastMode(model) {
  if (isGrok(model)) return {}
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
    model,
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
  if (!READY) throw new LLMError('No OPENAI_API_KEY in .env.')
  await addGrok()
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userContent }]
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS
  let lastErr
  for (const model of order) {
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
        if (err.status === 401 || err.status === 403) throw err // bad key: nothing else will work
        // 400 = this request shape isn't supported: try a looser rung. Otherwise next model.
        if (err.status !== 400) break
      }
    }
  }
  throw lastErr || new LLMError('The model failed.')
}

// history: earlier turns as [{role, content}], so follow-ups like "bigger" make sense.
export function planFromText(text, scene, onPartial, { focus = null, history = [] } = {}) {
  // With a model in focus, the conversation edits it (EDIT_PROMPT); otherwise build from scratch.
  return generate(userPrompt(text, scene, focus), onPartial, {
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
