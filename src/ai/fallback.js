// Offline builder: keeps the demo alive when Gemini is unreachable.
const COLORS = {
  red: '#E5484D', blue: '#2F5BFF', green: '#3FA36B', yellow: '#FFC53D', orange: '#F28C28', purple: '#8E4EC6',
  pink: '#F06AA7', white: '#F4F7FB', black: '#23263A', gold: '#D4A72C', silver: '#B8BFCC', teal: '#12A594', brown: '#8A5A3B',
}

const P = (shape, size, position, color, material = 'plastic', rotation) => ({ shape, size, position, color, material, rotation })

const RECIPES = {
  sphere: (c) => [P('sphere', [1, 1, 1], [0, 0.5, 0], c || COLORS.blue)],
  ball: (c) => RECIPES.sphere(c),
  cube: (c) => [P('box', [1, 1, 1], [0, 0.5, 0], c || COLORS.orange)],
  box: (c) => RECIPES.cube(c),
  tree: (c) => [
    P('cylinder', [0.3, 1.2, 0.3], [0, 0.6, 0], '#8A5A3B', 'wood'),
    P('cone', [1.6, 1.4, 1.6], [0, 1.6, 0], c || '#3FA36B', 'matte'),
    P('cone', [1.2, 1.1, 1.2], [0, 2.3, 0], c || '#4DB87A', 'matte'),
  ],
  house: (c) => [
    P('box', [2, 1.4, 1.6], [0, 0.7, 0], c || '#F2E6D8', 'matte'),
    P('pyramid', [2.6, 1, 2.1], [0, 1.9, 0], '#B5523B', 'matte', [0, 45, 0]),
    P('box', [0.45, 0.8, 0.05], [0, 0.4, 0.81], '#6B4430', 'wood'),
    P('box', [0.4, 0.4, 0.05], [-0.6, 0.85, 0.81], '#9FD3FF', 'glass'),
    P('box', [0.4, 0.4, 0.05], [0.6, 0.85, 0.81], '#9FD3FF', 'glass'),
  ],
  rocket: (c) => [
    P('cylinder', [0.7, 2, 0.7], [0, 1.3, 0], c || '#F4F7FB', 'metal'),
    P('cone', [0.7, 0.8, 0.7], [0, 2.7, 0], COLORS.red, 'plastic'),
    P('sphere', [0.3, 0.3, 0.1], [0, 1.7, 0.33], '#9FD3FF', 'glass'),
    P('box', [0.08, 0.6, 0.5], [0.4, 0.5, 0], COLORS.red, 'plastic'),
    P('box', [0.08, 0.6, 0.5], [-0.4, 0.5, 0], COLORS.red, 'plastic'),
    P('cone', [0.45, 0.35, 0.45], [0, 0.17, 0], '#FFB000', 'glow', [180, 0, 0]),
  ],
  snowman: () => [
    P('sphere', [1.2, 1.2, 1.2], [0, 0.6, 0], '#F4F7FB', 'matte'),
    P('sphere', [0.85, 0.85, 0.85], [0, 1.5, 0], '#F4F7FB', 'matte'),
    P('sphere', [0.6, 0.6, 0.6], [0, 2.15, 0], '#F4F7FB', 'matte'),
    P('cone', [0.12, 0.4, 0.12], [0, 2.17, 0.4], '#F28C28', 'plastic', [90, 0, 0]),
    P('cylinder', [0.34, 0.4, 0.34], [0, 2.62, 0], '#23263A', 'matte'),
  ],
  tower: (c) => [
    P('cylinder', [1.1, 2.6, 1.1], [0, 1.3, 0], c || '#C9C3B8', 'matte'),
    P('cylinder', [1.35, 0.3, 1.35], [0, 2.75, 0], '#B5AEA2', 'matte'),
    P('cone', [1.4, 1, 1.4], [0, 3.4, 0], '#5B6CF0', 'plastic'),
  ],
  robot: (c) => [
    P('box', [1, 1.1, 0.6], [0, 1.15, 0], c || '#B8BFCC', 'metal'),
    P('box', [0.7, 0.55, 0.55], [0, 2, 0], '#D3D8E2', 'metal'),
    P('sphere', [0.14, 0.14, 0.05], [-0.15, 2.05, 0.28], '#2F5BFF', 'glow'),
    P('sphere', [0.14, 0.14, 0.05], [0.15, 2.05, 0.28], '#2F5BFF', 'glow'),
    P('cylinder', [0.04, 0.35, 0.04], [0, 2.45, 0], '#23263A', 'metal'),
    P('sphere', [0.12, 0.12, 0.12], [0, 2.65, 0], COLORS.red, 'glow'),
    P('capsule', [0.22, 0.9, 0.22], [-0.65, 1.15, 0], '#8890A6', 'metal'),
    P('capsule', [0.22, 0.9, 0.22], [0.65, 1.15, 0], '#8890A6', 'metal'),
    P('box', [0.3, 0.6, 0.35], [-0.25, 0.3, 0], '#8890A6', 'metal'),
    P('box', [0.3, 0.6, 0.35], [0.25, 0.3, 0], '#8890A6', 'metal'),
  ],
}

export function offlinePlan(text) {
  const t = text.toLowerCase()
  const colorWord = Object.keys(COLORS).find((c) => t.includes(c))
  const c = colorWord ? COLORS[colorWord] : null

  if (/\b(clear|reset|delete everything|remove everything)\b/.test(t)) return { narration: 'Clean slate.', actions: [{ type: 'clear' }] }
  if (/\b(delete|remove|destroy)\b/.test(t)) return { narration: 'Gone.', actions: [{ type: 'delete' }] }
  if (/zero.?g|no gravity|space|float away/.test(t)) return { narration: 'Gravity off. Everything drifts.', actions: [{ type: 'environment', gravity: 'zero' }] }
  if (/moon|low gravity/.test(t)) return { narration: 'Moon gravity.', actions: [{ type: 'environment', gravity: 'low' }] }
  if (/gravity/.test(t)) return { narration: 'Gravity is back.', actions: [{ type: 'environment', gravity: 'normal' }] }
  for (const preset of ['night', 'sunset', 'dawn', 'studio']) {
    if (t.includes(preset)) return { narration: `Switched to ${preset}.`, actions: [{ type: 'environment', preset }] }
  }
  if (/bigger|larger|grow/.test(t)) return { narration: 'Bigger.', actions: [{ type: 'modify', scale: 1.5 }] }
  if (/smaller|shrink/.test(t)) return { narration: 'Smaller.', actions: [{ type: 'modify', scale: 0.66 }] }
  if (/\bspin\b/.test(t)) return { narration: 'Spinning.', actions: [{ type: 'modify', behavior: { kind: 'spin' } }] }
  if (colorWord && /\b(make|paint|turn|color)\b/.test(t)) return { narration: `Painted ${colorWord}.`, actions: [{ type: 'modify', color: c }] }

  const key = Object.keys(RECIPES).find((k) => t.includes(k)) || 'cube'
  const glow = /glow|neon|light/.test(t)
  let parts = RECIPES[key](c)
  if (glow) parts = parts.map((p) => ({ ...p, material: 'glow' }))
  const physics = /float|hover/.test(t) ? 'float' : 'dynamic'
  return {
    narration: `Here's a ${colorWord ? colorWord + ' ' : ''}${key}.`,
    actions: [{ type: 'spawn', name: key, position: [0, 0, 0], physics, parts }],
  }
}
