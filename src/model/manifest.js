// What the chatbot knows about the open model: storeys, counts, and every element
// with its facts (id, kind, storey, name, exterior, material, size, host wall).

const r1 = (n) => Math.round(n * 10) / 10

export function counts(elements) {
  const by = {}
  for (const e of elements) if (!e.deleted) by[e.kind] = (by[e.kind] || 0) + 1
  return by
}

export function describeModel(model) {
  const live = model.elements.filter((e) => !e.deleted)
  const c = counts(live)
  const ext = live.filter((e) => e.kind === 'wall' && e.external).length
  const storeys = [...(model.storeys || [])].sort((a, b) => a.elevation - b.elevation)
  const lines = [
    `MODEL: "${model.name}" (${model.kind}).`,
    storeys.length ? `STOREYS (bottom to top): ${storeys.map((s) => `${s.name} @ ${r1(s.elevation)} m`).join(', ')}` : '',
    `COUNTS: ${Object.entries(c).map(([k, n]) => `${k} ${n}${k === 'wall' && ext ? ` (${ext} exterior)` : ''}`).join(', ')}`,
    'Front / south = +z, right / east = +x.',
    'ELEMENTS (id | kind | storey | name | exterior? | material | size w×h×d m | in wall #):',
    ...live.map((e) =>
      [
        e.id,
        e.kind,
        e.storey || '-',
        e.name,
        e.external === true ? 'exterior' : e.external === false ? 'interior' : '-',
        e.material || '-',
        e.size ? e.size.map(r1).join('×') : '-',
        e.hostId ? `#${e.hostId}` : '-',
      ].join(' | '),
    ),
  ]
  return lines.filter(Boolean).join('\n')
}
