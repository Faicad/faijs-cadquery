/**
 * Regression guards for the two cq-compat bugs found while mirroring
 * `test_cadquery.py::TestCadQuery::testEnclosure` (2026-10-07), both of which
 * were hiding behind the stale `kernel:fillet-chain-reapply` label:
 *
 *  1. `faceWithHoles` DISCARDED the return value of `addHolesInFace`. That
 *     kernel call returns the holed face instead of mutating in place, so every
 *     nested profile extruded SOLID: `circle(5).circle(2).extrude(10)` gave the
 *     full cylinder 785.398 (f3) where cadquery 2.8.0 gives the tube 659.734
 *     (f4), and `rect(10,10).rect(4,4).extrude(10)` gave 1000 (f6) vs 840 (f10).
 *
 *  2. `Workplane.translate` moved `wp.origin`. Upstream `newObject()` keeps
 *     `self.plane`, so `Workplane("XY").box(10,10,10).translate((100,0,0))
 *     .plane.origin` is STILL (0,0,0). Moving it re-anchored every later
 *     `workplane()` (default centerOption "ProjectedOrigin"), which in
 *     testEnclosure drilled 4 counterbores INTO the part (vol −352) where
 *     upstream drills into empty space (`topOfLid` vol == `cutlip` vol).
 *
 * Expected values were measured against the installed cadquery 2.8.0
 * (cadquery-env), not derived on paper.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { setupNativeKernel } from './gear-test-harness'
import { Workplane, box, rect, circle, extrude, translate, faces, workplane, hole } from './index'
import { brepOf } from '@faicad/faijs/shape'

beforeAll(async () => {
  await setupNativeKernel()
})

function volume(wp: Workplane): number {
  const k = getKernel() as unknown as { getVolume: (h: never) => number }
  return k.getVolume(brepOf(wp.shape as never) as never)
}

describe('nested pending wires extrude as holes (cadquery 2.8.0 parity)', () => {
  it('circle(5).circle(2).extrude(10) is a TUBE, not a solid cylinder', async () => {
    let w = Workplane('XY')
    w = circle(w, 5.0)
    w = circle(w, 2.0)
    w = await extrude(w, 10.0)
    // Upstream: pi*(5^2 - 2^2)*10 = 659.7344572538565 (f4). The bug gave
    // pi*25*10 = 785.3981633974483 (f3).
    expect(volume(w)).toBeCloseTo(Math.PI * (25 - 4) * 10, 6)
  })

  it('hole order does not matter — circle(2).circle(5).extrude(10) is the same tube', async () => {
    let w = Workplane('XY')
    w = circle(w, 2.0)
    w = circle(w, 5.0)
    w = await extrude(w, 10.0)
    expect(volume(w)).toBeCloseTo(Math.PI * (25 - 4) * 10, 6)
  })

  it('rect(10,10).rect(4,4).extrude(10) removes the inner column (840, not 1000)', async () => {
    let w = Workplane('XY')
    w = rect(w, 10.0, 10.0)
    w = rect(w, 4.0, 4.0)
    w = await extrude(w, 10.0)
    // Upstream: (10*10 - 4*4)*10 = 840 (f10). The bug gave 1000 (f6).
    expect(volume(w)).toBeCloseTo(840, 6)
  })

  it('a single profile is unaffected (control case)', async () => {
    let w = Workplane('XY')
    w = circle(w, 5.0)
    w = await extrude(w, 10.0)
    expect(volume(w)).toBeCloseTo(Math.PI * 25 * 10, 6)
  })
})

describe('Workplane.translate keeps the plane (cadquery 2.8.0 parity)', () => {
  it('translate does NOT move wp.origin', async () => {
    const base = await box(Workplane('XY'), 10, 10, 10)
    const originBefore = [...base.origin]
    const moved = await translate(base, [100, 0, 0])
    expect(moved.origin).toEqual(originBefore)
  })

  it('a profile built on a translated solid anchors at the PROJECTED origin, not the moved centre', async () => {
    // Upstream: after translate((100,0,0)) the plane origin is still (0,0,0), so
    // faces(">Z").workplane() sits at (0,0,5) — OUTSIDE the moved box — and a
    // hole there removes nothing. Moving the origin instead would re-anchor it
    // to (100,0,5) and cut into the part.
    const base = await box(Workplane('XY'), 10, 10, 10)
    const moved = await translate(base, [100, 0, 0])
    const volBefore = volume(moved)
    const wp = await workplane(await faces(moved, '>Z'))
    const drilled = await hole(await circle(wp, 1.0), 8)
    // The hole falls in empty space => volume unchanged.
    expect(volume(drilled)).toBeCloseTo(volBefore, 6)
  })
})
