import { RESPONSE_SCHEMA } from './schema.js'
import { SYSTEM_PROMPT, SUMMON_PROMPT, userPrompt } from './prompt.js'

// ASU's OpenAI-compatible server. Key and models come from .env.
const KEY = import.meta.env.OPENAI_API_KEY
const BASE = (import.meta.env.OPENAI_BASE_URL || 'https://openai.rc.asu.edu/v1').replace(/\/$/, '')
const MODELS = [...new Set([import.meta.env.OPENAI_MODEL, 'qwen38-27b', 'deepseek-v4-1-flash'].filter(Boolean))]
const TIMEOUT_MS = { text: 60000, vision: 90000 }

export const hasLLM = Boolean(KEY)

// Servers differ in what they accept, so try the strictest output mode first and
// remember per model which one worked.
const MODES = ['json_schema', 'json_object', 'plain']
const modeFor = new Map()
let working = null

export class LLMError extends Error {}

function responseFormat(mode) {
  if (mode === 'json_schema') return { type: 'json_schema', json_schema: { name: 'kinex_plan', schema: RESPONSE_SCHEMA } }
  if (mode === 'json_object') return { type: 'json_object' }
  return undefined
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

async function post(model, messages, mode, ms) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        ...(responseFormat(mode) ? { response_format: responseFormat(mode) } : {}),
      }),
    })
    const body = await res.text()
    if (!res.ok) {
      const err = new LLMError(`${res.status} ${body.slice(0, 200)}`)
      err.status = res.status
      throw err
    }
    const data = JSON.parse(body)
    const msg = data.choices?.[0]?.message || {}
    return extractJson(msg.content || msg.reasoning_content || '')
  } catch (err) {
    if (err.name === 'AbortError') throw new LLMError('The model took too long to answer.')
    throw err
  } finally {
    clearTimeout(t)
  }
}

async function generate(userContent, ms) {
  if (!KEY) throw new LLMError('No OPENAI_API_KEY in .env.')
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS
  let lastErr
  for (const model of order) {
    const start = MODES.indexOf(modeFor.get(model) || 'json_schema')
    for (const mode of MODES.slice(start)) {
      try {
        const plan = await post(model, messages, mode, ms)
        modeFor.set(model, mode)
        working = model
        return plan
      } catch (err) {
        lastErr = err
        console.warn(`[kinex] ${model} (${mode}) failed:`, String(err.message).slice(0, 200))
        if (err.status === 401 || err.status === 403) throw err // bad key: nothing else will work
        // A 400 usually means this output mode isn't supported: try a looser one.
        // Anything else (timeout, overload, bad JSON) moves on to the next model.
        if (err.status !== 400 && !/did not return JSON/.test(err.message)) break
      }
    }
  }
  throw lastErr || new LLMError('The model failed.')
}

export function planFromText(text, scene) {
  return generate(userPrompt(text, scene), TIMEOUT_MS.text)
}

export function planFromImage(base64Jpeg, scene) {
  return generate(
    [
      { type: 'text', text: `${SUMMON_PROMPT}\n\nCURRENT SCENE:\n${JSON.stringify(scene)}` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
    ],
    TIMEOUT_MS.vision,
  )
}
