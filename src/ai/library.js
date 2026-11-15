import { buildObject } from './apply.js'
import { toPartLine } from './partLine.js'

// Talks to the model library (server/library.js): finds proven designs similar to a
// request, saves models people liked, and records votes. Fails soft: no library, no refs.

async function post(path, body) {
  const res = await fetch(`/api/library/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`library ${res.status}`)
  return res.json()
}

// The library's lines come from many sources and scales; re-express each reference in
// Kinex's own frame (base at y = 0, sensible size) so the AI can adapt it directly.
function normalizeLines(lines) {
  const obj = buildObject({ name: 'ref', position: [0, 0, 0], parts: lines }, [])
  return obj.parts.map(toPartLine)
}

export async function findReferences(text, k = 3) {
  try {
    const { results = [], search } = await post('search', { text, k })
    console.info('[kinex] references', JSON.stringify(results.map((r) => ({ source: r.source, similarity: r.similarity, text: r.text.slice(0, 60) }))))
    return results.map((r) => ({ ...r, lines: normalizeLines(r.lines).slice(0, 24), search }))
  } catch (err) {
    console.warn('[kinex] library search unavailable', err.message)
    return []
  }
}

export async function saveLiked({ text, name, parts }) {
  return post('save', { text, name, lines: parts.map(toPartLine) })
}

export async function voteOn(ids = [], delta) {
  await Promise.all(ids.map((id) => post('vote', { id, delta }).catch(() => null)))
}

export async function libraryInfo() {
  try {
    return await (await fetch('/api/library/info', { signal: AbortSignal.timeout(4000) })).json()
  } catch {
    return null
  }
}
