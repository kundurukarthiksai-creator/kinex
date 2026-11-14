import { GoogleGenAI } from '@google/genai'
import { RESPONSE_SCHEMA } from './schema.js'
import { SYSTEM_PROMPT, SUMMON_PROMPT, userPrompt } from './prompt.js'

const KEY = import.meta.env.GEMINI_API
const MODELS = [...new Set([import.meta.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean))]
const TIMEOUT_MS = 30000

export const hasGemini = Boolean(KEY)

let ai = null
let working = null // { model, thinking } that answered last time

export class GeminiError extends Error {
  constructor(message, { fatal = false } = {}) {
    super(message)
    this.fatal = fatal
  }
}

function candidates() {
  const all = MODELS.flatMap((model) => [
    { model, thinking: true },
    { model, thinking: false },
  ])
  if (!working) return all
  return [working, ...all.filter((c) => c.model !== working.model || c.thinking !== working.thinking)]
}

function withTimeout(promise) {
  let t
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new GeminiError('Gemini took too long to answer.')), TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

function parseJson(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  return JSON.parse(clean)
}

async function generate(contents) {
  if (!KEY) throw new GeminiError('No GEMINI_API key in .env.', { fatal: true })
  ai ??= new GoogleGenAI({ apiKey: KEY })
  let lastErr
  for (const c of candidates()) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: c.model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA,
            temperature: 0.8,
            ...(c.thinking ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
          },
        }),
      )
      const json = parseJson(res.text)
      working = c
      return json
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || err)
      // Bad key, quota or network: trying other models won't help.
      if (/API key|PERMISSION_DENIED|401|403|429|RESOURCE_EXHAUSTED|Failed to fetch|took too long/i.test(msg)) break
    }
  }
  throw new GeminiError(String(lastErr?.message || lastErr || 'Gemini failed.'))
}

export function planFromText(text, scene) {
  return generate(userPrompt(text, scene))
}

export function planFromImage(base64Jpeg, scene) {
  return generate([
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
        { text: `${SUMMON_PROMPT}\n\nCURRENT SCENE:\n${JSON.stringify(scene)}` },
      ],
    },
  ])
}
