/**
 * E2 helix op test — creates a helical wire on the workplane
 * (CadQuery `Wire.makeHelix` parity, see
 * docs/plans/2026-09-11-cq-compat-gears-extensions-e1-e4.md).
 *
 * Handedness truth is frozen from a one-shot Python capture of upstream
 * cadquery 2.8.0 (`scripts/probe-helix-handed.py`): both hands keep the same
 * axis and start point and climb +Z; only the winding sense flips. The
 * corresponding kernel channel was verified in `scripts/probe-helix-handed.mts`
 * (right/left quarter-turn y sign, length 51.250549089 identical to upstream).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import type { Shape } from '@faicad/faijs/mesh/types'
import * as cq from './index'
import { setupNativeKernel, mkWP, bbox } from './gear-test-harness'

beforeAll(async () => {
  await setupNativeKernel()
}, 120000)

/**
 * y component of the helix's start tangent. Its SIGN is the winding sense and
 * is stable regardless of the B-spline parameterisation: positive =
 * counter-clockwise about +Z (upstream right-handed), negative = left-handed.
 * (Upstream and the occt-wasm kernel agree bit-for-bit here — start tangent
 * (0, ±0.980779, 0.195120) for pitch 1.5 / r 1.2, see scripts/probe-helix-handed.*)
 */
function startTangentY(shape: Shape): number {
  const api = getBrepApi()
  const e = (api.getSubShapes(brepOf(shape) as BrepHandle, 'edge' as never) as BrepHandle[])[0]!
  const p = api.curveParameters(e)
  return api.curveTangent(e, p.first).y
}

describe('cq-compat E2 helix', () => {
  it('builds a right-handed helix with correct height and radius', async () => {
    const wp = mkWP()
    const out = await cq.helix(wp, 2, 10, 5)
    expect(out.shape).toBeDefined()
    const bb = bbox(out.shape!)
    // Extrusion axis = wp.normal = [0,0,1] → height along Z, starting at the
    // workplane origin (z=0), i.e. bbox z [0,10] — NOT [-10,0].
    expect(bb.zmin).toBeCloseTo(0, 3)
    expect(bb.zmax).toBeCloseTo(10, 3)
    // radius 5 → xy bbox span ~ 2*radius = 10.
    expect(bb.xmax - bb.xmin).toBeCloseTo(10, 1)
    expect(bb.ymax - bb.ymin).toBeCloseTo(10, 1)
    // right-handed → counter-clockwise about +Z (start tangent toward +y).
    expect(startTangentY(out.shape!)).toBeGreaterThan(0)
  })

  it('left-handed helix mirrors the winding sense without moving the axis', async () => {
    const right = await cq.helix(mkWP(), 2, 10, 5)
    const left = await cq.helix(mkWP(), 2, 10, 5, { leftHanded: true })
    expect(left.shape).toBeDefined()
    const bb = bbox(left.shape!)
    // Same axis + start point as the right-handed wire: climbs +Z from z=0.
    // (A regressed axis-negation implementation would give z [-10,0].)
    expect(bb.zmin).toBeCloseTo(0, 3)
    expect(bb.zmax).toBeCloseTo(10, 3)
    expect(bb.xmax - bb.xmin).toBeCloseTo(10, 1)
    expect(bb.ymax - bb.ymin).toBeCloseTo(10, 1)
    // Opposite winding: the start-tangent y sign flips (upstream truth).
    expect(startTangentY(right.shape!)).toBeGreaterThan(0)
    expect(startTangentY(left.shape!)).toBeLessThan(0)
  })
})