// One part as one line: "shape w h d x y z rx ry rz #RRGGBB material".
// About a third of the tokens of a JSON object, so models stream in much faster.
const SHAPE = '(box|sphere|cylinder|cone|pyramid|dome|torus|capsule|icosahedron)'
const NUM = '(-?\\d*\\.?\\d+)'
const LINE = new RegExp(`^${SHAPE}\\s+${Array(9).fill(NUM).join('\\s+')}\\s+(\\S+)\\s+([a-z]+)$`, 'i')

export function parsePartLine(text) {
  const m = String(text || '').trim().match(LINE)
  if (!m) return null
  const n = m.slice(2, 11).map(Number)
  return {
    shape: m[1].toLowerCase(),
    size: n.slice(0, 3),
    position: n.slice(3, 6),
    rotation: n.slice(6, 9), // degrees, like the JSON form
    color: m[11],
    material: m[12].toLowerCase(),
  }
}

const r2 = (v) => Math.round(v * 100) / 100
const deg = (r) => Math.round((r * 180) / Math.PI)

// Stored parts (rotation in radians) back to a line, for showing the model to the AI.
export function toPartLine(p) {
  return [p.shape, ...p.size.map(r2), ...p.position.map(r2), ...p.rotation.map(deg), p.color, p.material].join(' ')
}

// "3 cone 1 0.8 1 ..." (a full replacement for part 3) -> { index, ...part }
export function parseIndexedLine(text) {
  const m = String(text || '').trim().match(/^(\d+)\s*[:.)-]?\s+(.*)$/)
  if (!m) return null
  const part = parsePartLine(m[2])
  return part ? { index: Number(m[1]), ...part } : null
}
