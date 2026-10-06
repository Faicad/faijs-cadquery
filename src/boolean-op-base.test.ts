/**
 * booleanOp base — unit tests for the P2 底座 (`booleanOpBase` in workplane.ts).
 *
 * Truth captured from cadquery 2.8.0 (one-shot probe, 2026-10-06,
 * scripts/probe-fuzzy-bool.py, eps = 1e-3):
 *
 *   res             (plain fuse, boxes 1 apart-ish)  vol 2.0       solids 2
 *   res_fuzzy       (fuse with tol=eps)              vol 2.001     solids 1
 *   res_fuzzy_cut   (cut box4 with tol=eps)          vol 0.0
 *   res_fuzzy_isec  (intersect box4 with tol=eps)    vol 1.0
 *   plain cut                                        vol 0.001
 *   plain intersect                                  vol 0.999
 *
 * MUTATION NOTE (P2-4): these assertions are load-bearing — they FAIL if
 * fuzzyValue is dropped (fuse returns 2 solids / cut returns 0.001) or if the
 * option stops reaching OCCT. Changing booleanOpBase to ignore `options` must
 * turn this file red.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { getKernel } from '@faicad/faijs'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { fromHandle } from '@faicad/faijs/sdk'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import type { Shape } from '@faicad/faijs/mesh/types'
import { booleanOpBase } from './workplane'
import { setupNativeKernel } from './gear-test-harness'

const EPS = 1e-3

function volOf(shape: unknown): number {
  return getBrepApi().getVolume(brepOf(shape as never) as BrepHandle)
}
function solidCount(shape: unknown): number {
  return (getBrepApi().getSubShapes(brepOf(shape as never) as BrepHandle, 'solid' as never) as unknown[]).length
}

/**
 * box(1,1,1) as a bare Shape, via the kernel directly (upstream
 * `Workplane("XY").box(1,1,1)` is an origin-centred unit cube).
 */
function boxAt(cx: number): Shape {
  const k = getKernel()
  return fromHandle(k.makeBoxFromCorners({ x: cx - 0.5, y: -0.5, z: -0.5 }, { x: cx + 0.5, y: 0.5, z: 0.5 }) as never)
}
function box(): Shape {
  return boxAt(0)
}

beforeAll(async () => {
  await setupNativeKernel()
})

describe('booleanOpBase (P2 底座)', () => {
  it('plain fuse of two near-disjoint boxes → 2 solids, vol 2.0', async () => {
    const { vol, solids } = await fuseTwoPlain()
    expect(solids).toBe(2)
    expect(vol).toBeCloseTo(2.0, 9)
  })

  it('fuzzy fuse (fuzzyValue=eps) merges near-coincident faces → 1 solid, vol 2.001', async () => {
    const { shape } = booleanOpBase(0, [await box()], [await boxAt(1 + EPS)], { fuzzyValue: EPS })
    expect(solidCount(shape)).toBe(1)
    expect(volOf(shape)).toBeCloseTo(2.001, 9)
  })

  it('fuzzy cut (fuzzyValue=eps) removes the eps-overlapping tool entirely → vol 0', async () => {
    const { shape } = booleanOpBase(1, [await box()], [await boxAt(EPS)], { fuzzyValue: EPS })
    expect(volOf(shape)).toBeCloseTo(0, 9)
  })

  it('plain cut of the eps-overlapping tool leaves vol 0.001 (fuzzy NOT applied)', async () => {
    const { shape } = booleanOpBase(1, [await box()], [await boxAt(EPS)])
    expect(volOf(shape)).toBeCloseTo(0.001, 9)
  })

  it('fuzzy intersect (fuzzyValue=eps) → vol 1.0; plain intersect → vol 0.999', async () => {
    const fuzzy = booleanOpBase(2, [await box()], [await boxAt(EPS)], { fuzzyValue: EPS }).shape
    expect(volOf(fuzzy)).toBeCloseTo(1.0, 9)
    const plain = booleanOpBase(2, [await box()], [await boxAt(EPS)]).shape
    expect(volOf(plain)).toBeCloseTo(0.999, 9)
  })

  it('n-arg fuse: box1+box3 fuse then fuzzy-union box2 → 1 solid vol 3.0', async () => {
    // upstream res_fuzzy2 = box1.union(box3).union(box2, tol=eps)
    const first = booleanOpBase(0, [await box()], [await boxAt(2)]).shape
    const { shape } = booleanOpBase(0, [first], [await boxAt(1 + EPS)], { fuzzyValue: EPS })
    expect(solidCount(shape)).toBe(1)
    expect(volOf(shape)).toBeCloseTo(3.0, 9)
  })

  it('throws on empty args', () => {
    expect(() => booleanOpBase(0, [], [])).toThrow(/no argument shapes/)
  })
})

/** helper: fuse two boxes plainly, return vol + solid count (test 1). */
async function fuseTwoPlain(): Promise<{ vol: number; solids: number }> {
  const { shape } = booleanOpBase(0, [await box()], [await boxAt(1 + EPS)])
  return { vol: volOf(shape), solids: solidCount(shape) }
}
