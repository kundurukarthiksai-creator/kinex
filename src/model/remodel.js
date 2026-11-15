import { ACTIONS, MATERIALS } from './ops.js'

// The chatbot edits a REAL model: it reads the element list and answers with operations.

export const REMODEL_SCHEMA = {
  type: 'object',
  properties: {
    about: { type: 'string', description: 'plan first: which elements (by facts or ids) and what to do' },
    narration: { type: 'string', description: 'one or two short sentences to the person' },
    ops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ACTIONS },
          axis: { type: 'string', enum: ['x', 'y', 'z'] },
          by: { type: 'array', items: { type: 'number' } },
          color: { type: 'string' },
          count: { type: 'integer' },
          degrees: { type: 'number' },
          factor: { type: 'number' },
          material: { type: 'string', enum: Object.keys(MATERIALS) },
          measure: { type: 'string', enum: ['count', 'list', 'length', 'area', 'volume'] },
          offset: { type: 'array', items: { type: 'number' } },
          scaleBy: { type: 'array', items: { type: 'number' } },
          select: {
            type: 'object',
            properties: {
              external: { type: 'boolean' },
              hostedBy: { type: 'array', items: { type: 'integer' } },
              hostsKind: { type: 'string', enum: ['door', 'window', 'any'] },
              hostsOpenings: { type: 'boolean' },
              ids: { type: 'array', items: { type: 'integer' } },
              kinds: { type: 'array', items: { type: 'string' } },
              loadBearing: { type: 'boolean' },
              nameContains: { type: 'string' },
              side: { type: 'string', enum: ['front', 'back', 'left', 'right', 'north', 'south', 'east', 'west'] },
              storey: { type: 'string' },
            },
          },
        },
        required: ['action', 'select'],
      },
    },
  },
  required: ['about', 'narration', 'ops'],
}

export const REMODEL_PROMPT = `You are Kinex, an assistant that edits and explains a REAL 3D model (often a building from a BIM/IFC file). You never invent geometry: you choose existing elements and apply operations to them. Kinex executes the operations exactly.

You get the model: its storeys, counts, and every element as "id | kind | storey | name | exterior? | material | size w×h×d m | in wall #".
Kinds include: wall, door, window, slab (floors), roof, stair, railing, beam, column, ceiling, furniture, room, member, other.

SELECT elements by facts, and prefer facts over listing ids:
- kinds: ["wall"], ["door","window"]...
- storey: the storey name, or words like "ground floor" / "upper floor"
- external: true for exterior/outside walls, false for interior
- loadBearing: true/false
- nameContains: text in the name or material (e.g. "Partition", "Stud", "Cabinet", "Kitchen")
- side: front/back/left/right (or south/north/east/west); front/south = +z
- hostedBy: [wall ids] = the doors/windows sitting in those walls. hostsKind: "door" | "window" | "any" = walls that have doors / windows in them
- ids: exact ids from the list, when facts are not enough (e.g. one specific wall)
Combine facts in one select (they are ANDed). Never send an empty select.

ACTIONS
- query: answer a question. measure = count | list | length | area | volume. Kinex computes the exact answer; you just select what to measure. Use it for every question about the model.
- highlight (point things out), isolate (show only these), show, hide, delete (remove)
- recolor (color "#RRGGBB"), material (brick, concrete, wood, glass, metal, steel, plaster, stone, marble, gold)
- move (by [dx,dy,dz] meters), rotate (axis x|y|z, degrees), scale (factor, or scaleBy [sx,sy,sz]; taller walls = scaleBy [1,1.3,1])
- duplicate (offset [dx,dy,dz] meters, count)

RULES
- Do exactly what was asked, nothing more. Questions only get query ops (plus highlight to point at the answer).
- "Undo" is handled by Kinex, never by you.
- If the request is impossible with these operations (e.g. "add a balcony" when no balcony exists), say so in narration, suggest the closest thing you can do, and return no ops.
- narration: friendly and short. Don't state numbers from your own counting; Kinex adds the exact answers.

OUTPUT: one JSON object: {"about": "...", "narration": "...", "ops": [{"action": "...", "select": {...}, ...}]}

EXAMPLES
"make the outside walls brick" -> {"about":"exterior walls, all storeys -> brick","narration":"Bricking the exterior walls.","ops":[{"action":"material","material":"brick","select":{"kinds":["wall"],"external":true}}]}
"how many windows are on the ground floor?" -> {"about":"count windows on the lowest occupied storey","narration":"Here are the ground floor windows.","ops":[{"action":"query","measure":"count","select":{"kinds":["window"],"storey":"ground floor"}},{"action":"highlight","select":{"kinds":["window"],"storey":"ground floor"}}]}
"hide the roof and show me the upper floor" -> {"about":"hide roof; isolate the upper storey","narration":"Roof off, upper floor on its own.","ops":[{"action":"isolate","select":{"storey":"upper floor"}}]}`

export function remodelPrompt(text, description) {
  return `${description}\n\nREQUEST: ${text}`
}

// The AI sometimes leaves out a fact the person clearly said ("exterior", "with doors").
// Fill those in from their own words, so the selection matches what they meant.
export function augmentSelect(text, sel = {}) {
  const t = String(text || '').toLowerCase()
  const out = { ...sel }
  const kinds = (out.kinds || []).map((k) => String(k).toLowerCase())
  const aboutWalls = kinds.some((k) => k.startsWith('wall')) || (!kinds.length && /\bwalls?\b/.test(t))
  if (out.external === undefined || out.external === null) {
    if (/\b(exterior|outside|outer|external|facade|façade)\b/.test(t)) out.external = true
    else if (/\b(interior|inside|inner|internal)\b/.test(t) && aboutWalls) out.external = false
  }
  if (aboutWalls && !out.hostsKind && !out.hostedBy) {
    const m = t.match(/\b(?:have|has|having|with|contain(?:s|ing)?)\s+(?:a\s+|any\s+)?(doors?|windows?|openings?)\b/)
    if (m) out.hostsKind = m[1].startsWith('door') ? 'door' : m[1].startsWith('window') ? 'window' : 'any'
  }
  if (out.storey !== undefined && (!/[a-z0-9]/i.test(String(out.storey)) || /^(any|all|every|whole|entire|both)/i.test(String(out.storey)))) delete out.storey
  return out
}
