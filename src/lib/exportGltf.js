import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// The Stage registers the group that holds every built object here.
export const world = { root: null }

export function exportWorld() {
  return new Promise((resolve, reject) => {
    if (!world.root) return reject(new Error('world not mounted'))
    new GLTFExporter().parse(
      world.root,
      (glb) => {
        const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
        const a = Object.assign(document.createElement('a'), { href: url, download: 'kinex-world.glb' })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        resolve()
      },
      reject,
      { binary: true, onlyVisible: true },
    )
  })
}
