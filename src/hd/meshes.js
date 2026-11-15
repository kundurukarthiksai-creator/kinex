import { useKinex } from '../store.js'
import { getCached, putCached, cacheKey } from './cache.js'

// ASU's image and mesh models, through the same Vite proxy as the chat model.
const BASE = typeof __LLM_BASE__ === 'undefined' ? 'https://openai.rc.asu.edu/v1' : __LLM_BASE__
const POLL_MS = 4000
const MAX_MS = 15 * 60 * 1000

async function json(res) {
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`${res.status} ${text.slice(0, 160)}`)
  }
  if (!res.ok) throw new Error(data?.error?.message || `${res.status}`)
  return data
}

// Text -> clean product-style picture of one object (flux-2), as a data URL.
export async function textToImage(subject) {
  const prompt = `${subject}, a single object centered, isolated on a plain white background, soft studio lighting, product photo, whole object visible, no text`
  const data = await json(
    await fetch(`${BASE}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 512px: ~30 s instead of ~70 s, and trellis only needs a clean silhouette.
      body: JSON.stringify({ model: 'flux-2', prompt, size: '512x512', n: 1, response_format: 'b64_json' }),
    }),
  )
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('The image model returned no picture.')
  return `data:image/png;base64,${b64}`
}

// Benchmarked on ASU: 512 geometry resolution is the fastest setting that still looks
// good; 150k faces + 2K textures stay sharp up close in Inspect.
const LIGHT = { resolution: '512', faces: 150000, texture_size: 2048 }

// Picture -> textured 3D model job (trellis-2).
export async function startMesh(image, options = LIGHT) {
  return json(
    await fetch(`${BASE}/meshes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'trellis-2', image, ...options }),
    }),
  )
}

export async function getMesh(id) {
  return json(await fetch(`${BASE}/meshes/${id}`))
}

export async function downloadMesh(id) {
  const res = await fetch(`${BASE}/meshes/${id}/content`)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res.blob()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const running = new Set()

// What to ask the image model for: the object's name plus the request it came from.
function subjectFor(obj) {
  const text = obj.source?.text
  return text && text !== 'summon' && !text.toLowerCase().includes(obj.name.toLowerCase())
    ? `${obj.name} (from: "${text}")`
    : text && text !== 'summon'
      ? text
      : obj.name
}

// Turns a block object into a real textured model. Progress lives in store.hd[id].
export async function makeHD(id) {
  const st = useKinex.getState()
  const obj = st.objects.find((o) => o.id === id)
  if (!obj || running.has(id) || st.hd[id]?.status === 'ready') return
  running.add(id)
  const set = (patch) => useKinex.getState().setHD(id, patch)
  const startedAt = Date.now()
  const photo = obj.source?.photo
  const subject = subjectFor(obj)
  const key = cacheKey(photo ? `photo ${obj.name} ${photo.length} ${photo.slice(-64)}` : subject)
  set({ status: 'image', stage: photo ? 'photo' : 'picturing', progress: 0, startedAt, error: null, name: obj.name, show: true })
  try {
    const cached = await getCached(key)
    if (cached?.glb) {
      set({ status: 'ready', image: cached.image, url: URL.createObjectURL(cached.glb), progress: 100, cached: true })
      return
    }
    const image = photo || (await textToImage(subject))
    set({ image, status: 'queued', stage: 'queued' })
    const run = async (options) => {
      const job = await startMesh(image, options)
      set({ jobId: job.id, queue: job.queue_position ?? null, status: 'queued', stage: 'queued', progress: 0 })
      let state = job
      while (!/completed|succeeded|failed|cancelled|expired/.test(state.status)) {
        if (Date.now() - startedAt > MAX_MS) throw new Error('The 3D model took too long.')
        await sleep(POLL_MS)
        state = await getMesh(job.id)
        set({
          status: state.status === 'queued' ? 'queued' : 'meshing',
          stage: state.stage,
          progress: state.progress ?? 0,
          queue: state.queue_position ?? null,
        })
      }
      if (!/completed|succeeded/.test(state.status)) throw new Error(state.error?.message || state.error || `Mesh ${state.status}`)
      return job.id
    }
    let jobId
    try {
      jobId = await run(LIGHT)
    } catch (err) {
      // The mesh server sometimes crashes on a job; one retry with its own defaults usually works.
      console.warn('[kinex] HD job failed, retrying with server defaults', err)
      set({ stage: 'retrying', progress: 0 })
      jobId = await run({})
    }
    const glb = await downloadMesh(jobId)
    await putCached(key, { glb, image, at: Date.now() })
    set({ status: 'ready', url: URL.createObjectURL(glb), progress: 100 })
  } catch (err) {
    console.warn('[kinex] HD failed', err)
    set({ status: 'failed', error: String(err.message || err) })
  } finally {
    running.delete(id)
  }
}
