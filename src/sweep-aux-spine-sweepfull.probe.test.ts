/**
 * Probe (durable evidence): occt-wasm 5.6 `sweepFull` on the auxiliary-spine
 * mode — the last untested entry point that could have closed
 * `kernel:sweep-aux-spine-mode`.
 *
 * `sweepAdvanced` was already known to be 12.16% wrong on the upstream
 * `testSweep` aux case (2026-10-06). `sweepFull` (5.6) forwards four
 * `MakePipeShell` knobs `sweepAdvanced` cannot reach, so it was the remaining
 * candidate. It is NOT: it reproduces `sweepAdvanced` to the digit.
 *
 * Measured here (upstream testSweep aux geometry: profile rect 10x20, spine
 * (0,0,0)->(0,20,100) tangent +Z, guide (0,20,0)->(20,0,100) tangent +Z):
 *
 *   sweepAdvanced(CE=true)  17759.15746693434   <- 12.163% under OCP truth
 *   sweepFull(CE=true)      17759.15746693434   <- IDENTICAL, no improvement
 *   sweepFull(CE=false)     20500.444900109196  <- OCP SetMode(aux,False) truth
 *   sweepFull(mode=Fixed)   20500.45513233427   <- OCP default/Fixed truth
 *
 * So the flag is NOT ignored (CE=true and CE=false give different solids) —
 * the kernel's CE=true construction (GeomFill_GuideTrihedronAC /
 * BRepFill_ACRLaw) simply is not the one CadQuery gets from OCP. Two of the
 * three modes ARE bit-exact; only the one CadQuery defaults to is wrong.
 *
 * Frozen CadQuery 2.8.0 truth (one-shot capture scripts/probe-aux-spine.py,
 * recorded in tests/mark-blocked.ts):
 *   SetMode(aux, CE=True)  20218.347254736764   <- what upstream testSweep uses
 *   SetMode(aux, CE=False) 20500.445
 *   Fixed                  20500.455
 */

import { describe, expect, it, beforeAll } from 'vitest'
import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { setupNativeKernel } from './gear-test-harness'

let k: OcctKernel

beforeAll(async () => {
  await setupNativeKernel()
  k = getKernel() as unknown as OcctKernel
})

const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z }) as Vec3

function testSweepGeometry() {
  const corners = [p(-5, -10, 0), p(5, -10, 0), p(5, 10, 0), p(-5, 10, 0)]
  const edges = corners.map((c, i) =>
    k.makeLineEdge(c as never, corners[(i + 1) % 4] as never),
  )
  const profile = k.makeWire(edges as never) as ShapeHandle
  const spine = k.makeWire([
    k.interpolatePointsWithTangents([p(0, 0, 0), p(0, 20, 100)], p(0, 0, 1), p(0, 0, 1)),
  ] as never) as ShapeHandle
  const aux = k.makeWire([
    k.interpolatePointsWithTangents([p(0, 20, 0), p(20, 0, 100)], p(0, 0, 1), p(0, 0, 1)),
  ] as never) as ShapeHandle
  return { profile, spine, aux }
}

const OCP_CE_TRUE = 20218.347254736764
const OCP_CE_FALSE = 20500.445
const OCP_FIXED = 20500.455

describe('probe: sweepFull does not close kernel:sweep-aux-spine-mode', () => {
  it('sweepFull(CE=true) equals sweepAdvanced(CE=true) — the new entry point changes nothing', () => {
    const { profile, spine, aux } = testSweepGeometry()
    const advanced = k.sweepAdvanced(profile, spine, {
      mode: 3,
      auxSpine: aux,
      curvilinearEquivalence: true,
    }) as ShapeHandle
    const full = k.sweepFull(profile, spine, {
      mode: 3,
      auxSpine: aux,
      curvilinearEquivalence: true,
    }) as ShapeHandle
    expect(k.getVolume(full)).toBeCloseTo(k.getVolume(advanced), 6)
  })

  it('the CE=true result stays ~12.16% under the OCP truth upstream testSweep needs', () => {
    const { profile, spine, aux } = testSweepGeometry()
    const full = k.sweepFull(profile, spine, {
      mode: 3,
      auxSpine: aux,
      curvilinearEquivalence: true,
    }) as ShapeHandle
    const v = k.getVolume(full)
    expect(v).toBeCloseTo(17759.15746693434, 4)
    expect(((v - OCP_CE_TRUE) / OCP_CE_TRUE) * 100).toBeCloseTo(-12.163, 2)
  })

  it('CE=false and Fixed ARE faithful — only the mode CadQuery defaults to is wrong', () => {
    const { profile, spine, aux } = testSweepGeometry()
    const ceFalse = k.sweepFull(profile, spine, {
      mode: 3,
      auxSpine: aux,
      curvilinearEquivalence: false,
    }) as ShapeHandle
    const fixed = k.sweepFull(profile, spine, { mode: 0 }) as ShapeHandle
    expect(k.getVolume(ceFalse)).toBeCloseTo(OCP_CE_FALSE, 3)
    expect(k.getVolume(fixed)).toBeCloseTo(OCP_FIXED, 3)
  })
})
