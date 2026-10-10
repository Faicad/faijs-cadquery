/**
 * free-face-compound-export.test.ts — in-band regression guard for N2-4
 * (`export:free-face-in-compound`).
 *
 * Closes the gap the host CLI could not: a face that stays a bare
 * TopoDS_Face child of a compound (e.g. test_sewing__res3's floating cap
 * ftop.moved(x=1)) is dropped by the host CLI's STEP writer — 7 faces in
 * memory, 6 written. The self-hosted XCAF exporter (tests/export-cand-step.mjs,
 * raw occt-wasm addShape) preserves every face. This test exercises that exact
 * export path so a regression there is caught by `npm test` rather than only by
 * the out-of-band parity sweep.
 *
 * The in-memory sewing fidelity (f7/e16/v12) is already guarded by
 * src/shell-from-faces.test.ts; this test guards the EXPORT step only.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { registerOcctBrepEngine, createApiNamespace } from '@faicad/faijs'
import { createRuntime, createNodePorts } from '@faicad/faijs/node'
import { brepOf } from '@faicad/faijs/shape'
import { initOcctWasm } from '@faicad/faijs/occt-kernel/occtKernel'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  // Mirror the proven warmup from export-cand-step.mjs: registering the default
  // 'cad' lib and executing a no-op box establishes the brep engine context
  // that the directly-invoked cq.* functions need (getBrepApi availability).
  runtime.registerLib('cad', createApiNamespace(), { default: true, packageName: '@faicad/faijs' })
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`runtime warmup failed: ${JSON.stringify(warm.failedAt)}`)
})

describe('N2-4: self-hosted XCAF exporter preserves a floating compound face', () => {
  it('test_sewing__res3 exports all 7 faces via raw XCAF addShape', async () => {
    const b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const fx0 = await cq.faces(b, '<X')
    const fx1 = await cq.faces(b, '>X')
    const fy0 = await cq.faces(b, '<Y')
    const fy1 = await cq.faces(b, '>Y')
    const fz0 = await cq.faces(b, '<Z')
    const ftop = await cq.faces(b, '>Z')
    const ftopMoved = await cq.translate(ftop, [1, 0, 0])
    const res = await cq.shellFromFaces(cq.Workplane(), [
      fx0, fx1, fy0, fy1, fz0, ftop, ftopMoved,
    ])
    const handle = brepOf(res.objects[0] as never)
    const raw = (await initOcctWasm()) as unknown as {
      createXCAFDocument(): {
        addShape(shape: unknown, opts?: unknown): void
        exportSTEP(): string
        close(): void
      }
    }
    const doc = raw.createXCAFDocument()
    try {
      doc.addShape(handle, { name: 'res3' })
      const step = doc.exportSTEP()
      const faceCount = (step.match(/ADVANCED_FACE/g) || []).length
      expect(faceCount).toBe(7)
    } finally {
      doc.close()
    }
  })
})
