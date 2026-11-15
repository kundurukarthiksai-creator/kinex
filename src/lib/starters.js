import { useKinex } from '../store.js'
import { buildObject } from '../ai/apply.js'
import { exitInspect, viewer } from './viewer.js'

const p = (shape, size, position, color, material = 'plastic', rotation = [0, 0, 0]) => ({ shape, size, position, color, material, rotation })
const cyan = '#62E3E1', cream = '#F0F1E9', blue = '#5B67E8', orange = '#FF9967'

export const STARTERS = [
  { id: 'orbit', name: 'Orbital playground', subtitle: 'A little space to play.', icon: 'orbit', tag: 'START HERE', color: cyan },
  { id: 'robot', name: 'Your robot companion', subtitle: 'Meet your new co-creator.', icon: 'robot', tag: 'CHARACTER', color: blue },
  { id: 'solar', name: 'A pocket solar system', subtitle: 'Put a universe in motion.', icon: 'planet', tag: 'EXPERIMENT', color: orange },
  { id: 'habitat', name: 'A place to imagine', subtitle: 'Build your own little escape.', icon: 'home', tag: 'ARCHITECTURE', color: '#9DCAA4' },
]

function recipes(id) {
  if (id === 'orbit') return [
    { name: 'Orbit sculpture', physics: 'float', position: [0, 0.6, 0], behavior: { kind: 'float', speed: 0.35 }, parts: [
      p('sphere', [2.0, 2.0, 2.0], [0, 1.75, 0], cream, 'plastic'),
      p('torus', [3.75, 3.75, 0.14], [0, 1.75, 0], cyan, 'plastic', [65, -25, 0]),
      p('torus', [3.1, 3.1, 0.09], [0, 1.75, 0], blue, 'plastic', [20, 55, -25]),
      p('sphere', [0.35, 0.35, 0.35], [1.35, 2.7, 0.7], orange),
    ] },
    { name: 'Little satellite', position: [-2.9, 1.1, 0.4], physics: 'float', behavior: { kind: 'float', speed: 0.75 }, parts: [p('icosahedron', [0.85, 0.85, 0.85], [0, 0.45, 0], orange, 'plastic')] },
    { name: 'Blue moon', position: [2.6, 1.9, -0.5], physics: 'float', behavior: { kind: 'float', speed: 0.55 }, parts: [p('sphere', [0.65, 0.65, 0.65], [0, 0.35, 0], blue, 'plastic')] },
  ]
  if (id === 'robot') return [
    { name: 'Kino the robot', position: [0, 0.15, 0], parts: [
      p('box', [1.45, 1.15, 0.8], [0, 1.4, 0], cream),
      p('box', [1.28, 0.85, 0.9], [0, 2.65, 0], cream),
      p('box', [1.05, 0.5, 0.08], [0, 2.68, 0.46], '#25373D'),
      p('sphere', [0.19, 0.19, 0.08], [-0.24, 2.72, 0.52], cyan, 'glow'),
      p('sphere', [0.19, 0.19, 0.08], [0.24, 2.72, 0.52], cyan, 'glow'),
      p('box', [0.3, 0.08, 0.06], [0, 2.5, 0.53], cyan),
      p('cylinder', [0.23, 0.35, 0.23], [0, 2.14, 0], blue),
      p('cylinder', [0.05, 0.35, 0.05], [0, 3.21, 0], '#687B80', 'metal'),
      p('sphere', [0.2, 0.2, 0.2], [0, 3.43, 0], orange),
      p('capsule', [0.27, 1.1, 0.3], [-0.93, 1.42, 0], blue),
      p('capsule', [0.27, 1.1, 0.3], [0.93, 1.42, 0], blue, 'plastic', [0, 0, -20]),
      p('box', [0.4, 0.7, 0.5], [-0.38, 0.5, 0], '#7188A2'),
      p('box', [0.4, 0.7, 0.5], [0.38, 0.5, 0], '#7188A2'),
      p('box', [0.55, 0.24, 0.75], [-0.38, 0.12, 0.1], blue),
      p('box', [0.55, 0.24, 0.75], [0.38, 0.12, 0.1], blue),
      p('sphere', [0.22, 0.22, 0.08], [0, 1.5, 0.42], orange),
    ] },
  ]
  if (id === 'solar') return [
    { name: 'Sun', position: [0, 1.3, 0], physics: 'float', behavior: { kind: 'spin', speed: 0.1 }, parts: [p('sphere', [1.7, 1.7, 1.7], [0, 0.85, 0], '#FFB96B', 'glow')] },
    { name: 'Earth', position: [2.6, 1.6, 0], physics: 'float', behavior: { kind: 'orbit', speed: 0.35 }, parts: [p('sphere', [0.75, 0.75, 0.75], [0, 0.4, 0], cyan)] },
    { name: 'Saturn', position: [-3.4, 1.2, -0.7], physics: 'float', behavior: { kind: 'orbit', speed: 0.23 }, parts: [p('sphere', [0.95, 0.95, 0.95], [0, 0.6, 0], cream), p('torus', [1.65, 1.65, 0.06], [0, 0.6, 0], orange, 'metal', [70, 0, 0])] },
    { name: 'Mars', position: [-1.4, 1.8, 0.5], physics: 'float', behavior: { kind: 'orbit', speed: 0.5 }, parts: [p('sphere', [0.4, 0.4, 0.4], [0, 0.2, 0], '#C67E6B')] },
  ]
  return [
    { name: 'Little retreat', position: [0, 0, 0], parts: [
      p('box', [3.2, 0.16, 2.8], [0, 0.08, 0], '#A3B898', 'matte'),
      p('box', [1.9, 1.6, 1.6], [0, 0.96, 0], cream, 'matte'),
      p('pyramid', [2.5, 1.1, 2.1], [0, 2.31, 0], '#61766D', 'matte', [0, 45, 0]),
      p('box', [0.5, 1.05, 0.08], [-0.35, 0.68, 0.84], '#9A745D', 'wood'),
      p('box', [0.58, 0.6, 0.08], [0.5, 1.12, 0.84], cyan, 'glass'),
      p('box', [0.85, 0.12, 0.6], [-0.35, 0.2, 1.2], '#D5C8B8', 'matte'),
    ] },
    { name: 'Garden tree', position: [2.5, 0, -0.5], parts: [p('cylinder', [0.25, 1.3, 0.25], [0, 0.65, 0], '#9A745D', 'wood'), p('sphere', [1.55, 1.7, 1.55], [0, 1.85, 0], '#8AAC8C', 'matte')] },
  ]
}

