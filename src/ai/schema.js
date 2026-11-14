export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'dome', 'torus', 'capsule', 'icosahedron']
export const MATERIALS = ['matte', 'plastic', 'metal', 'glass', 'glow', 'wood']
export const PHYSICS = ['dynamic', 'static', 'float']
export const BEHAVIORS = ['none', 'spin', 'float', 'orbit', 'pulse', 'bounce']
export const PRESETS = ['studio', 'sunset', 'night', 'dawn']
export const GRAVITY = ['normal', 'low', 'zero']

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }

const part = {
  type: 'object',
  properties: {
    shape: { type: 'string', enum: SHAPES },
    size: { ...vec3, description: 'bounding box [width, height, depth] in meters' },
    position: { ...vec3, description: 'center of this part, relative to the object base (y=0 is the ground under it)' },
    rotation: { ...vec3, description: 'euler rotation in degrees' },
    color: { type: 'string', description: 'hex like #E4572E' },
    material: { type: 'string', enum: MATERIALS },
  },
  required: ['shape', 'size', 'position', 'color', 'material'],
}

const behavior = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: BEHAVIORS },
    speed: { type: 'number', description: '0.2 slow .. 3 fast, default 1' },
    targetId: { type: 'string', description: 'for orbit: id of the object to orbit around' },
  },
  required: ['kind'],
}

// Separate lists per verb so a spawn can *require* its parts (a flat action type let
// the model skip them).
const spawn = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'short noun, e.g. "castle"' },
    position: { ...vec3, description: 'where the object base sits, [x, y, z]' },
    physics: { type: 'string', enum: PHYSICS },
    behavior,
    parts: { type: 'array', items: part, minItems: 1, maxItems: 24, description: '1-24 primitives composing the object' },
  },
  required: ['name', 'position', 'parts'],
}

const modify = {
  type: 'object',
  properties: {
    targetId: { type: 'string', description: 'id of an existing object' },
    scale: { type: 'number', description: 'multiplier on current size, 2 = twice as big' },
    color: { type: 'string', description: 'recolor the main color, hex' },
    position: { ...vec3, description: 'move the object base to [x, y, z]' },
    rotateY: { type: 'number', description: 'turn by degrees around the vertical axis' },
    physics: { type: 'string', enum: PHYSICS },
    behavior,
    parts: { type: 'array', items: part, description: 'only when the shape itself must change' },
  },
  required: ['targetId'],
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    narration: { type: 'string', description: 'one short, warm sentence describing what you did' },
    spawn: { type: 'array', items: spawn },
    modify: { type: 'array', items: modify },
    remove: { type: 'array', items: { type: 'string' }, description: 'ids of objects to delete' },
    clear: { type: 'boolean', description: 'true to delete everything' },
    environment: {
      type: 'object',
      properties: { preset: { type: 'string', enum: PRESETS }, gravity: { type: 'string', enum: GRAVITY } },
    },
  },
  required: ['narration'],
}

// Turns a model response into the ordered action list the world understands.
export function toActions(plan) {
  if (Array.isArray(plan?.actions)) return plan.actions // offline builder shape
  const actions = []
  if (plan?.clear) actions.push({ type: 'clear' })
  for (const id of plan?.remove || []) actions.push({ type: 'delete', targetId: id })
  for (const m of plan?.modify || []) actions.push({ ...m, type: 'modify' })
  for (const s of plan?.spawn || []) actions.push({ ...s, type: 'spawn' })
  if (plan?.environment && (plan.environment.preset || plan.environment.gravity)) actions.push({ ...plan.environment, type: 'environment' })
  return actions
}
