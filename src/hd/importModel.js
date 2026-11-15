import * as THREE from 'three'
import { useKinex } from '../store.js'
import { buildObject } from '../ai/apply.js'
import { loadModel } from './HDModel.jsx'

export const IMPORT_EXTENSIONS = ['ifc', 'glb', 'gltf', 'obj', 'stl']
const LONGEST_SIDE = 2.2 // meters in the world; Inspect lets you zoom in

// Brings any 3D file into the world as a model you can grab, throw and inspect.
// The physics body is a box around the mesh; the mesh itself is what you see.
export async function importModelFile(file) {
  const st = useKinex.getState()
  const ext = file.name.split('.').pop().toLowerCase()
  if (!IMPORT_EXTENSIONS.includes(ext)) {
    st.setStatus('error', `Kinex opens .ifc, .glb, .gltf, .obj and .stl files. ${file.name} is a .${ext} file.`)
    return
  }
  if (ext === 'ifc') {
    // Building (BIM) files open as a real model you can take apart by chat.
    const { openIfc } = await import('../model/current.js')
    try {
      const c = await openIfc(await file.arrayBuffer(), file.name.replace(/\.ifc$/i, ''))
      st.say('assistant', `Opened ${file.name}: ${c.wall || 0} walls, ${c.door || 0} doors, ${c.window || 0} windows, ${c.furniture || 0} pieces of furniture. Ask me anything about it, or tell me what to change.`)
    } catch {
      st.setStatus('error', `Couldn't read ${file.name}. Is it a valid IFC file?`)
    }
    return
  }
  const format = ext === 'gltf' ? 'glb' : ext
  const url = URL.createObjectURL(file)
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'model'
  st.setStatus('thinking', `Opening ${file.name}`)
  try {
    const scene = await loadModel(url, format)
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    const k = LONGEST_SIDE / Math.max(size.x, size.y, size.z, 1e-6)
    const [w, h, d] = [size.x * k, size.y * k, size.z * k].map((v) => Math.max(v, 0.05))
    const obj = buildObject(
      { name, position: [0, 0, 0], physics: 'dynamic', parts: [{ shape: 'box', size: [w, h, d], position: [0, h / 2, 0], color: '#B8BFCC', material: 'matte' }] },
      st.objects,
    )
    obj.source = { text: name, file: file.name }
    st.setHD(obj.id, { status: 'ready', url, format, name, image: null, progress: 100, imported: true, dismissed: true })
    st.addObject(obj)
    st.set({ narration: `Opened ${file.name}. Double-click it to inspect from every side.` })
    st.setStatus('done')
    return obj.id
  } catch (err) {
    console.warn('[kinex] import failed', err)
    URL.revokeObjectURL(url)
    st.setStatus('error', `Couldn't read ${file.name}. Is it a valid ${ext.toUpperCase()} file?`)
  }
}
