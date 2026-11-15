import * as THREE from 'three'
import * as WebIFC from 'web-ifc'

// Reads a building (IFC / BIM) file into real meshes plus a complete element list:
// every wall, door, window, slab, roof, stair, room... with its storey, whether it is
// exterior or load-bearing, its material, size, and what it connects to.

const KIND = {
  IFCWALL: 'wall',
  IFCWALLSTANDARDCASE: 'wall',
  IFCCURTAINWALL: 'wall',
  IFCDOOR: 'door',
  IFCWINDOW: 'window',
  IFCSLAB: 'slab',
  IFCROOF: 'roof',
  IFCSTAIR: 'stair',
  IFCSTAIRFLIGHT: 'stair',
  IFCRAMP: 'stair',
  IFCRAILING: 'railing',
  IFCBEAM: 'beam',
  IFCCOLUMN: 'column',
  IFCMEMBER: 'member',
  IFCPLATE: 'panel',
  IFCCOVERING: 'ceiling',
  IFCFURNISHINGELEMENT: 'furniture',
  IFCFURNITURE: 'furniture',
  IFCSPACE: 'room',
  IFCBUILDINGELEMENTPROXY: 'other',
}
const TYPE_NAME = new Map(Object.keys(KIND).map((k) => [WebIFC[k], k]))
// Property sets that say whether an element is exterior or load-bearing.
const PSET_KINDS = new Set(['wall', 'door', 'window', 'slab', 'roof', 'beam', 'column', 'railing'])

let api = null
async function ifcApi() {
  if (api) return api
  api = new WebIFC.IfcAPI()
  // In the browser the wasm is served from /web-ifc/; under Node (tests) the package finds its own.
  if (typeof location !== 'undefined') api.SetWasmPath(`${location.origin}${import.meta.env.BASE_URL}web-ifc/`, true)
  await api.Init()
  return api
}

// "M_Single-Flush:1250mm x 2010mm:1250mm x 2010mm:146596" -> "Single-Flush 1250mm x 2010mm"
export function cleanName(raw) {
  const parts = String(raw || '')
    .split(':')
    .map((p) => p.replace(/^M_/, '').trim())
    .filter((p) => p && !/^\d+$/.test(p))
  const uniq = parts.filter((p, i) => p !== parts[i - 1])
  if (uniq.length <= 1) return uniq[0] || ''
  const generic = /^(basic wall|basic roof|floor|compound ceiling|stair|railing)$/i.test(uniq[0])
  return (generic ? uniq.slice(1) : uniq).join(' ').replace(/\s+/g, ' ')
}

const val = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v)
const ref = (v) => (v && typeof v === 'object' ? v.value : v)
const refs = (v) => (Array.isArray(v) ? v.map(ref) : v != null ? [ref(v)] : [])

function lines(a, model, typeConst) {
  const ids = a.GetLineIDsWithType(model, typeConst)
  const out = []
  for (let i = 0; i < ids.size(); i++) out.push(a.GetLine(model, ids.get(i)))
  return out
}

