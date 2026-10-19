/**
 * until=face extrude/cutBlind — the port of CadQuery 2.8.0 `extrude(until=...)`
 * / `cutBlind(until=...)` (cq.py extrude:3030-3092, cutBlind:3511-3587,
 * _extrude:3689-3798, facesIntersectedByLine occ_impl/shapes.py:1492) that
 * unblocks the operation-layer cases `op:extrude-until-face` (4) +
 * `op:cutBlind.until-face` (3).
 *
 * DOCTRINE (§5.1): the parity mirrors grade against the frozen ref STEP; this
 * file freezes the MECHANISM — limit-face selection ('next' = first hit,
 * 'last' = farthest), the in-solid skip (profile inside the solid → index 0
 * becomes 1), the direction flip fallback, the subtractive reversal, and the
 * error paths. Every expected value below is hand-recomputed from the exact
 * test geometry (tests/test_cadquery.py::testExtrudeUntilFace /
 * testCutBlindUntilFace); changing facesIntersectedByLine / distToLimitFace /
 * buildUntilFaceTool semantics must turn this file red.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  Workplane, box, center, faces, workplane, rect, circle,
  extrude, cutBlind, pushPoints, tag, workplaneFromTagged, section, val, move2D,
} from './workplane'
import { volumeOf, facesOf, edgesOf, boundingBoxOf } from './shape-class'
import { setupNativeKernel } from './gear-test-harness'
import { brepOf, getBrepApi } from './adapters/faijs'
import type { Shape } from './adapters/faijs'

beforeAll(async () => {
  await setupNativeKernel()
})

// vol/nFaces take a Workplane and unwrap it (val) — the ops return Workplanes.
const vol = (s: Workplane): number => volumeOf(val(s) as never)
const nFaces = (s: Workplane): number => (facesOf(val(s) as never) as unknown[]).length

describe('extrude/cutBlind until=face (op:extrude-until-face / op:cutBlind.until-face)', () => {
  it("extrude('next') == regular extrude for the bridging case", async () => {
    // Two 10³ boxes at x∈[-5,5] and x∈[15,25]. Profile rect(1,1) on the
    // '>X[1]' face (x=5, the FIRST box's right face — '>X' sorts max-x first).
    // 'next' hits x=15 → depth 10, identical to extrude(10): the boss bridges
    // the gap. vol = 1000+1000+10 = 2010; 12 + 4 boss side faces = 16 faces.
    // DEFECT TRAP (2026-10-19): before the workplane() outward-normal
    // orientation, the core heuristic gave this face normal -x and
    // extrude(10) produced vol 2000.1 (OVERLAP padding out of the material).
    // vol(ref)==2010 below freezes the fix; if it goes red, the face
    // workplane normal orientation regressed.
    const two = await box(await center(await box(Workplane('XY'), 10, 10, 10), 20, 0), 10, 10, 10)
    const ref = await extrude(rect(await workplane(faces(two, '>X[1]')), 1, 1), 10)
    const nxt = await extrude(rect(await workplane(faces(two, '>X[1]')), 1, 1), 'next')
    expect(vol(ref)).toBeCloseTo(2010, 6)
    expect(vol(nxt)).toBeCloseTo(2010, 6)
    expect(nFaces(nxt)).toBe(16)
  })

  it("extrude('next') with an IN-SOLID profile skips the exit face (I-beam)", async () => {
    // I-beam (vol 30): flange z∈[-0.5,0.5] + web z∈[0.5,10.5] + top flange
    // z∈[10.5,11.5]. Profile circle(0.4) at (3,0) on the BASE plane z=0 —
    // INSIDE the bottom flange. 'next' must skip the immediate exit face
    // (z=0.5) and extrude to the top flange's BOTTOM face (z=10.5):
    // vol = 30 (beam) + π·0.16·(10.5−0.5) (pillar, net of the flange overlap)
    // = 35.026548.
    const t = tag(Workplane(), 'base')
    const f1 = await box(t, 10, 1, 1)
    const web = await box(await workplane(faces(f1, '>Z')), 1, 1, 10, { centered: [true, true, false] })
    const top = await box(await workplane(faces(web, '>Z')), 10, 1, 1, { centered: [true, true, false] })
    const circ = circle(center(workplaneFromTagged(top, 'base'), 3, 0), 0.4)
    const part = await extrude(circ, 'next')
    expect(vol(part)).toBeCloseTo(35.026548, 5)
    // The upstream assertion: section 5 above the bottom face → web + pillar
    // cross-section. Upstream fuses the section into 2 faces; TS section
    // returns the raw section curves — the 1×1 square web is 4 line edges +
    // the r=0.4 pillar circle is 1 → 5 edges.
    const sect = await section(await workplane(faces(part, '<Z')), -5)
    expect((edgesOf(val(sect) as never) as unknown[]).length).toBe(5)
  })

  it("cutBlind('next') vs cutBlind('last'): nearer vs farther hit", async () => {
    // Bar 40×10×2 (x∈[-20,20], z∈[-1,1], vol 800) + floating block 4×10×5 at
    // x∈[-2,2], z∈[5,10] (vol 200; disjoint → compound of 2 solids, 1000).
    // Profile rect(2,2) on the bar's BOTTOM face (z=-1, normal -z → cut
    // direction +z). The ray from (0,0,-1) along +z crosses z=1 (bar top,
    // d=2), z=5 (block bottom, d=6), z=10 (block top, d=11).
    const bar = await box(Workplane('XY'), 40, 10, 2)
    const blk = await box(await workplane(bar, { offset: 7.5 }), 4, 10, 5)
    const wpN = await workplane(faces(blk, '<Z'))
    const nxt = await cutBlind(rect(wpN, 2, 2), 'next')
    const last = await cutBlind(rect(await workplane(faces(blk, '<Z')), 2, 2), 'last')
    // 'next': tool z∈[-1,1] x,y∈[-1,1] fully inside the bar → 8 removed.
    expect(vol(nxt)).toBeCloseTo(992, 6)
    // 'last': tool z∈[-1,10]: 8 out of the bar + a 2×2×5 through-slot out of
    // the block → 28 removed.
    expect(vol(last)).toBeCloseTo(972, 6)
    expect(vol(last) < vol(nxt)).toBe(true)
  })

  it('cutBlind(until=face): blind hole stops at the target face plane', async () => {
    // Box 5³ at origin; target = the <Y face (y=0) of a 10³ box centred at
    // (20, 5, 0). Profile circle(2) on the >Y face (y=2.5): the cut runs -y
    // until the y=0 plane → depth 2.5. Removed π·4·2.5 = 31.415927 →
    // vol 125 − 31.415927 = 93.584073; 6 box faces + hole end + hole wall = 8.
    const a = await box(Workplane('XY'), 5, 5, 5)
    const b = await box(await center(Workplane('XY'), 20, 5), 10, 10, 10)
    const target = val(faces(b, '<Y')) as Shape
    const res = await cutBlind(circle(await workplane(faces(a, '>Y')), 2), target)
    expect(vol(res)).toBeCloseTo(93.584073, 5)
    expect(nFaces(res)).toBe(8)
  })

  it('extrude(until=face): additive pillar out to the target face plane', async () => {
    // Same setup with the target at y=25 (box centred (20, 30, 0)): circle(2)
    // on the >Y face (y=2.5) extrudes +y to y=25 → pillar depth 22.5.
    // vol = 125 + π·4·22.5 = 407.743339 (pillar fuses at the contact face).
    const a = await box(Workplane('XY'), 5, 5, 5)
    const b = await box(await center(Workplane('XY'), 20, 30), 10, 10, 10)
    const target = val(faces(b, '<Y')) as Shape
    const res = await extrude(circle(await workplane(faces(a, '>Y')), 2), target)
    expect(vol(res)).toBeCloseTo(407.743339, 5)
  })

  it('pushPoints 3D: in-plane points place at the world point; off-plane throws', async () => {
    // In-plane 3D world points (z=0 on the XY plane) behave like 2D points:
    // box(1,1,1) at (−20,0,0), (0,0,0), (20,0,0) → bbox x∈[−20.5,20.5].
    const pp = pushPoints(await box(Workplane('XY'), 1, 1, 1), [[-20, 0, 0], [0, 0, 0], [20, 0, 0]])
    const three = await box(pp, 1, 1, 1)
    expect(vol(three)).toBeCloseTo(3, 9)
    const bb = boundingBoxOf(val(three) as never) as unknown as {
      xmin: number; xmax: number
    }
    expect(bb.xmin).toBeCloseTo(-20.5, 9)
    expect(bb.xmax).toBeCloseTo(20.5, 9)
    // Off-plane 3D points (z=5 on the XY plane) would silently drop the
    // out-of-plane component — trap on record: reject loudly. Upstream
    // testCutBlindUntilFace builds its z=5 stack via 3D points; the mirrors
    // express the same world position as workplane({ offset: 5 }).
    const bar = await box(Workplane('XY'), 40, 10, 2)
    expect(() => pushPoints(bar, [[-20, 0, 5]])).toThrow(/off the workplane plane/)
  })

  it('error paths: unknown string / combine=false / both-missing / until+taper', async () => {
    const two = await box(await center(await box(Workplane('XY'), 10, 10, 10), 20, 0), 10, 10, 10)
    const w = await workplane(faces(two, '>X[1]'))
    // 'test' is a deliberately invalid until value — `as never` keeps the
    // runtime error-path test while silencing the (correct) type rejection.
    await expect(extrude(rect(w, 1, 1), 'test' as never)).rejects.toThrow(/Do not know how to handle until/)
    await expect(cutBlind(rect(w, 1, 1), 'test' as never)).rejects.toThrow(/Do not know how to handle until/)
    await expect(extrude(rect(w, 1, 1), 'next', false)).rejects.toThrow(/combine.*can't be set to False/)
    // A lone box has nothing ABOVE its >Z face: both=True needs faces in
    // BOTH directions → upstream ValueError.
    const one = await box(Workplane('XY'), 10, 10, 10)
    const wz = await workplane(faces(one, '>Z'))
    await expect(
      extrude(rect(wz, 1, 1), 'next', true, { both: true }),
    ).rejects.toThrow(/two required directions/)
    // until + taper needs the kernel tapered-prism-to-face (TKFeat) — rejected loudly.
    await expect(extrude(rect(w, 1, 1), 'next', true, { taper: 5 })).rejects.toThrow(/taper is not implemented/)
  })

  it('CQ Workplane.move (2D point-stack) → move2D: box() builds at stack points (wp_ref chain)', async () => {
    // testExtrudeUntilFace's wp_ref = Workplane("XY").box(10,10,10).center(20,0)
    // .box(10,10,10).workplane().move(10,0).box(5,5,5) → 5³ at (30,0,0).
    // TRAP (2026-10-19): CQ has TWO `move` methods. Workplane.move(xDist,yDist)
    // is a relative 2D point-stack move → cq.move2D; Shape.move(loc) is the
    // moved twin → cq.move. The wp_ref mirror originally used cq.move(10, 0),
    // which TRANSLATED THE CARRIED SOLID: the whole 2-box compound shifted by
    // +10 and the 5³ landed at (20,0,0) instead of (30,0,0) — grading FAIL
    // with 10-unit bbox offset and 1875-unit boolean diff.
    const b1 = await box(Workplane('XY'), 10, 10, 10)
    const b2 = await box(center(b1, 20, 0), 10, 10, 10)
    const w0 = await workplane(b2)
    const mv = move2D(w0, 10, 0)
    const fin = await box(mv, 5, 5, 5)
    const s = val(fin) as unknown as Shape
    const k = getBrepApi() as unknown as {
      getSubShapes: (h: unknown, t: string) => unknown[]
      getBoundingBox: (h: unknown) => { xmin: number; xmax: number }
    }
    const solids = k.getSubShapes(brepOf(s), 'solid')
    const xs = solids.map((so: unknown) => k.getBoundingBox(so).xmin).sort((a, b) => a - b)
    expect(xs).toEqual([-5, 15, 27.5])
  })
})
