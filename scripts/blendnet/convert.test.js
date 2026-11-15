import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Runs the converter on hand-written Blender scripts and returns the parts per row
// (null when the row was skipped).
function convert(scripts) {
  const dir = mkdtempSync(join(tmpdir(), 'kinex-bn-'))
  const src = join(dir, 'in.jsonl')
  const out = join(dir, 'out.jsonl')
  writeFileSync(src, scripts.map((script, i) => JSON.stringify({ id: String(i), name: `t${i}`, instruction: `test ${i}`, script })).join('\n'))
  const r = spawnSync('python', ['-I', 'scripts/blendnet/convert.py', src, out], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  const rows = Object.fromEntries(
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .map((row) => [row.id.replace('bn-', ''), row.lines.map((x) => x.split(' '))]),
  )
  return scripts.map((_, i) => rows[String(i)] || null)
}

const HEAD = 'import bpy\nimport math\n'

describe('BlendNet converter', () => {
  const [box, cyl, loop, evil1, evil2, scene] = convert([
    HEAD +
      `m = bpy.data.materials.new(name="Blue")\nm.diffuse_color = (0.2, 0.4, 0.6, 1)\n` +
      `bpy.ops.mesh.primitive_cube_add(size=2, location=(1, 2, 3))\no = bpy.context.object\no.scale = (0.5, 1, 2)\no.data.materials.append(m)\n` +
      `bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(0, 0, 0))\n`,
    HEAD + `bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=2, location=(0, 0, 0), rotation=(math.pi/2, 0, 0))\nbpy.ops.mesh.primitive_cube_add(size=1)\n`,
    HEAD + `for i in range(4):\n    a = i * math.pi / 2\n    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=1, location=(math.cos(a), math.sin(a), 0.5))\n`,
    HEAD + `__import__('os').system('echo hacked')\nbpy.ops.mesh.primitive_cube_add()\nbpy.ops.mesh.primitive_cube_add()\n`,
    HEAD + `f = open('x.txt', 'w')\nbpy.ops.mesh.primitive_cube_add()\nbpy.ops.mesh.primitive_cube_add()\n`,
    HEAD + `bpy.ops.mesh.primitive_cube_add()\nbpy.ops.mesh.primitive_cube_add(location=(2,0,0))\nfor obj in bpy.context.scene.objects:\n    obj.scale = (2, 2, 2)\n`,
  ])

  it('maps size, position (Z-up to Y-up) and color', () => {
    const [shape, w, h, d, x, y, z, , , , color, mat] = box[0]
    expect(shape).toBe('box')
    expect([w, h, d].map(Number)).toEqual([1, 4, 2])
    expect([x, y, z].map(Number)).toEqual([1, 3, -2])
    expect(color).toBe('#336699')
    expect(mat).toBe('plastic')
  })
  it('turns rotated cylinders the right way', () => {
    const [shape, , , , , , , rx, ry, rz] = cyl[0]
    expect(shape).toBe('cylinder')
    expect([rx, ry, rz].map(Number)).toEqual([90, 0, 0])
  })
  it('runs loops', () => {
    expect(loop).toHaveLength(4)
  })
  it('never runs code: imports and file access skip the row', () => {
    expect(evil1).toBeNull()
    expect(evil2).toBeNull()
  })
  it('iterates the scene objects without hanging', () => {
    expect(scene).toHaveLength(2)
    expect(Number(scene[0][1])).toBe(4)
  })
})