export async function loadIfc(buffer, name = 'building') {
  const a = await ifcApi()
  const model = a.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true })
  try {
    const root = new THREE.Group()
    root.name = name
    const byId = new Map()
    const geoCache = new Map()

    // Geometry: one group per element; meshes keep their own material so each
    // element can be recolored on its own.
    a.StreamAllMeshes(model, (mesh) => {
      const id = mesh.expressID
      const line = a.GetLine(model, id)
      const ifcType = TYPE_NAME.get(line.type)
      if (!ifcType && line.type === WebIFC.IFCOPENINGELEMENT) return
      let group = byId.get(id)
      if (!group) {
        group = new THREE.Group()
        group.userData.elementId = id
        byId.set(id, group)
        root.add(group)
      }
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const pg = mesh.geometries.get(g)
        let geometry = geoCache.get(pg.geometryExpressID)
        if (!geometry) {
          const geom = a.GetGeometry(model, pg.geometryExpressID)
          const v = a.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
          const idx = a.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
          const pos = new Float32Array(v.length / 2)
          const nor = new Float32Array(v.length / 2)
          for (let i = 0, j = 0; i < v.length; i += 6, j += 3) {
            pos[j] = v[i]
            pos[j + 1] = v[i + 1]
            pos[j + 2] = v[i + 2]
            nor[j] = v[i + 3]
            nor[j + 1] = v[i + 4]
            nor[j + 2] = v[i + 5]
          }
          geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
          geometry.setIndex(new THREE.BufferAttribute(idx, 1))
          geoCache.set(pg.geometryExpressID, geometry)
          geom.delete?.()
        }
        const c = pg.color
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(c.x, c.y, c.z),
          roughness: 0.75,
          metalness: 0,
          transparent: c.w < 0.99,
          opacity: c.w,
          side: THREE.DoubleSide,
          depthWrite: c.w >= 0.99,
        })
        const m = new THREE.Mesh(geometry, material)
        m.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation))
        m.castShadow = true
        m.receiveShadow = true
        group.add(m)
      }
    })

    // Relationships: storeys, door/window -> host wall, wall <-> wall joints.
    const storeyOf = new Map()
    const storeys = lines(a, model, WebIFC.IFCBUILDINGSTOREY).map((s) => ({ id: s.expressID, name: val(s.Name) || 'Storey', elevation: Number(val(s.Elevation)) || 0 }))
    const storeyName = new Map(storeys.map((s) => [s.id, s.name]))
    for (const r of lines(a, model, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const s = ref(r.RelatingStructure)
      if (storeyName.has(s)) for (const e of refs(r.RelatedElements)) storeyOf.set(e, storeyName.get(s))
    }
    const aggregates = lines(a, model, WebIFC.IFCRELAGGREGATES)
    for (let pass = 0; pass < 3; pass++)
      for (const r of aggregates) {
        const parent = ref(r.RelatingObject)
        const s = storeyName.get(parent) || storeyOf.get(parent)
        if (s) for (const e of refs(r.RelatedObjects)) if (!storeyOf.has(e)) storeyOf.set(e, s)
      }
    // A roof (or stair) is often only a container: its slabs / flights carry the geometry.
    const partOf = new Map()
    for (const r of aggregates) {
      const parent = a.GetLine(model, ref(r.RelatingObject))
      const pType = TYPE_NAME.get(parent?.type)
      if (pType === 'IFCROOF' || pType === 'IFCSTAIR' || pType === 'IFCRAMP')
        for (const e of refs(r.RelatedObjects)) partOf.set(e, { kind: KIND[pType], name: cleanName(val(parent.Name)) })
    }
    const wallOfOpening = new Map()
    for (const r of lines(a, model, WebIFC.IFCRELVOIDSELEMENT)) wallOfOpening.set(ref(r.RelatedOpeningElement), ref(r.RelatingBuildingElement))
    const hostOf = new Map()
    for (const r of lines(a, model, WebIFC.IFCRELFILLSELEMENT)) {
      const wall = wallOfOpening.get(ref(r.RelatingOpeningElement))
      if (wall) hostOf.set(ref(r.RelatedBuildingElement), wall)
    }
    const connects = new Map()
    for (const r of lines(a, model, WebIFC.IFCRELCONNECTSPATHELEMENTS)) {
      const x = ref(r.RelatingElement)
      const y = ref(r.RelatedElement)
      if (!connects.has(x)) connects.set(x, new Set())
      if (!connects.has(y)) connects.set(y, new Set())
      connects.get(x).add(y)
      connects.get(y).add(x)
    }

    // Center the building on the origin with its lowest point at y = 0.
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.set(-center.x, -box.min.y, -center.z)
    root.updateMatrixWorld(true)

    const elements = []
    for (const [id, group] of byId) {
      const line = a.GetLine(model, id)
      const ifcType = TYPE_NAME.get(line.type) || 'OTHER'
      const kind = partOf.get(id)?.kind || KIND[ifcType] || 'other'
      const b = new THREE.Box3().setFromObject(group)
      const size = b.getSize(new THREE.Vector3())
      const mid = b.getCenter(new THREE.Vector3())
      const raw = val(line.Name) || ''
      const el = {
        id,
        kind,
        ifcType,
        name: kind === 'room' ? val(line.LongName) || raw : cleanName(raw) || kind,
        code: kind === 'room' ? raw : undefined,
        raw,
        storey: storeyOf.get(id) || null,
        external: null,
        loadBearing: null,
        material: null,
        size: [size.x, size.y, size.z].map((n) => Math.round(n * 100) / 100),
        center: [mid.x, mid.y, mid.z].map((n) => Math.round(n * 100) / 100),
        hostId: hostOf.get(id) || null,
        hosts: [],
        connects: [...(connects.get(id) || [])].filter((x) => byId.has(x)),
      }
      if (PSET_KINDS.has(kind)) {
        try {
          for (const pset of await a.properties.getPropertySets(model, id, true)) {
            for (const p of pset.HasProperties || []) {
              const n = val(p.Name)
              if (n === 'IsExternal') el.external = Boolean(val(p.NominalValue))
              if (n === 'LoadBearing') el.loadBearing = Boolean(val(p.NominalValue))
            }
          }
          const mats = await a.properties.getMaterialsProperties(model, id, true)
          const names = []
          const collect = (o) => {
            if (!o || typeof o !== 'object') return
            if (o.Name && (o.type === WebIFC.IFCMATERIAL || o.Category !== undefined)) names.push(val(o.Name))
            for (const v of Object.values(o)) if (v && typeof v === 'object') collect(v)
          }
          collect(mats)
          if (names.length) el.material = [...new Set(names)].slice(0, 3).join(', ')
        } catch {
          /* properties are a bonus */
        }
      }
      if (kind === 'room') group.visible = false // rooms are volumes: data, not walls
      group.name = el.name
      elements.push(el)
    }
    for (const el of elements) if (el.hostId) elements.find((w) => w.id === el.hostId)?.hosts.push(el.id)

    // Rooms are spaces without their own mesh here: keep them as data (name, storey).
    for (const s of lines(a, model, WebIFC.IFCSPACE)) {
      if (byId.has(s.expressID)) continue
      const group = new THREE.Group()
      group.userData.elementId = s.expressID
      byId.set(s.expressID, group)
      elements.push({
        id: s.expressID,
        kind: 'room',
        ifcType: 'IFCSPACE',
        name: val(s.LongName) || val(s.Name) || 'Room',
        code: val(s.Name),
        raw: val(s.Name) || '',
        storey: storeyOf.get(s.expressID) || null,
        external: null,
        loadBearing: null,
        material: null,
        size: null,
        center: null,
        hostId: null,
        hosts: [],
        connects: [],
      })
    }

    return { kind: 'building', name, root, byId, elements, storeys }
  } finally {
    a.CloseModel(model)
  }
}
