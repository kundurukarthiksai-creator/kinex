import { normalizeCommand } from '../ai/local.js'

export const MODEL_CATALOG = [
  { id: 'ship', name: 'Cruise ship', file: 'CruiseShip.glb', size:4.8, color:'#D9E0E2', aliases:['cruise ship','passenger ship','ocean liner','ferry','ship','boat'], subject:'Marine design', description:'A curved hull, layered decks, windows, railings and lifeboats.', author:'Kinex', license:'Original procedural model', kind:'procedural', colorParts:['hull','decks','windows','rails','trim','lifeboats','funnel','vents'], source:'https://github.com/shivareddy8693/kinex/blob/studio-ui/scripts/models/build-ship.mjs' },
  { id: 'avocado', name: 'Avocado', file: 'Avocado.glb', color: '#729448', aliases: ['avocado'], subject: 'Natural forms', description: 'Explore a textured fruit, its flesh and seed.', author: 'Microsoft', license: 'CC0-1.0', source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Avocado' },
  { id: 'bottle', name: 'Water bottle', file: 'WaterBottle.glb', color: '#79A4C2', aliases: ['water bottle', 'metal bottle', 'bottle'], subject: 'Materials & design', description: 'Inspect surface finish, shape and reflections.', author: 'Microsoft', license: 'CC0-1.0', source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/WaterBottle' },
  { id: 'speaker', name: 'Stereo speaker', file: 'BoomBox.glb', color: '#3F454B', aliases: ['boom box', 'boombox', 'stereo speaker', 'speaker', 'stereo', 'radio'], subject: 'Product design', description: 'Compare a detailed enclosure and its surfaces.', author: 'Microsoft', license: 'CC0-1.0', source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BoomBox' },
]

export const modelURL = (asset) => `${import.meta.env?.BASE_URL || '/'}models/${asset.file}`

export function matchLibraryRequest(raw) {
  let text = normalizeCommand(raw)
  text = text.replace(/^please\s+/, '').replace(/^(?:create|spawn|add|build|generate|load|show|make|give)(?:\s+me)?\s+/, '')
  text = text.replace(/^(?:(?:a|an|the|realistic|detailed|textured|lifelike|colorful|multicolored|multicoloured|multi-color|multi-colour|3d|red|blue|green|yellow|orange|purple|white|black|silver|golden|small|large|big|tiny)\s+)*/, '')
  for (const asset of MODEL_CATALOG) {
    for (const alias of asset.aliases) {
      if (text === alias || text === `${alias} model` || text.startsWith(`${alias} in `) || text.startsWith(`${alias} on `) || text.startsWith(`${alias} with `)) return asset
    }
  }
  return null
}
