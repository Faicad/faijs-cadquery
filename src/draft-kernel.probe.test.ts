/**
 * Probe (durable evidence): the raw occt-wasm `draft` primitive's shape, which
 * `cq.draft` is built on. None of these was verified before N5 and getting any
 * of them wrong yields silently wrong geometry.
 *
 * Facts pinned here:
 *  1. `draft(shape, face, angleRad, direction)` drafts a face whose normal is
 *     PERPENDICULAR to the pull — a box side face with pull = -Z hinges at z=0
 *     (the origin plane ⊥ pull), matching CadQuery's `base_pln` when the base
 *     face lies on that plane.
 *  2. A face whose normal is PARALLEL to the pull ERRORS (`KERNEL_ERROR`) — the
 *     kernel cannot draft perpendicular end faces.
 *  3. `getCenterOfMass(face)` returns (0,0,0) for a BARE FACE — it is NOT a
 *     point on the surface. `pointOnSurface(face, u, v)` is the only way to land
 *     on the surface (used by `cq.draft`'s neutral-plane guard).
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

const rad = (d: number) => (d * Math.PI) / 180

function normalAt(face: ShapeHandle): Vec3 {
  const uv = k.uvBounds(face)
  return k.surfaceNormal(face, (uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2) as Vec3
}

describe('probe: raw kernel draft semantics', () => {
  it('drafts a side face (normal ⊥ pull) — hinges at the origin plane', () => {
    const box = k.makeBox(1, 1, 1) as ShapeHandle // corner at origin, z in [0,1]
    const side = k.getSubShapes(box, 'face').find((f) => Math.abs(normalAt(f).z) < 1e-6)!
    const drafted = k.draft(box, side, rad(5), { x: 0, y: 0, z: -1 } as Vec3) as ShapeHandle
    // 1 + tan(5°)/2 · 1 · 1 (a triangular wedge) = 1.0437443317...
    expect(k.getVolume(drafted)).toBeCloseTo(1.0437443317629618, 12)
  })

  it('REFUSES a face whose normal is parallel to the pull', () => {
    const box = k.makeBox(1, 1, 1) as ShapeHandle
    const top = k.getSubShapes(box, 'face').find((f) => normalAt(f).z > 0.9)!
    expect(() => k.draft(box, top, rad(5), { x: 0, y: 0, z: -1 } as Vec3)).toThrow()
  })

  it('getCenterOfMass(face) is (0,0,0) — pointOnSurface is the on-surface accessor', () => {
    const box = k.makeBox(1, 1, 1) as ShapeHandle
    const bottom = k.getSubShapes(box, 'face').find((f) => normalAt(f).z < -0.9)!
    const com = k.getCenterOfMass(bottom) as Vec3
    expect([com.x, com.y, com.z]).toEqual([0, 0, 0])
    const uv = k.uvBounds(bottom)
    const p = k.pointOnSurface(bottom, (uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2) as Vec3
    expect(Math.abs(p.z)).toBeLessThan(1e-9) // bottom face lies on z=0
  })
})
