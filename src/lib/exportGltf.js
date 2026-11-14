import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// The Stage registers the group that holds every built object here; Inspect mode
// registers the model it is showing.
export const world = { root: null, inspectRoot: null }

export function exportWorld() {
  const root = world.inspectRoot || world.root
  return new Promise((resolve, reject) => {
    if (!root) return reject(new Error('world not mounted'))
    new GLTFExporter().parse(
      root,
      (glb) => {
        const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
        const a = Object.assign(document.createElement('a'), { href: url, download: `kinex-${(root.name || 'world').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.glb` })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        resolve()
      },
      reject,
      { binary: true, onlyVisible: true },
    )
  })
}
