/**
 * BREP import/export channels (occt-wasm 5.6 unblock, T2).
 *
 * Upstream `Shape.exportBin/importBin` (`test_bin_import_export`) and
 * `Shape.exportBrep/importBrep` are the only CadQuery entry points that touch
 * the OCCT BREP serializer directly. occt-wasm 5.6 binds all four
 * (`dist/index.d.ts:390-395`), so the channel is wired here and frozen by test.
 *
 * Ground truth (cadquery 2.8.0, `C:\Users\ylt\cadquery-env`):
 *   box(1,1,1)                -> vol 1, 6 faces
 *   box(2,2,2).shell(-0.1)    -> vol 2.168, 12 faces (hollow, no faces removed)
 * Both must survive a BREP round trip unchanged — that is the whole point of
 * the upstream test (`assert r.Volume() == approx(1)`).
 *
 * DEVIATION: upstream writes/reads a file-like object; the .fai.js mirror plane
 * has no file IO, so the ops hand over the serialized bytes/string in memory.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import { asPartName } from '@faicad/faijs/identity'
import type { Shape } from '@faicad/faijs/mesh/types'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

function metrics(shape: Shape): { vol: number; faces: number; vertices: number } {
  const h = brepOf(shape) as BrepHandle
  return {
    vol: getBrepApi().getVolume(h),
    faces: (getBrepApi().getSubShapes(h, 'face') as unknown[]).length,
    vertices: (getBrepApi().getSubShapes(h, 'vertex') as unknown[]).length,
  }
}

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`runtime warmup failed: ${JSON.stringify(warm.failedAt)}`)
})

describe('BREP binary round trip (exportBin / importBin)', () => {
  it('box(1,1,1) survives the round trip: vol 1, 6 faces', async () => {
    const box = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const bytes = await cq.exportBin(box)
    expect(bytes.length).toBeGreaterThan(0)
    const back = await cq.importBin(bytes)
    const m = metrics(cq.val(back)!)
    expect(m.vol).toBeCloseTo(1, 9)
    expect(m.faces).toBe(6)
  })

  it('a hollowed box keeps its 12 faces (topology is not flattened)', async () => {
    const box = await cq.box(cq.Workplane(), 2, 2, 2)
    const hollowed = await cq.shell(box, -0.1)
    const before = metrics(cq.val(hollowed)!)
    expect(before.faces).toBe(12)
    const back = await cq.importBin(await cq.exportBin(hollowed))
    const after = metrics(cq.val(back)!)
    expect(after.faces).toBe(12)
    expect(after.vol).toBeCloseTo(before.vol, 9)
  })

  it('empty input raises (upstream: `raises(Exception)`)', async () => {
    await expect(cq.importBin(new Uint8Array(0))).rejects.toThrow()
  })
})

describe('BREP text round trip (exportBrep / importBrep)', () => {
  it('box(1,1,1) survives the round trip: vol 1, 6 faces', async () => {
    const box = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const text = await cq.exportBrep(box)
    expect(text.length).toBeGreaterThan(0)
    const back = await cq.importBrep(text)
    const m = metrics(cq.val(back)!)
    expect(m.vol).toBeCloseTo(1, 9)
    expect(m.faces).toBe(6)
  })

  it('non-BREP text raises', async () => {
    await expect(cq.importBrep('not a brep file')).rejects.toThrow()
  })
})

describe('BREP round trip through the .fai.js mirror plane', () => {
  it('bytes cross the DSL boundary (the test_bin_import_export__r path)', async () => {
    const code = [
      "import * as cq from '@faicad/faijs-cadquery'",
      'let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })',
      'let bytes = await cq.exportBin(b)',
      'let wp_out = await cq.importBin(bytes)',
      'let result = cq.val(wp_out)',
    ].join('\n')
    const res = await runtime.execute(code)
    expect(res.failedAt).toBeUndefined()
    const shape = res.outputs.get(asPartName('result')) as Shape | undefined
    expect(shape).toBeDefined()
    const m = metrics(shape!)
    expect(m.vol).toBeCloseTo(1, 9)
    expect(m.faces).toBe(6)
  })
})
