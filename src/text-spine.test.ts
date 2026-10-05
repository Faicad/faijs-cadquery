/**
 * `textOnSpine` + the CadQuery `Wire.locationAt(d)` moving frame it is built on
 * — the port of the free-function `text(txt, size, spine[, planar])`
 * (`occ_impl/shapes.py:6772`), upstream `tests/test_free_functions.py::test_text`
 * vars `r7` / `r8`.
 *
 * EVERY geometric expectation here is FROZEN from a ONE-SHOT CadQuery 2.8.0
 * capture — `tests/ref-harness/text-spine-probe.py`, run with the OCP
 * interpreter. The capture is not re-derived from the source text (the repo's
 * §5.1 doctrine; `imprint`/`sweep`/`offset` were each written wrong once by
 * reading the source and guessing).
 *
 * Captured truth (cadquery 2.8.0 / OCP 7.9.3.1.1):
 *
 *   c     = cylinder(10, 10).moved(rz=180)      # radius 5, height 10
 *   spine = c.edges("<Z")                       # CIRCLE, L = 31.41592653589793
 *   flat  = text("CQ", 1)                       # Compound, area 0.3480026696998122
 *                                               # f2/e12/v12, bb x[-0.7001954125, 0.71337900625]
 *   glyph bounding-box centres (the `pos` of the upstream loop):
 *     glyph0 pos = -0.3837890625      pos/L = -0.012216385280295866
 *     glyph1 pos =  0.3642578125      pos/L =  0.011594686283843157
 *   frame at glyph0 (spine.locationAt(pos/L), 3x4 row-major):
 *     [ 0.9970555651951182, 0.0,               -0.07668246157657897, -4.985277825975591]
 *     [-0.07668246157657897, 0.0,              -0.9970555651951182,   0.3834123078828949]
 *     [ 0.0,                 1.0,               0.0,                   0.0              ]
 *   frame at glyph1:
 *     [ 0.9973474983782767,  0.0,               0.07278713813987585,  -4.986737491891383]
 *     [ 0.07278713813987585, 0.0,              -0.9973474983782767,   -0.3639356906993792]
 *     [ 0.0,                 1.0,               0.0,                    0.0              ]
 *   r7 = text("CQ", 1, spine)             area 0.3480026696998122  f2/e12/v12
 *        bb (-5.0121491171697095, -0.7121308401820294, -0.385986428125)
 *        →  (-4.961014915867376,   0.6988870203079128,  0.39819345937499995)
 *   r8 = text("CQ", 1, spine, planar=True) area 0.3480026696998121  f2/e12/v12
 *        bb (-5.348314379280051,  -0.735427700070061,  -1e-07)
 *        →  (-4.588987154775809,   0.6979555098455795,  1e-07)
 *
 * The frame matrices are pinned rather than only the final bbox because they are
 * the load-bearing part: `normal` is the FRENET normal (unit curvature
 * direction), so a straight `tangent`-only frame would still produce *a* shape,
 * just the wrong one.
 *
 * The capture's `f2/e12/v12` against our `f2/e49/v49` is expected, not a defect:
 * OCC's `Font_BRepTextBuilder` coarsens the glyph outline into a couple of
 * B-splines where the font has 22 segments per glyph. Compare.ts grades that as
 * PASS-NT (`strictTopology: false` folds the counts into `solids === solids`),
 * which is why the edge counts do not have to match.
 *
 * What DOES have to match is the glyph face ORIENTATION: CadQuery's faces come
 * out with a **+Z** local normal and upstream asserts exactly that for r8
 * (`(r8.faces("<<X").normalAt() - Vector(0,0,1)).Length == approx(0)`). The
 * engine's raw contour winding gives -Z, which is invisible while the faces lie
 * in `z = 0` — the comparator's "volume" for an open shell is `∮x·n dA`, which
 * is identically 0 there. It is not invisible off the origin, which is what this
 * overload does; see `text-solid.ts#reverseWire` for the fix and the measured
 * before/after.
 *
 * `r9` (the `text(txt, size, spine, base)` overload) is NOT here: it needs
 * `Face.project` = `BRepProj_Projection`, which `occt-wasm` does not bind.
 * See the roadmap's `op:project` row.
 *
 * The one thing NOT asserted against the capture is the glyph AREA — the capture
 * is OCC's own approximation of the outline, not the outline. See "The analytic
 * glyph area" below; the bbox, the frames and the placement ARE pinned to it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { OcctKernel } from 'occt-wasm'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { ensureFont } from '@faicad/faijs/brep/text/fontRegistry'
import { brepOf } from '@faicad/faijs/shape'
import { asPartName } from '@faicad/faijs/identity'
import type { Shape } from '@faicad/faijs/mesh/types'
import { setupNativeKernel } from './gear-test-harness'
import { areaOf, boundingBoxOf, facesOf, unwrapShape } from './shape-class'
import { eulerExtrinsicXYZ, locationAtFrame } from './spine-frame'
import { textOnSpine } from './workplane'
import * as cq from './index'

/** Captured `spine.Length()`. */
const SPINE_LEN = 31.41592653589793
/** Captured glyph bounding-box centres of `text("CQ", 1)`. */
const GLYPH_POS = [-0.3837890625, 0.3642578125] as const
/** Captured per-face areas of `text("CQ", 1)` — OCC's APPROXIMATION, see below. */
const CAPTURED_FACE_AREAS = [0.14919636062170202, 0.19880630907811017] as const

