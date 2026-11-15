// Tiny IndexedDB cache for finished HD models, so a page reload during the demo
// doesn't mean waiting minutes to regenerate. Everything fails soft: no cache, no problem.
const DB = 'kinex-hd'
const STORE = 'models'

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export const cacheKey = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)

// value: { glb: Blob, image: string (data URL), at: number }
export async function getCached(key) {
  try {
    return (await run('readonly', (s) => s.get(key))) || null
  } catch {
    return null
  }
}

export async function putCached(key, value) {
  try {
    await run('readwrite', (s) => s.put(value, key))
  } catch {
    /* cache is a nice-to-have */
  }
}
