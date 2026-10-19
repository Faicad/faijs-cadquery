/**
 * prism from/to face (op:prism-from-face) — mechanism tests for the batch-2
 * port of test_prism__res5/res6 and test_prism_taper__res3/res5.
 *
 * DOCTRINE (§5.1): the parity mirrors grade against the frozen ref STEP; this
 * file freezes the MECHANISM — the triangular bar between two face planes
 * (with the XZ plane convention), the through cutBlind to the far face, and
 * the taper-5° bicone expressed as two cones. Every expected value is
 * hand-recomputed from the exact ref geometry measured 2026-10-19 on
 * out/ref/*.step:
 *
 *  res5/res6: ref 1 solid, 9 faces (4 box sides + bottom + 2 slants 1.1180 +
 *             2 triangle ends 0.5; the z=1 "roof" is an interior interface
 *             — the prism's base face coincides with the box top face and is
 *             removed). vol = 1 + (½·1·1)·1 = 1.5. OUR construction (fuse of
 *             box + swept bar) gives 7 faces: OCCT's glue merges each
 *             triangle end with the coplanar box side (→ pentagon); the ref
 *             keeps them apart because CQ's prism goes through
 *             BRepFeat_MakePrism, whose internal boolean does not glue.
 *             Geometry (vol/bbox/boolean diff) is identical → grading rides
 *             the boolean-diff channel.
 *  taper res3: 7 faces (4 sides + top/bottom 1−π0.04 = 0.8743 + cylinder
 *             2π0.21 = 1.2566), vol = 1 − π0.04·1 = 0.874354 — exact.
 *  taper res5: ref 12 faces (OCCT's BRepFeat_MakeDPrism splits each conical
 *             half into 3 patches); our construction (two sequential boolean
 *             cuts, one per conical half — a single fused bicone LOSES the
 *             second cone: fusing two cones that share a full face is
 *             degenerate in OCCT) gives 8 whole-cone faces. vol = 1 − two
 *             frusta = 0.87233303 with rBot = 0.2+0.5tan5° = 0.24374433,
 *             rTop = 0.2−0.5tan5° = 0.15625567 — exact.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  Workplane, box, faces, workplane, circle, polyline, close, extrude,
  translate, union, cut, cone, cutBlind, val,
} from './workplane'
import { volumeOf, facesOf, boundingBoxOf } from './shape-class'
import { setupNativeKernel } from './gear-test-harness'

beforeAll(async () => {
  await setupNativeKernel()
})

// vol/nFaces take a Workplane and unwrap it (val) — the ops return Workplanes.
const vol = (s: Workplane): number => volumeOf(val(s) as never)
const nFaces = (s: Workplane): number => (facesOf(val(s) as never) as unknown[]).length

describe('prism from/to face (op:prism-from-face)', () => {
  it('triangular bar between the <Y/>Y face planes (test_prism res5/res6)', async () => {
    // 1³ box z∈[0,1] + triangle (-0.5,0,1),(0.5,0,1),(0,0,2) swept along y
    // across the box's full y range. Workplane('XZ') normal is -Y (CQ
    // Plane.named table) → extrude(+1) goes to y∈[-1,0]; shift by +0.5 to
    // centre the bar on y∈[-0.5,0.5].
    const base = await box(Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const w = Workplane('XZ')
    const tri = close(polyline(w, [[-0.5, 1], [0.5, 1], [0, 2]]))
    const bar = await extrude(tri, 1)
    const barM = await translate(bar, [0, 0.5, 0])
    const res = await union(base, barM)
    expect(vol(res)).toBeCloseTo(1.5, 9)
    // 7, not the ref's 9: OCCT glue merges each triangle end (y=±0.5, area
    // 0.5) with the coplanar box side (area 1.0) into a pentagon (1.5).
    // The ref's separate triangles come from BRepFeat_MakePrism's internal
    // boolean (no glue) — a kernel-path difference, geometry is identical.
    expect(nFaces(res)).toBe(7)
    // full bbox pins the XZ convention (v -> +z: the bar sits ABOVE the box)
    const bb = boundingBoxOf(val(res) as never) as unknown as {
      xmin: number; xmax: number; ymin: number; ymax: number; zmin: number; zmax: number
    }
    expect(bb.xmin).toBeCloseTo(-0.5, 9)
    expect(bb.xmax).toBeCloseTo(0.5, 9)
    expect(bb.ymin).toBeCloseTo(-0.5, 9)
    expect(bb.ymax).toBeCloseTo(0.5, 9)
    expect(bb.zmin).toBeCloseTo(0, 9)
    expect(bb.zmax).toBeCloseTo(2, 9)
  })

  it('through cutBlind to the far face (test_prism_taper res3)', async () => {
    // 1³ box, circle r=0.2 on the >Z face, cutBlind 'last' → full through
    // hole (z=1 down to the z=0 plane): vol = 1 − π0.04·1; 7 faces.
    const base = await box(Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const fz = await faces(base, '>Z')
    const wz = await workplane(fz)
    const circ = circle(wz, 0.2)
    const res = await cutBlind(circ, 'last')
    expect(vol(res)).toBeCloseTo(1 - Math.PI * 0.04, 9)
    expect(nFaces(res)).toBe(7)
  })

  it('bicone through-hole = taper-5° from/to face (test_prism_taper res5)', async () => {
    // profile circle r=0.2 at z=0.5, taper 5° both ways to the z=0 / z=1
    // planes: rBot = 0.24374433 (z=0), rTop = 0.15625567 (z=1).
    // hole vol = (π·0.5/3)·(rBot²+rBot·0.2+0.04 + 0.04+0.2·rTop+rTop²)
    //          = 0.12766697 → res vol = 0.87233303 (expected computed from
    // the formula below, tolerance 5e-6 = OCCT boolean noise ~6e-7).
    // 8 faces (4 sides + top/bottom with hole + 2 whole conical walls; the
    // ref's 12 come from BRepFeat_MakeDPrism splitting each cone into 3).
    // TRAP (2026-10-19): do NOT fuse the two cones into one bicone first —
    // they share a full face (the r=0.2 disc at z=0.5) and OCCT's fuse of
    // such a pair degenerates (the second cone silently disappears; the cut
    // then removed only the lower frustum, vol 0.9224 instead of 0.8723).
    // Cut each conical half separately.
    // TRAP 2 (2026-10-19): `cone` is the FREE-FUNCTION analogue — it always
    // builds at the world origin and IGNORES the workplane origin/stack
    // (a workplane offset moves nothing). Position it with `translate`.
    // (workplane-offset cone placement is a potential API gap, on record.)
    const t5 = (5 * Math.PI) / 180
    const rBot = 0.2 + 0.5 * Math.tan(t5)
    const rTop = 0.2 - 0.5 * Math.tan(t5)
    const base = await box(Workplane(), 1, 1, 1, { centered: [true, true, false] })
    const lower = await cone(Workplane(), 2 * rBot, 0.4, 0.5)
    const upperRaw = await cone(Workplane(), 0.4, 2 * rTop, 0.5)
    const upper = await translate(upperRaw, [0, 0, 0.5])
    const step1 = await cut(base, lower)
    const res = await cut(step1, upper)
    const holeVol =
      ((Math.PI * 0.5) / 3) *
      (rBot * rBot + rBot * 0.2 + 0.04 + 0.04 + 0.2 * rTop + rTop * rTop)
    expect(vol(res)).toBeCloseTo(1 - holeVol, 5)
    expect(nFaces(res)).toBe(8)
  })
})
