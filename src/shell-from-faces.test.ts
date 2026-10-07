/**
 * shellFromFaces — upstream free-function `shell(*faces)` (BRepBuilderAPI_Sewing).
 *
 * These tests exist because reassessment §3.2 asked whether the already-bound
 * `sew` channel can carry the two `remove`-tagged sewing cases, and the answer
 * splits — the sewing is faithful, the STEP round trip for a floating face is
 * not. Global rule: verified negative API findings get frozen as tests, so the
 * numbers here are measurements, not expectations.
 *
 * Upstream ground truth (cadquery 2.8.0, `out/ref/…test_sewing__*.step`):
 *   sh   = box(1,1,1).remove(face ">Z")       -> f5/e12/v8
 *   res3 = shell(sh.faces(), ftop, ftop.moved(x=1), manifold=True)
 *                                             -> f7/e16/v12, a Compound
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { getKernel } from '@faicad/faijs'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import type { ShapeHandle } from 'occt-wasm'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

function counts(shape: unknown): { faces: number; edges: number; vertices: number } {
  const h = brepOf(shape as never) as BrepHandle
  const api = getBrepApi() as unknown as {
    getSubShapes: (s: BrepHandle, kind: string) => BrepHandle[]
  }
  return {
    faces: (api.getSubShapes(h, 'face') as unknown[]).length,
    edges: (api.getSubShapes(h, 'edge') as unknown[]).length,
    vertices: (api.getSubShapes(h, 'vertex') as unknown[]).length,
  }
}

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`runtime warmup failed: ${JSON.stringify(warm.failedAt)}`)
})

describe('shellFromFaces (upstream `shell(*faces)` sewing overload)', () => {
  it('sews the five box faces into an open shell: f5/e12/v8 == upstream `sh`', async () => {
    const b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const fx0 = await cq.faces(b, '<X')
    const fx1 = await cq.faces(b, '>X')
    const fy0 = await cq.faces(b, '<Y')
    const fy1 = await cq.faces(b, '>Y')
    const fz0 = await cq.faces(b, '<Z')
    const sh = await cq.shellFromFaces(cq.Workplane(), [fx0, fx1, fy0, fy1, fz0])
    expect(counts(sh.objects[0])).toEqual({ faces: 5, edges: 12, vertices: 8 })
  })

  it('keeps every input face distinct when nothing is floating', async () => {
    // Three mutually adjacent faces: the shared edges merge, the faces do not.
    const b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const fz0 = await cq.faces(b, '<Z')
    const fx0 = await cq.faces(b, '<X')
    const fy0 = await cq.faces(b, '<Y')
    const res = await cq.shellFromFaces(cq.Workplane(), [fz0, fx0, fy0])
    expect(counts(res.objects[0]).faces).toBe(3)
  })

  it('res3 in MEMORY already matches upstream f7/e16/v12 (shell + floating cap)', async () => {
    // `kernel.sew` is faithful here — the two areas where the case still fails
    // are downstream of this op (see the next test).
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
    expect(counts(res.objects[0])).toEqual({ faces: 7, edges: 16, vertices: 12 })
  })

  it('no bound kernel call can wrap a lone face into a shell', async () => {
    // Why `res3` still cannot be mirrored: the floating face stays a bare face
    // child of the compound, and this repo's STEP writer emits only the shell
    // part (both child orders measured: 7 faces in memory, 6 written).
    // Upstream wraps leftovers with TopoDS_Builder.MakeShell + Add.
    const k = getKernel() as unknown as {
      getSubShapes: (s: ShapeHandle, kind: string) => ShapeHandle[]
      getShapeType: (s: ShapeHandle) => string
      sew: (shapes: ShapeHandle[], tol?: number) => ShapeHandle
      buildSolidFromFaces: (faces: ShapeHandle[], tol?: number) => ShapeHandle
      makeSolid: (s: ShapeHandle) => ShapeHandle
    }
    const box = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const face = k.getSubShapes(brepOf(box.objects[0] as never) as never, 'face')[0]!
    // Neither wrapper introduces a shell node, so both leave the face as-is.
    for (const wrapped of [k.sew([face], 1e-6), k.buildSolidFromFaces([face], 1e-3)]) {
      expect(k.getSubShapes(wrapped, 'shell').length).toBe(0)
      expect(k.getSubShapes(wrapped, 'face').length).toBe(1)
      expect(k.getShapeType(wrapped)).toBe('face')
    }
    expect(() => k.makeSolid(face)).toThrow()
  })
})
