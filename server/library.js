// Kinex model library: thousands of example models (converted from BlendNet, Apache-2.0)
// plus every model people liked. The builder retrieves the closest ones as references,
// so each request builds on proven designs, and the library grows as people use it.
//
// Runs inside the Vite dev / preview server. Embeddings come from the local Ollama
// `embeddinggemma` model and are cached in library/vectors.bin (rebuilt if missing).
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434'
const EMBED_MODEL = process.env.KINEX_EMBED_MODEL || 'embeddinggemma'

function readJsonl(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

async function embed(texts) {
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`embed ${res.status}`)
  const j = await res.json()
  return j.embeddings.map((v) => normalize(Float32Array.from(v)))
}

function normalize(v) {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

const dot = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || [])

export function createLibrary(root) {
  const dir = join(root, 'library')
  const files = { base: join(dir, 'blendnet.jsonl'), user: join(dir, 'user.jsonl'), votes: join(dir, 'votes.json'), vectors: join(dir, 'vectors.bin') }
  const items = [...readJsonl(files.base).map((r) => ({ ...r, source: 'blendnet' })), ...readJsonl(files.user).map((r) => ({ ...r, source: 'liked' }))]
  const votes = existsSync(files.votes) ? JSON.parse(readFileSync(files.votes, 'utf8')) : {}
  let vectors = null // Float32Array per item, same order as items
  let status = 'idle'

  // Cached base vectors: header [count, dim] then count*dim floats.
  function loadCache() {
    if (!existsSync(files.vectors)) return false
    const buf = readFileSync(files.vectors)
    const head = new Uint32Array(buf.buffer, buf.byteOffset, 2)
    const [count, dim] = head
    const base = items.filter((i) => i.source === 'blendnet').length
    if (count !== base) return false
    const all = new Float32Array(buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + 8 + count * dim * 4))
    vectors = items.map((it, i) => (i < count ? all.subarray(i * dim, (i + 1) * dim) : it.vector ? normalize(Float32Array.from(it.vector)) : null))
    return true
  }

  async function buildVectors() {
    if (vectors || status === 'building') return
    if (loadCache()) {
      status = 'ready'
      return
    }
    status = 'building'
    try {
      const base = items.filter((i) => i.source === 'blendnet')
      const out = []
      for (let i = 0; i < base.length; i += 64) out.push(...(await embed(base.slice(i, i + 64).map((r) => r.text))))
      const dim = out[0]?.length || 0
      const buf = Buffer.alloc(8 + out.length * dim * 4)
      buf.writeUInt32LE(out.length, 0)
      buf.writeUInt32LE(dim, 4)
      out.forEach((v, i) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf, 8 + i * dim * 4))
      writeFileSync(files.vectors, buf)
      vectors = items.map((it, i) => (i < out.length ? out[i] : it.vector ? normalize(Float32Array.from(it.vector)) : null))
      status = 'ready'
      console.log(`[kinex library] embedded ${out.length} models`)
    } catch (err) {
      status = 'no-embeddings'
      console.warn('[kinex library] embeddings unavailable, using keyword search:', err.message)
    }
  }

  const score = (it, sim) => sim + Math.min(0.15, (votes[it.id] || 0) * 0.03) + (it.source === 'liked' ? 0.04 : 0) + (it.verify === 'human' ? 0.02 : 0)

  async function search(text, k = 3) {
    let ranked
    if (vectors && status === 'ready') {
      const [q] = await embed([text])
      ranked = items.map((it, i) => ({ it, sim: vectors[i] ? dot(q, vectors[i]) : -1 }))
    } else {
      const q = words(text)
      ranked = items.map((it) => {
        const w = words(`${it.name} ${it.text}`)
        let hit = 0
        for (const x of q) if (w.has(x)) hit++
        return { it, sim: q.size ? hit / q.size : 0 }
      })
    }
    return ranked
      .map((r) => ({ ...r, s: score(r.it, r.sim) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map(({ it, sim, s }) => ({ id: it.id, name: it.name, text: it.text, lines: it.lines, source: it.source, similarity: Math.round(sim * 1000) / 1000, score: Math.round(s * 1000) / 1000 }))
  }

  async function save({ text, name, lines }) {
    if (!text || !Array.isArray(lines) || lines.length < 1) throw new Error('nothing to save')
    let vector = null
    try {
      ;[vector] = await embed([text])
    } catch {
      /* saved without a vector; keyword search still finds it */
    }
    const it = { id: `liked-${Date.now()}`, name: name || 'model', text, lines: lines.slice(0, 96), source: 'liked', at: new Date().toISOString(), vector: vector ? Array.from(vector) : undefined }
    appendFileSync(files.user, JSON.stringify(it) + '\n')
    items.push(it)
    if (vectors) vectors.push(vector)
    votes[it.id] = 1
    writeFileSync(files.votes, JSON.stringify(votes))
    return { id: it.id }
  }

  function vote(id, delta) {
    votes[id] = (votes[id] || 0) + Math.max(-1, Math.min(1, Number(delta) || 0))
    writeFileSync(files.votes, JSON.stringify(votes))
    return { id, votes: votes[id] }
  }

  return { search, save, vote, buildVectors, info: () => ({ count: items.length, liked: items.filter((i) => i.source === 'liked').length, search: status === 'ready' ? 'meaning' : 'keywords' }) }
}

async function readBody(req) {
  let s = ''
  for await (const chunk of req) s += chunk
  return s ? JSON.parse(s) : {}
}

// Vite plugin: /api/library/{info,search,save,vote}
export function libraryPlugin() {
  let lib = null
  const handler = async (req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/library')) return next()
    const send = (code, body) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
    try {
      if (url.startsWith('/api/library/info')) return send(200, lib.info())
      const body = req.method === 'POST' ? await readBody(req) : {}
      if (url.startsWith('/api/library/search')) return send(200, { results: await lib.search(String(body.text || ''), Math.min(8, Number(body.k) || 3)), ...lib.info() })
      if (url.startsWith('/api/library/save')) return send(200, await lib.save(body))
      if (url.startsWith('/api/library/vote')) return send(200, lib.vote(body.id, body.delta))
      send(404, { error: 'unknown' })
    } catch (err) {
      send(500, { error: String(err.message || err) })
    }
  }
  const start = (server) => {
    lib = createLibrary(server.config.root)
    lib.buildVectors()
    server.middlewares.use(handler)
  }
  return { name: 'kinex-library', configureServer: start, configurePreviewServer: start }
}
