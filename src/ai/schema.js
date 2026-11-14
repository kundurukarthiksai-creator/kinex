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

const action = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['spawn', 'modify', 'delete', 'clear', 'environment'] },
    name: { type: 'string', description: 'spawn: short noun, e.g. "castle"' },
    targetId: { type: 'string', description: 'modify/delete: id of an existing object' },
    position: { ...vec3, description: 'spawn/modify: where the object base sits, [x, y, z]' },
    parts: { type: 'array', items: part, description: 'spawn, or modify to rebuild: 1-24 primitives' },
    physics: { type: 'string', enum: PHYSICS },
    behavior,
    scale: { type: 'number', description: 'modify: multiplier on current size, 2 = twice as big' },
    color: { type: 'string', description: 'modify: recolor the main color of the object' },
    rotateY: { type: 'number', description: 'modify: turn by degrees around vertical axis' },
    preset: { type: 'string', enum: PRESETS },
    gravity: { type: 'string', enum: GRAVITY },
  },
  required: ['type'],
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    narration: { type: 'string', description: 'one short, playful sentence describing what you did' },
    actions: { type: 'array', items: action },
  },
  required: ['narration', 'actions'],
}
