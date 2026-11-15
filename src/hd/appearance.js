// Keep appearance in standard glTF material properties so edits also export.
export function applyAppearance(material, appearance = {}) {
  if (appearance.material === 'metal') { material.roughness = .22; material.metalness = .9 }
  if (appearance.material === 'matte') { material.roughness = .9; material.metalness = 0 }
  if (appearance.material === 'plastic') { material.roughness = .32; material.metalness = 0 }
  if (appearance.color && /^#[0-9a-f]{6}$/i.test(appearance.color)) material.color.set(appearance.color)
  material.needsUpdate = true
}