// ---------------------------------------------------------------------------
// The analytic glyph area — the arbiter for the one number the capture and
// faijs disagree on
// ---------------------------------------------------------------------------
//
// `text("CQ", 1)` areas:
//
//   CadQuery capture        0.3480026696998122
//   faijs                   0.3480125268300374
//   Green's theorem (below) 0.3480125268300373
//
// The perimeters agree to 3.7e-12 RELATIVE (3.5314658431787027 vs
// 3.5314658431657961 for the "C"), so the two sides trace the same curves —
// yet the areas differ by 2.83e-5 relative. That is not possible for identical
// curves, so one side is not exact, and Green's theorem settles which:
// `½∮(x·dy − y·dx)` over the font's own outline reproduces OUR faces to 1e-15
// and the capture is the outlier.
//
// Why the capture is the approximate side: OCC's `Font_BRepTextBuilder` merges
// the FreeType segments, and the ref STEP shows the coarsening — CadQuery's "C"
// has 4 edges (`LINE,BSPLINE,LINE,BSPLINE`) where the exact outline has 22, and
// the whole compound is `f2/e12/v12` against our `f2/e49/v49`. CadQuery's
// per-face areas are therefore low by ~1.4e-4 relative on the "C" and high by
// ~5.6e-5 on the "Q" (whose counter is under-subtracted) — the two errors
// partially cancel in the compound total.
//
// Nothing here is a faijs defect, so the assertions below pin the ANALYTIC
// value and only bound the capture's deviation. The parity comparator gates
// volume at 0.1 %, i.e. ~3500x looser than the capture's own error, so the STEP
// comparison absorbs it (verified: the mirrors read PASS-NT on a bbox that
// matches to 6e-13).

/** 3-point Gauss-Legendre nodes/weights on [0, 1] — exact for degree ≤ 5. */
const GAUSS3 = [
  { t: 0.5 - 0.5 * Math.sqrt(3 / 5), w: 5 / 18 },
  { t: 0.5, w: 8 / 18 },
  { t: 0.5 + 0.5 * Math.sqrt(3 / 5), w: 5 / 18 },
] as const

/** A 2-D point on the font outline. */
interface Pt2 {
  x: number
  y: number
}

/** Evaluate a Bezier of degree 0..3 at `t` (de Casteljau-free, closed form). */
function bezAt(pts: readonly Pt2[], t: number): Pt2 {
  if (pts.length === 1) return pts[0]!
  const u = 1 - t
  if (pts.length === 2) {
    const a = pts[0]!
    const b = pts[1]!
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  if (pts.length === 3) {
    const a = pts[0]!
    const b = pts[1]!
    const c = pts[2]!
    return {
      x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
      y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    }
  }
  const a = pts[0]!
  const b = pts[1]!
  const c = pts[2]!
  const d = pts[3]!
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  }
}

/**
 * `½∫(x·y′ − y·x′)` over one Bezier segment.
 *
 * The integrand is a polynomial of degree ≤ 5 (degree 3 for `x(t)`, degree 2
 * for the derivative), so 3-point Gauss-Legendre integrates it EXACTLY — this
 * is not a numerical approximation, and the result carries no tolerance.
 */
