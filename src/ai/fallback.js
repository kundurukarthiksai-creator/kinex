// Offline builder: keeps the demo alive when the AI server is unreachable.
const COLORS = {
  red: '#E5484D', blue: '#2F5BFF', green: '#3FA36B', yellow: '#FFC53D', orange: '#F28C28', purple: '#8E4EC6',
  pink: '#F06AA7', white: '#F4F7FB', black: '#23263A', gold: '#D4A72C', silver: '#B8BFCC', teal: '#12A594', brown: '#8A5A3B',
}

const P = (shape, size, position, color, material = 'plastic', rotation) => ({ shape, size, position, color, material, rotation })

const RECIPES = {
  cylinder: (c) => [P('cylinder',[1,1.5,1],[0,.75,0],c||COLORS.teal)],
  cone: (c) => [P('cone',[1.4,1.8,1.4],[0,.9,0],c||COLORS.orange)],
  torus: (c) => [P('torus',[1.7,1.7,.35],[0,.85,0],c||COLORS.gold,'metal')],
  capsule: (c) => [P('capsule',[.8,1.7,.8],[0,.85,0],c||COLORS.purple)],
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
  lighthouse: (c) => [
    P('cylinder',[1.1,.2,1.1],[0,.1,0],'#A4A9A4','matte'),
    P('cylinder',[.65,2.1,.65],[0,1.2,0],c||'#F4F7FB','matte'),
    P('cylinder',[.69,.32,.69],[0,1.5,0],'#D86552','plastic'),
    P('cylinder',[.88,.12,.88],[0,2.31,0],'#26343C','metal'),
    P('cylinder',[.56,.45,.56],[0,2.58,0],'#FFC53D','glow'),
    P('cone',[.92,.45,.92],[0,3.02,0],'#D86552','plastic'),
    P('box',[.16,.34,.05],[0,.4,.34],'#243D4B','matte'),
    ...[-.29,.29].flatMap(x=>[-.29,.29].map(z=>P('cylinder',[.035,.52,.035],[x,2.6,z],'#26343C','metal'))),
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
  const t = text.toLowerCase().replace(/\bring\b/g, 'torus')
  const colorWord = Object.keys(COLORS).find((c) => t.includes(c))
  const c = colorWord ? COLORS[colorWord] : null

  const key = Object.keys(RECIPES).find((k) => new RegExp(`\\b${k}\\b`).test(t))
  if (!key) return { narration: 'The offline builder supports spheres, cubes, cylinders, cones, rings, trees, houses, rockets and robots. Try one of those, or a model from the local library.', actions: [] }
  const glow = /glow|neon|light/.test(t)
  let parts = RECIPES[key](c)
  if (glow) parts = parts.map((p) => ({ ...p, material: 'glow' }))
  const physics = /float|hover/.test(t) ? 'float' : 'dynamic'
  return {
    narration: `Here's a ${colorWord ? colorWord + ' ' : ''}${key}.`,
    actions: [{ type: 'spawn', name: key, position: [0, 0, 0], physics, parts }],
  }
}
