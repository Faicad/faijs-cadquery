/**
 * parametricCurve — CadQuery `Workplane.parametricCurve` parity.
 * Mirrors tests.test_cadquery::TestCadQuery::testParametricCurve
 * (res_open / res_closed / makeWire=false edge path).
 *
 * Upstream ground truth (cadquery 2.8.0):
 *   func(t) = (r*(k+1)*cos t - r*cos((k+1)t), r*(k+1)*sin t - r*sin((k+1)t))
 *             with k=4, r=1  -> a closed 5-lobed (rose) curve at full period
 *   res_open   = parametricCurve(func)                 -> extrude -> INVALID solid
 *   res_closed = parametricCurve(func, 0..2pi)         -> extrude -> valid, 3 faces
 *   makeWire=F -> pendingEdges==1, pendingWires==0
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { brepOf } from '@faicad/faijs/shape'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import * as cq from './index'

/** faijs `Shape` (mesh wrapper) validity — mirrors CadQuery `Shape.isValid()`.
 *  `cq.isValidShape` now resolves all three representations (raw handle /
 *  CqShape / faijs `Shape`) through `brepH`, so a DSL `Shape` can be passed
 *  directly. The earlier footgun was routing a `Shape` through `unwrapShape`
 *  (which only knows CqShape/raw handle) → the whole object became handle id 0
 *  → "Invalid shape ID: 0". See `src/shape-class.ts` `isValidShape` / `brepH`. */
function isValid(solid: unknown): boolean {
  return cq.isValidShape(solid as never)
}

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
  // Warm up the BREP kernel (handle-bridge) so direct cq.* calls below can use
  // getKernel()/toShape — a runtime.execute is required to trigger init.
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`runtime warmup failed: ${JSON.stringify(warm.failedAt)}`)
})

describe('cq-compat parametricCurve', () => {
  const k = 4
  const r = 1
  const func = (t: number): [number, number] => [
    r * (k + 1) * Math.cos(t) - r * Math.cos((k + 1) * t),
    r * (k + 1) * Math.sin(t) - r * Math.sin((k + 1) * t),
  ]

  it('open profile (default start=0 stop=1) -> extrude yields an INVALID solid', async () => {
    const wp = cq.Workplane('XY')
    const curve = await cq.parametricCurve(wp, func)
    const extruded = await cq.extrude(curve, 3)
    const solid = extruded.objects[0]
    // An open (non-closed) profile extrudes to a shell with no end caps, which
    // OCCT reports as an invalid solid — cadquery asserts assertFalse(isValid()).
    expect(isValid(solid)).toBe(false)
  })

  it('closed profile (start=0 stop=2pi) -> valid solid with exactly 3 faces', async () => {
    const wp = cq.Workplane('XY')
    const curve = await cq.parametricCurve(wp, func, { start: 0, stop: 2 * Math.PI })
    const extruded = await cq.extrude(curve, 3)
    const solid = extruded.objects[0]
    expect(isValid(solid)).toBe(true)
    expect(counts(solid).faces).toBe(3)
  })

  it('makeWire=false -> one pending edge, zero pending wires', async () => {
    const wp = cq.Workplane('XY')
    const curve = await cq.parametricCurve(wp, func, { makeWire: false })
    expect((curve.pendingEdges ?? []).length).toBe(1)
    expect((curve.pendingWires ?? []).length).toBe(0)
    // The curve lives on the pending-edge slot, not `.objects` (cadquery keeps it
    // on the pending slot too) — putting it in `.objects` would make `baseSolid()`
    // treat it as the extrude base and try to fuse a wire with the prism.
  })
})