function bezSegArea(pts: readonly Pt2[]): number {
  // The derivative of a degree-n Bezier is a degree-(n−1) Bezier over n·ΔP.
  const n = pts.length - 1
  const deriv: Pt2[] = []
  for (let i = 0; i < n; i++) {
    deriv.push({ x: n * (pts[i + 1]!.x - pts[i]!.x), y: n * (pts[i + 1]!.y - pts[i]!.y) })
  }
  let acc = 0
  for (const { t, w } of GAUSS3) {
    const p = bezAt(pts, t)
    const v = bezAt(deriv, t)
    acc += w * (p.x * v.y - p.y * v.x)
  }
  return acc / 2
}

/**
 * The exact area of `txt` as the font defines it, contour by contour.
 *
 * @param txt - the string to measure
 * @returns the signed area of each closed contour, in model units (a counter
 *   comes back negative, so their sum is the ink area)
 */
async function exactContourAreas(txt: string): Promise<number[]> {
  const font = await ensureFont('Arial')
  const path = font.getPath(txt, 0, 0, 1)
  const contours: Array<Array<readonly Pt2[]>> = []
  let cur: Array<readonly Pt2[]> = []
  let last: Pt2 = { x: 0, y: 0 }
  for (const cmd of path.commands as Array<Record<string, number | string>>) {
    if (cmd.type === 'M') {
      if (cur.length > 1) contours.push(cur)
      cur = []
      last = { x: cmd.x as number, y: cmd.y as number }
    } else if (cmd.type === 'L') {
      const end = { x: cmd.x as number, y: cmd.y as number }
      cur.push([last, end])
      last = end
    } else if (cmd.type === 'Q') {
      const end = { x: cmd.x as number, y: cmd.y as number }
      cur.push([last, { x: cmd.x1 as number, y: cmd.y1 as number }, end])
      last = end
    } else if (cmd.type === 'C') {
      const end = { x: cmd.x as number, y: cmd.y as number }
      cur.push([
        last,
        { x: cmd.x1 as number, y: cmd.y1 as number },
        { x: cmd.x2 as number, y: cmd.y2 as number },
        end,
      ])
      last = end
    } else if (cmd.type === 'Z') {
      if (cur.length > 1) contours.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) contours.push(cur)
  return contours.map((segs) => segs.reduce((a, s) => a + bezSegArea(s), 0))
}

let spine: Shape
let flat: Shape
/** Exact ink area of `text("CQ", 1)` per the font outline (see the block above). */
let exactArea: number

beforeAll(async () => {
  await registerOcctBrepEngine()
  // `createNodePorts()` is what installs the fs FontProvider
  // (`setFontLoader`, a module singleton — NOT part of `configureBackends`), so
  // text can resolve its glyph face. `setupNativeKernel()` must run AFTER the
  // runtime is built: `configureBackends` is a full replace, so calling it first
  // and then letting `createRuntime` configure again leaves `getBrepApi()`
  // unbound for the direct (non-DSL) calls below.
  const runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
  await setupNativeKernel()

  // spine = cylinder(10, 10).moved(rz=180) → c.edges("<Z")
  // Upstream's free `cylinder(d, h)` takes a DIAMETER; cq-compat's Workplane form
  // takes (height, radius) — hence (10, 5).
  const cyl = await cq.cylinder(cq.Workplane('XY'), 10, 5, { centered: [true, true, false] })
  const turned = await cq.rotate(cyl, [0, 0, 1], 180)
  spine = cq.val(cq.edges(turned, '<Z'))!

  // flat = text("CQ", 1): the fixture the upstream loop iterates over.
  flat = cq.val(await cq.text(cq.Workplane('XY'), 'CQ', 1, 0, false, { font: 'Arial' }))!

  // The arbiter for the area assertion (see the block above the helpers).
  exactArea = (await exactContourAreas('CQ')).reduce((a, v) => a + v, 0)
}, 120000)

function k(): OcctKernel {
  return getKernel() as unknown as OcctKernel
}

function spineEdge(): never {
  return brepOf(spine) as never
}

describe('text-spine · fixture sanity (flat text + spine)', () => {
  it('builds the flat "CQ" compound at size 1 with the captured bbox', () => {
    const bb = boundingBoxOf(brepOf(flat) as never)
    expect(bb.xmin).toBeCloseTo(-0.7001954125, 9)
    expect(bb.xmax).toBeCloseTo(0.71337900625, 9)
    expect(bb.ymin).toBeCloseTo(-0.385986428125, 9)
    expect(bb.ymax).toBeCloseTo(0.398193459375, 9)
    // Upstream `Volume()` on a 2-D compound reports the same number as `Area()`.
    // GOTCHA: occt-wasm's `getVolume` returns 0 for a face compound — the capture's
    // number is the AREA, so assert `areaOf` (`getSurfaceArea`), not the volume.
    // Asserted against the ANALYTIC outline, not the capture — see "The analytic
    // glyph area" above for why the capture is the approximation.
    expect(areaOf(brepOf(flat) as never) / exactArea - 1).toBeLessThan(1e-12)
    expect(facesOf(brepOf(flat) as never)).toHaveLength(2)
  })

  it('is EXACT on the glyph area, where the CadQuery capture is an approximation', async () => {
    const contours = await exactContourAreas('CQ')
    // "C" is one contour, "Q" is a body plus its counter (which comes back
    // negative — that is what makes it a hole).
    expect(contours).toHaveLength(3)
    expect(contours[0]!).toBeGreaterThan(0)
    expect(contours[2]!).toBeLessThan(0)
    // Our faces ARE the analytic outline, per contour.
    const ours = facesOf(brepOf(flat) as never).map((f) => areaOf(unwrapShape(f)))
    expect(ours[0]! / contours[0]! - 1).toBeLessThan(1e-12)
    expect(ours[1]! / (contours[1]! + contours[2]!) - 1).toBeLessThan(1e-12)

    // ...and the capture is low on the "C", high on the "Q" (its counter is
    // under-subtracted), by the amounts the coarsened outline predicts.
    expect(CAPTURED_FACE_AREAS[0]! / contours[0]! - 1).toBeLessThan(0)
    expect(CAPTURED_FACE_AREAS[1]! / (contours[1]! + contours[2]!) - 1).toBeGreaterThan(0)
    // Bounded by 2x the observed 1.4e-4 / 5.6e-5 — and far inside the parity
    // comparator's 0.1 % volume gate (tests/compare.ts), which is what lets the
    // STEP comparison absorb it.
    expect(Math.abs(CAPTURED_FACE_AREAS[0]! / contours[0]! - 1)).toBeLessThan(3e-4)
    expect(Math.abs(CAPTURED_FACE_AREAS[1]! / (contours[1]! + contours[2]!) - 1)).toBeLessThan(3e-4)
  })

  it('resolves the spine to one circular edge of the captured length', () => {
    const e = spineEdge()
    expect(k().curveType(e)).toBe('circle')
    expect(k().curveLength(e)).toBeCloseTo(SPINE_LEN, 12)
  })

  it('reports the captured per-glyph bounding-box centres (`pos`)', () => {
    const glyphs = facesOf(brepOf(flat) as never)
    const pos = glyphs.map((g) => {
      const bb = boundingBoxOf(g)
      return (bb.xmin + bb.xmax) / 2
    })
    expect(pos[0]).toBeCloseTo(GLYPH_POS[0], 9)
    expect(pos[1]).toBeCloseTo(GLYPH_POS[1], 9)
  })
})

describe('text-spine · locationAt frame', () => {
  it('reproduces the captured frame matrix at glyph0 (normal side of the seam)', () => {
    const m = locationAtFrame(spineEdge(), GLYPH_POS[0] / SPINE_LEN)
    const expected = [
      0.9970555651951182, 0.0, -0.07668246157657897, -4.985277825975591,
      -0.07668246157657897, 0.0, -0.9970555651951182, 0.3834123078828949,
      0.0, 1.0, 0.0, 0.0,
    ]
    m.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12))
  })

  it('reproduces the captured frame matrix at glyph1', () => {
    const m = locationAtFrame(spineEdge(), GLYPH_POS[1] / SPINE_LEN)
    const expected = [
      0.9973474983782767, 0.0, 0.07278713813987585, -4.986737491891383,
      0.07278713813987585, 0.0, -0.9973474983782767, -0.3639356906993792,
      0.0, 1.0, 0.0, 0.0,
    ]
    m.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 12))
  })

  it('puts the frame origin on the spine and column Z on the captured tangent', () => {
    // The origin of the returned 3x4 is `curve.Value(param)`.
    const m = locationAtFrame(spineEdge(), GLYPH_POS[0] / SPINE_LEN)
    const origin = { x: m[3]!, y: m[7]!, z: m[11]! }
    expect(Math.hypot(origin.x, origin.y, origin.z)).toBeCloseTo(5, 9)
    // column 0 is the FRENET NORMAL — radial, i.e. parallel to the origin vector
    // up to sign. A tangent-only frame would fail this.
    const nx = m[0]!
    const ny = m[4]!
    const nz = m[8]!
    const cross = Math.hypot(ny * origin.z - nz * origin.y, nz * origin.x - nx * origin.z, nx * origin.y - ny * origin.x)
    expect(cross).toBeCloseTo(0, 9)
    // column 2 is the tangent (unit)
    expect(Math.hypot(m[2]!, m[6]!, m[10]!)).toBeCloseTo(1, 12)
  })

  it('accepts a NEGATIVE distance (glyph0 sits left of the string origin)', () => {
    // Guards the periodic-domain branch: the capture's glyph0 frame is reached by
    // going BACKWARDS along the circle, i.e. to a parameter below `first`.
    expect(GLYPH_POS[0]).toBeLessThan(0)
    expect(() => locationAtFrame(spineEdge(), GLYPH_POS[0] / SPINE_LEN)).not.toThrow()
  })

  it('places the frame at the EXACT arc length (guards the Simpson step factor)', () => {
    // The spine is a radius-5 circle, so `d` is a fraction of 10π. Its parameter
    // 0 sits at (-5, 0, 0): `cylinder(...).moved(rz=180)` maps the OCC circle's
    // local X-axis start onto world -X. `param` then increases counterclockwise —
    // that is not assumed, it is forced by the captured glyph pair (pos1 > pos0
    // takes the point from 175.602° to 184.174°, i.e. forward in angle).
    const originAt = (d: number): { x: number; y: number } => {
      const m = locationAtFrame(spineEdge(), d)
      return { x: m[3]!, y: m[7]! }
    }
    const at0 = originAt(0)
    expect(at0.x).toBeCloseTo(-5, 9)
    expect(at0.y).toBeCloseTo(0, 9)
    // GOTCHA: an off-by-2 in the Simpson step (`h/3` where the step width is one
    // subinterval, so `h/6` is right) inflates the arc-length table and every
    // `arcBetween` by the same factor. The inversion then lands at HALF the
    // requested distance while staying orthonormal and exactly on the curve — so
    // `d = 0` and `d = 1` (a full loop, back to (-5, 0, 0)) both still pass, and
    // only an interior fraction exposes it. This assertion is that exposure.
    const quarter = originAt(0.25)
    expect(quarter.x).toBeCloseTo(0, 9)
    expect(quarter.y).toBeCloseTo(-5, 9)
    const half = originAt(0.5)
    expect(half.x).toBeCloseTo(5, 9)
    expect(half.y).toBeCloseTo(0, 9)
  })
})

