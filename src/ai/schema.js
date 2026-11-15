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
// "at" (not "position") because some servers emit keys alphabetically, and the live
// builder needs the location before the parts start streaming in.
const spawn = {
  type: 'object',
  properties: {
    at: { ...vec3, description: 'where the object base sits, [x, y, z]' },
    name: { type: 'string', description: 'short noun, e.g. "castle"' },
    physics: { type: 'string', enum: PHYSICS },
    behavior,
    parts: { type: 'array', items: part, minItems: 1, maxItems: 24, description: '1-24 primitives composing the object' },
  },
  required: ['at', 'name', 'parts'],
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
    parts: { type: 'array', items: part, description: 'replace ALL parts; only for a total redesign' },
    addParts: { type: 'array', items: part, description: 'new parts to add to the object, in its local frame' },
    editParts: {
      type: 'array',
      description: 'change existing parts by index',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          color: { type: 'string' },
          material: { type: 'string', enum: MATERIALS },
          position: vec3,
          rotation: vec3,
          shape: { type: 'string', enum: SHAPES },
          size: vec3,
        },
        required: ['index'],
      },
    },
    removeParts: { type: 'array', items: { type: 'integer' }, description: 'indices of parts to delete' },
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

// Conversation edits (top-level add / change / remove / scale) aimed at the focus model.
export function focusEdit(plan, focusId) {
  if (!focusId || !plan) return null
  const has = Array.isArray(plan.add) || Array.isArray(plan.change) || Array.isArray(plan.paint) || plan.scale
  const removeParts = Array.isArray(plan.remove) && plan.remove.every((v) => Number.isInteger(Number(v)) && typeof v !== 'string') ? plan.remove : null
  if (!has && !removeParts) return null
  // paint entries become color edits on each listed part
  const painted = (Array.isArray(plan.paint) ? plan.paint : []).flatMap((p) =>
    (Array.isArray(p?.indices) ? p.indices : []).map((index) => ({ index, color: p.color })),
  )
  const editParts = [...(Array.isArray(plan.change) ? plan.change : []), ...painted]
  return { type: 'modify', targetId: focusId, addParts: plan.add, editParts, removeParts, scale: plan.scale }
}

// Turns a model response into the ordered action list the world understands.
export function toActions(plan, focusId) {
  if (Array.isArray(plan?.actions)) return plan.actions // offline builder shape
  const actions = []
  const edit = focusEdit(plan, focusId)
  if (edit) actions.push(edit)
  if (plan?.clear) actions.push({ type: 'clear' })
  if (!edit) for (const id of plan?.remove || []) actions.push({ type: 'delete', targetId: id })
  for (const m of plan?.modify || []) actions.push({ ...m, type: 'modify' })
  for (const s of plan?.spawn || []) actions.push({ ...s, position: s.at ?? s.position, type: 'spawn' })
  if (plan?.environment && (plan.environment.preset || plan.environment.gravity)) actions.push({ ...plan.environment, type: 'environment' })
  return actions
}

// Conversation mode: edits to the focus model. Keys sort so "add" streams first.
export const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    // Sorts first, so the model plans the whole edit before writing it.
    about: { type: 'string', description: 'plan first: which part indices change and how, and what is added' },
    add: { type: 'array', items: part, description: 'new parts for the focus model, in its frame' },
    change: {
      type: 'array',
      description: 'existing parts to change, by index; only the fields that change',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          color: { type: 'string' },
          material: { type: 'string', enum: MATERIALS },
          position: vec3,
          rotation: vec3,
          shape: { type: 'string', enum: SHAPES },
          size: vec3,
        },
        required: ['index'],
      },
    },
    narration: { type: 'string', description: 'one short warm sentence saying what changed' },
    paint: {
      type: 'array',
      description: 'recolor existing parts: every color change goes here',
      items: {
        type: 'object',
        properties: { color: { type: 'string', description: '#RRGGBB' }, indices: { type: 'array', items: { type: 'integer' } } },
        required: ['color', 'indices'],
      },
    },
    remove: { type: 'array', items: { type: 'integer' }, description: 'indices of parts to delete' },
    scale: { type: 'number', description: 'resize the whole model, 2 = twice as big' },
    spawn: { type: 'array', items: spawn, description: 'only for a separate new object' },
  },
  required: ['about', 'narration'],
}