export function loadStarter(id) {
  if (useKinex.getState().status.kind === 'thinking') return
  exitInspect()
  const starter = STARTERS.find((s) => s.id === id) || STARTERS[0]
  const objects = []
  recipes(starter.id).forEach((recipe) => {
    const obj = buildObject(recipe, objects)
    obj.source = { text: recipe.name }
    objects.push(obj)
  })
  useKinex.getState().set({ objects, hd: {}, bursts: [], projectName: starter.name, lastId: objects[0]?.id, hoverId: null, heldIds: [], environment: { preset: 'studio', gravity: 'normal' }, narration: 'Your playground is ready. Grab an object, or describe what comes next.', status: { kind: 'done', text: '' } })
  viewer.controls?.setLookAt(0, 4.2, 13, 0, 1.4, 0, true)
}

export function newWorkspace() {
  if (useKinex.getState().status.kind === 'thinking') return
  exitInspect()
  useKinex.getState().set({ objects: [], hd: {}, bursts: [], projectName: 'Untitled world', lastId: null, hoverId: null, heldIds: [], narration: '', subtitle: { text: '', interim: false, at: 0 }, status: { kind: 'idle', text: '' } })
  viewer.controls?.setLookAt(0, 4.2, 13, 0, 1.1, 0, true)
}