describe('text-spine · eulerExtrinsicXYZ', () => {
  it('matches CadQuery for a pure ry rotation (the case the capture pins)', () => {
    // r7 uses moved(rx=0, ry=-90): x -> -z, z -> x.
    const m = eulerExtrinsicXYZ(0, -90, 0)
    expect(m[0]!).toBeCloseTo(0, 12)   // x' = -z
    expect(m[2]!).toBeCloseTo(-1, 12)
    expect(m[6]!).toBeCloseTo(1, 12)   // z' = x
    expect(m[8]!).toBeCloseTo(0, 12)
    expect(m[4]!).toBeCloseTo(1, 12)   // y unchanged
  })

  it('is R = Rz·Ry·Rx, NOT THREE.Euler("XYZ") (Rx·Ry·Rz)', () => {
    // r8 uses moved(rx=-90, ry=-90) — the pair where the two orders disagree, so
    // routing text placement through `rotateBrep` would silently tilt it wrong.
    const cad = eulerExtrinsicXYZ(-90, -90, 0)
    // Rz(0)·Ry(-90)·Rx(-90):
    //   Rx(-90): y -> -z, z -> y   |  Ry(-90): z -> -x ... composed below.
    const rx = eulerExtrinsicXYZ(-90, 0, 0)
    const ry = eulerExtrinsicXYZ(0, -90, 0)
    // Rx·Ry (the OTHER order) — must differ from `cad`.
    const mul = (a: number[], b: number[]): number[] => {
      const out = new Array<number>(9)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          out[i * 3 + j] =
            a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!
        }
      }
      return out
    }
    const rxThenRy = mul(rx, ry)
    const maxDelta = Math.max(...cad.map((v, i) => Math.abs(v - (rxThenRy[i] ?? 0))))
    expect(maxDelta).toBeGreaterThan(0.5)
    // and the composition IS Ry·Rx (rz = 0)
    const ryThenRx = mul(ry, rx)
    cad.forEach((v, i) => expect(v).toBeCloseTo(ryThenRx[i]!, 12))
  })
})

