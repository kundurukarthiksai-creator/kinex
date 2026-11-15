// Store visual edits in standard glTF properties so exported models keep them.
export function applyAppearance(material, appearance = {}) {
  if (appearance.color && /^#[0-9a-f]{6}$/i.test(appearance.color)) material.color.set(appearance.color)
  if (appearance.material === 'metal') { material.roughness=.22;material.metalness=.9 }
  if (appearance.material === 'matte') { material.roughness=.9;material.metalness=0 }
  if (appearance.material === 'plastic') { material.roughness=.32;material.metalness=0 }
  if (appearance.material === 'wood') {
    material.roughness=.88;material.metalness=0
    if(!appearance.color)material.color.set('#8A5A3B')
  }
  if (appearance.material === 'glass') {
    material.roughness=.12;material.metalness=.05;material.transparent=true;material.opacity=.3;material.depthWrite=false
  }
  if (appearance.material === 'glow') {
    material.emissive?.copy(material.color);material.emissiveIntensity=1.5;material.roughness=.35;material.metalness=0
  }
  material.needsUpdate=true
}
