import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLibrary } from './library.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kinex-lib-'))
  mkdirSync(join(root, 'library'))
  const rows = [
    { id: 'a', name: 'Lamp', text: 'Design a desk lamp with a round base', lines: ['cylinder 0.4 0.05 0.4 0 0.03 0 0 0 0 #333333 metal'] },
    { id: 'b', name: 'Chair', text: 'Create a wooden chair with four legs', lines: ['box 1 0.1 1 0 0.5 0 0 0 0 #8A5A3B wood'] },
    { id: 'c', name: 'Lamp 2', text: 'A floor lamp with a tall pole', lines: ['cylinder 0.05 2 0.05 0 1 0 0 0 0 #333333 metal'] },
  ]
  writeFileSync(join(root, 'library', 'blendnet.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'))
  return root
}

describe('model library (keyword search, no Ollama needed)', () => {
  it('finds the closest models', async () => {
    const lib = createLibrary(fixture())
    const r = await lib.search('a desk lamp', 2)
    expect(r[0].id).toBe('a')
    expect(r.map((x) => x.id)).not.toContain('b')
  })
  it('saves liked models and lets votes reorder results', async () => {
    const root = fixture()
    const lib = createLibrary(root)
    const { id } = await lib.save({ text: 'a desk lamp with a brass arm', name: 'brass lamp', lines: ['cylinder 0.3 0.05 0.3 0 0 0 0 0 0 #B08D57 metal'] })
    expect(existsSync(join(root, 'library', 'user.jsonl'))).toBe(true)
    expect(readFileSync(join(root, 'library', 'user.jsonl'), 'utf8')).toContain('brass arm')
    const top = await lib.search('desk lamp', 3)
    expect(top.map((x) => x.id)).toContain(id)
    lib.vote('c', 1)
    lib.vote('c', 1)
    lib.vote('a', -1)
    const after = await lib.search('lamp', 3)
    expect(after.findIndex((x) => x.id === 'c')).toBeLessThan(after.findIndex((x) => x.id === 'a'))
    expect(lib.info().liked).toBe(1)
  })
})