describe('text-spine · glyph face orientation (the +Z contract)', () => {
  /** World normal of every face of `s`, sorted by `y` so the order is stable. */
  function worldNormals(s: Shape): number[][] {
    return facesOf(brepOf(s) as never)
      .map((f) => {
        const h = unwrapShape(f)
        const b = k().uvBounds(h)
        const n = k().surfaceNormal(h, (b.uMin + b.uMax) / 2, (b.vMin + b.vMax) / 2)
        return [n.x, n.y, n.z]
      })
      .sort((a, b) => a[1]! - b[1]!)
  }

  function expectClose(actual: number[], expected: number[], digits: number): void {
    expect(actual).toHaveLength(expected.length)
    expected.forEach((v, i) => expect(actual[i]!).toBeCloseTo(v, digits))
  }

  it('orients every flat glyph face +Z, like Font_BRepTextBuilder', () => {
    // The engine's raw contour winding yields -Z on `makeFace`; `buildTextSolid`
    // reverses each contour to match CadQuery. Upstream asserts this directly —
    // `test_text` requires `(r8.faces("<<X").normalAt() - Vector(0,0,1)).Length
    // == approx(0)` — so a -Z face is a genuine infidelity, not cosmetics.
    for (const n of worldNormals(flat)) expectClose(n, [0, 0, 1], 12)
  })

  it('keeps the captured WORLD normals after placement (r7 radial, r8 +Z)', async () => {
    // Captured `spine.locationAt(pos/L)` frames; column k is `[m[k], m[4+k], m[8+k]]`.
    const FRAME0 = [
      0.9970555651951182, 0.0, -0.07668246157657897, -4.985277825975591,
      -0.07668246157657897, 0.0, -0.9970555651951182, 0.3834123078828949,
      0.0, 1.0, 0.0, 0.0,
    ]
    const FRAME1 = [
      0.9973474983782767, 0.0, 0.07278713813987585, -4.986737491891383,
      0.07278713813987585, 0.0, -0.9973474983782767, -0.3639356906993792,
      0.0, 1.0, 0.0, 0.0,
    ]
    const column = (m: number[], k: number): number[] => [m[k]!, m[4 + k]!, m[8 + k]!]

    // r7 (no rx): `moved(ry=-90)` sends the glyph's +Z to -X, so the face normal
    // is the NEGATED first frame column. This is not inferred from our output —
    // the capture pins it: `r7.faces("<<X").normalAt()` = (-0.9973474983782767,
    // -0.07278713813987585, 0.0), which is -(FRAME1 column 0).
    const want7 = [FRAME0, FRAME1].map((m) => column(m, 0).map((v) => -v))
    want7.sort((a, b) => a[1]! - b[1]!)
    const r7 = worldNormals(await textOnSpine('CQ', 1, spine, { font: 'Arial' }))
    r7.forEach((n, i) => expectClose(n, want7[i]!, 9))

    // r8 (rx=-90 then ry=-90): +Z first goes to +Y, so the normal is the SECOND
    // frame column — which the capture also pins verbatim
    // (`r8.faces("<<X").normalAt()` = (-0.0, 0.0, 1.0)), and both frames'
    // column 1 is (0, 0, 1).
    const want8 = [FRAME0, FRAME1].map((m) => column(m, 1))
    want8.sort((a, b) => a[1]! - b[1]!)
    const r8 = worldNormals(await textOnSpine('CQ', 1, spine, { planar: true, font: 'Arial' }))
    r8.forEach((n, i) => expectClose(n, want8[i]!, 9))
  })
})

