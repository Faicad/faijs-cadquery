/**
 * parametricSurface — CadQuery `Workplane.parametricSurface` parity.
 * Mirrors tests.test_cadquery::TestCadQuery::testParametricSurface
 * (r1 = valid surface face; r2 = box.split(surface) needs split-by-face which is
 * not yet in this repo — kept blocked, see manifest entry + occt56 plan §3.3).
 *
 * Upstream ground truth (cadquery 2.8.0):
 *   r1 = parametricSurface(lambda u,v:(u,v,cos(pi*u)*cos(pi*v)), start=-1, stop=1)
 *        -> r1.faces().val().isValid()  is True
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { brepOf } from '@faicad/faijs/shape'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

function isValid(shape: unknown): boolean {
  return (getKernel() as unknown as { isValid: (h: never) => boolean }).isValid(brepOf(shape as never) as never)
}

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`runtime warmup failed: ${JSON.stringify(warm.failedAt)}`)
})

describe('cq-compat parametricSurface', () => {
  it('r1: cos(pi*u)*cos(pi*v) saddle over [-1,1] -> a valid surface face', async () => {
    const wp = cq.Workplane('XY')
    const surf = await cq.parametricSurface(
      wp,
      (u, v) => [u, v, Math.cos(Math.PI * u) * Math.cos(Math.PI * v)],
      { start: -1, stop: 1 },
    )
    const face = surf.objects[0]
    expect(isValid(face)).toBe(true)
    // The surface is a single Face.
    const api = getBrepApi() as unknown as { getSubShapes: (s: BrepHandle, kind: string) => BrepHandle[] }
    expect((api.getSubShapes(brepOf(face as never) as BrepHandle, 'face') as unknown[]).length).toBe(1)
  })
})