describe('text-spine · textOnSpine', () => {
  it('r7 — text("CQ", 1, spine): glyphs stand on the spine (captured bbox/area)', async () => {
    const r7 = await textOnSpine('CQ', 1, spine, { font: 'Arial' })
    const h = brepOf(r7) as never
    const bb = boundingBoxOf(h)
    expect(bb.xmin).toBeCloseTo(-5.0121491171697095, 9)
    expect(bb.ymin).toBeCloseTo(-0.7121308401820294, 9)
    expect(bb.zmin).toBeCloseTo(-0.385986428125, 9)
    expect(bb.xmax).toBeCloseTo(-4.961014915867376, 9)
    expect(bb.ymax).toBeCloseTo(0.6988870203079128, 9)
    expect(bb.zmax).toBeCloseTo(0.39819345937499995, 9)
    // Area against the analytic outline (the capture is OCC's approximation).
    expect(areaOf(h) / exactArea - 1).toBeLessThan(1e-12)
    expect(facesOf(h)).toHaveLength(2)
  })

  it('r8 — planar=True lays the glyphs flat in the frame plane (captured bbox/area)', async () => {
    const r8 = await textOnSpine('CQ', 1, spine, { planar: true, font: 'Arial' })
    const h = brepOf(r8) as never
    const bb = boundingBoxOf(h)
    expect(bb.xmin).toBeCloseTo(-5.348314379280051, 9)
    expect(bb.ymin).toBeCloseTo(-0.735427700070061, 9)
    expect(bb.zmin).toBeCloseTo(0, 6)
    expect(bb.xmax).toBeCloseTo(-4.588987154775809, 9)
    expect(bb.ymax).toBeCloseTo(0.6979555098455795, 9)
    expect(bb.zmax).toBeCloseTo(0, 6)
    // Area against the analytic outline (the capture is OCC's approximation).
    expect(areaOf(h) / exactArea - 1).toBeLessThan(1e-12)
    expect(facesOf(h)).toHaveLength(2)
  })

  it('_normalize collapses a single-glyph result to the face itself', async () => {
    // Upstream: `_normalize(compound(rv))` unwraps a one-element compound
    // (`occ_impl/shapes.py:5462`), which `test_text` relies on for the single
    // letter (`assert isinstance(r10, Face)`).
    const single = await textOnSpine('C', 1, spine, { font: 'Arial' })
    expect(k().getShapeType(brepOf(single) as never)).toBe('face')
    expect(k().getShapeType(brepOf(await textOnSpine('CQ', 1, spine, { font: 'Arial' })) as never)).toBe('compound')
  })

  it('rejects a missing spine', async () => {
    await expect(textOnSpine('CQ', 1, null as never)).rejects.toThrow(/spine shape is required/)
  })

  it('rejects a spine with more than one edge (upstream `_get_one_wire`)', async () => {
    const cyl = await cq.cylinder(cq.Workplane('XY'), 10, 5, { centered: [true, true, false] })
    await expect(textOnSpine('CQ', 1, cq.val(cyl)!)).rejects.toThrow(
      /must resolve to exactly one edge/,
    )
  })
})

describe('text-spine · CLI path (`autoLift:false`, the mirror configuration)', () => {
  it('places text along a spine from a .fai.js script', async () => {
    // The mirror path, NOT the in-process call path: the parity CLI registers the
    // library with `faijs.autoLift:false`, so a green in-process test alone would
    // be a false positive (see the note in `shape-filter.test.ts`).
    const runtime = createRuntime(createNodePorts(), 'brep', { faijs: { autoLift: false } })
    runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
    const code = [
      "import * as cq from '@faicad/faijs-cadquery'",
      "let cyl = await cq.cylinder(cq.Workplane('XY'), 10, 5, { centered: [true, true, false] })",
      'let turned = await cq.rotate(cyl, [0, 0, 1], 180)',
      "let spine = cq.val(cq.edges(turned, '<Z'))",
      "let r7 = await cq.textOnSpine('CQ', 1, spine, { font: 'Arial' })",
      'let result = r7',
    ].join('\n')
    const res = await runtime.execute(code)
    if (res.failedAt) throw new Error(`script failed: ${JSON.stringify(res.failedAt)}`)
    const shape = res.outputs.get(asPartName('result')) as Shape | undefined
    expect(shape).toBeDefined()
    const bb = boundingBoxOf(brepOf(shape!) as never)
    expect(bb.xmin).toBeCloseTo(-5.0121491171697095, 6)
    expect(bb.zmax).toBeCloseTo(0.39819345937499995, 6)
  }, 120000)
})
