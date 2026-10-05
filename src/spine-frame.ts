/**
 * spine-frame — CadQuery's `Wire.locationAt(d)` moving frame, on top of the
 * OCCT kernel primitives faijs actually has.
 *
 * Upstream (cadquery 2.8.0, `occ_impl/shapes.py:2472`) is:
 *
 * ```python
 * curve, param = self._curve_and_param(d, mode)   # mode="length"
 * law = GeomFill_Frenet(); law.SetCurve(curve)
 * law.D0(param, tangent, normal, binormal)
 * pnt = curve.Value(param)
 * T.SetTransformation(gp_Ax3(pnt, gp_Dir(tangent), gp_Dir(normal)), gp_Ax3())
 * ```
 *
 * The resulting affine maps a local point to the frame at `param`:
 *
 * ```
 * T(p) = M · p + pnt,   M = [ normal | binormal | tangent ]   (columns)
 * ```
 *
 * `normal` is the FRENET normal (the unit curvature direction dT/ds), so `M` is
 * right-handed with `binormal = tangent × normal`. Verified against a live
 * CadQuery capture — see `text-spine.test.ts`.
 *
 * ## Why arc length is computed numerically here
 *
 * Upstream's `_curve_and_param(d, "length")` calls `paramAt(d)`, which is
 * `GCPnts_AbscissaPoint(curve, Length(curve) * d, FirstParameter())` — an exact
 * arc-length → parameter inversion. Two tempting kernel substitutes do not
 * work:
 *
 * - `curveTangent(edge, u)` is **normalised** (probe: |T| = 1 on a radius-5
 *   circle), so it carries no curve speed to integrate;
 * - `curveSplit(edge, u)` rejects anything that is not a BSpline/Bezier
 *   (`OcctError: curveSplit: edge is not a BSpline or Bezier curve`), so a
 *   circle cannot be split-and-measured.
 *
 * What is left is quadrature: estimate |dP/du| with a 4th-order central
 * difference on `curvePointAtParam`, integrate it with composite Simpson, and
 * invert the (monotone) arc-length function by bisection. Truncation error is
 * ~1e-12 relative — far below the placement tolerance this frame feeds (the STEP
 * comparator gates bbox at 1e-3) — and it is EXACT for the analytic case that
 * matters, because a circle's speed is constant so Simpson integrates it exactly.
 *
 * ## The domain is allowed to leave `[first, last]`
 *
 * `d` is a **signed** normalised distance: `text()` passes `pos / length`, and
 * `pos` (a glyph's bounding-box centre) is negative whenever the glyph sits left
 * of the string origin. Upstream therefore evaluates the adaptor at parameters
 * below `first`, which is well defined on a periodic curve. The kernel agrees —
 * `curvePointAtParam(circle, -0.0767)` returns the on-circle point — so the
 * table extends one full span to each side of `[first, last]` for periodic
 * curves and the search is done on the correct side of the anchor.
 */

import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import type { OcctKernel, ShapeHandle, Vec3 } from 'occt-wasm'

/** Row-major 3×4 affine: `[r0c0..r0c3, r1c0..r1c3, r2c0..r2c3]` (kernel `transform` layout). */
export type Affine34 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

/** Kernel surface used here (all present in `occt-wasm`'s public API). */
interface CurveKernel {
  curveParameters(h: ShapeHandle): { first: number; last: number }
  curvePointAtParam(h: ShapeHandle, param: number): Vec3
  curveTangent(h: ShapeHandle, param: number): Vec3
  curveLength(h: ShapeHandle): number
  curveIsPeriodic(h: ShapeHandle): boolean
}

function ck(): CurveKernel {
  return getKernel() as unknown as CurveKernel & OcctKernel
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function unit(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z)
  if (!(n > 0)) throw new Error('[cq-compat] locationAt: degenerate tangent/normal (zero length)')
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * Curve speed `|dP/du|` at `u` from a 4th-order central difference of
 * `curvePointAtParam` (truncation `O(eps⁴)`; `eps` is scaled to the curve's
 * span rather than pushed to machine epsilon, where cancellation would dominate).
 */
function speedAt(edge: ShapeHandle, u: number, eps: number): number {
  const k = ck()
  const a = k.curvePointAtParam(edge, u - 2 * eps)
  const b = k.curvePointAtParam(edge, u - eps)
  const c = k.curvePointAtParam(edge, u + eps)
  const d = k.curvePointAtParam(edge, u + 2 * eps)
  const inv = 1 / (12 * eps)
  return Math.hypot(
    (a.x - 8 * b.x + 8 * c.x - d.x) * inv,
    (a.y - 8 * b.y + 8 * c.y - d.y) * inv,
    (a.z - 8 * b.z + 8 * c.z - d.z) * inv,
  )
}

/**
 * Cumulative arc length from `anchor` toward `other` (signed; `s(anchor) === 0`).
 *
 * GOTCHA: `h` here is the width of ONE subinterval (`u[i] - u[i-1]`), so each
 * step is Simpson on an interval of width `h` — `(h/6)(f(a) + 4f(mid) + f(b))`.
 * Writing `(h/3)` (correct only when the step *is* a full Simpson panel, i.e.
 * `h = 2·subinterval`) inflates every entry by exactly 2. The table and
 * `arcBetween` then share that factor, so the inversion `s ↦ u` is
 * *self-consistently* wrong and lands at **half** the requested arc length —
 * the frame still sits on the curve, still orthonormal, silently at the wrong
 * place. Caught by `text-spine.test.ts`'s quarter-span assertion.
 */
function cumulative(
  edge: ShapeHandle,
  anchor: number,
  other: number,
  panels: number,
): { u: number[]; s: number[] } {
  const n = 2 * panels
  const h = (other - anchor) / n
  const eps = Math.abs(other - anchor) * 1e-4
  const u: number[] = [anchor]
  const s: number[] = [0]
  let acc = 0
  let prev = speedAt(edge, anchor, eps)
  for (let i = 1; i <= n; i++) {
    const ui = i === n ? other : anchor + i * h
    const cur = speedAt(edge, ui, eps)
    acc += (h / 6) * (prev + 4 * speedAt(edge, ui - h / 2, eps) + cur)
    u.push(ui)
    s.push(acc)
    prev = cur
  }
  return { u, s }
}

/** Arc length between two parameters (Simpson on the speed, signed). */
function arcBetween(edge: ShapeHandle, u0: number, u1: number, panels: number): number {
  const table = cumulative(edge, u0, u1, panels)
  return table.s[table.s.length - 1]!
}

/**
 * Invert `s ↦ u` on a cumulative table by bisection.
 *
 * `cumulative()` signs `s` by the direction it walked (`anchor → other`), so the
 * table **falls** when the walk goes backwards. Normalise the sign first: the
 * whole routine then works in the "s rises with index" convention, and forgetting
 * this is what makes a negative-distance frame land at the wrong parameter
 * (silently — the frame is still orthonormal and still on the curve).
 */
function invertTable(
  edge: ShapeHandle,
  table: { u: number[]; s: number[] },
  target: number,
): number {
  const sEnd = table.s[table.s.length - 1]!
  const sgn = sEnd >= 0 ? 1 : -1
  const S = table.s.map((v) => v * sgn)
  const T = target * sgn
  if (T > S[S.length - 1]! * (1 + 1e-12) || T < S[0]!) {
    throw new Error(
      `[cq-compat] locationAt: distance ${target} is outside the curve's span ` +
        `[${S[0]}, ${S[S.length - 1]}]`,
    )
  }
  let lo = 0
  let hi = S.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (S[mid]! <= T) lo = mid
    else hi = mid
  }
  let uLo = table.u[lo]!
  let uHi = table.u[hi]!
  const sLo = S[lo]!
  for (let i = 0; i < 60; i++) {
    const mid = (uLo + uHi) / 2
    if (sLo + arcBetween(edge, table.u[lo]!, mid, 4) * sgn < T) uLo = mid
    else uHi = mid
  }
  return (uLo + uHi) / 2
}

/**
 * Parameter at signed arc length `s` from `first` (negative `s` goes backwards,
 * as upstream's `GCPnts_AbscissaPoint` does).
 */
function paramAtArcLength(edge: ShapeHandle, s: number, first: number, last: number): number {
  if (s >= 0) {
    return invertTable(edge, cumulative(edge, first, last, 128), s)
  }
  if (!ck().curveIsPeriodic(edge)) {
    throw new Error(
      `[cq-compat] locationAt: negative distance ${s} is only defined on a periodic curve ` +
        `(this spine is open; its parameter span starts at ${first})`,
    )
  }
  // Periodic: the span below `first` is the same curve, reached on the negative side.
  return invertTable(edge, cumulative(edge, first, first - (last - first), 128), s)
}

/**
 * CadQuery `Edge.locationAt(d)` / `Wire.locationAt(d)` — the moving frame at a
 * normalised distance `d` along the curve (`d` is a fraction of the curve's
 * total length; negative goes backwards from the start).
 *
 * @param edge - a single kernel edge handle
 * @param d - signed normalised distance along the curve
 * @returns the frame as a row-major 3×4 affine (kernel `transform` layout)
 */
export function locationAtFrame(edge: ShapeHandle, d: number): Affine34 {
  const k = ck()
  const { first, last } = k.curveParameters(edge)
  const total = k.curveLength(edge)
  const param = paramAtArcLength(edge, total * d, first, last)

  const pnt = k.curvePointAtParam(edge, param)
  const tangent = unit(k.curveTangent(edge, param))

  // Frenet normal = unit curvature direction dT/ds. The kernel exposes only the
  // first derivative, so difference the unit tangent. `eps` is scaled to the
  // span and clamped so both samples stay in the domain for a seam-side frame.
  const span = last - first
  const room = Math.min(param - first, last - param)
  const eps = room > 0 ? Math.min(span * 1e-4, room / 4) : span * 1e-4
  const normal = unit(
    sub(k.curveTangent(edge, param + eps), k.curveTangent(edge, param - eps)),
  )
  const binormal = cross(tangent, normal)
  return [
    normal.x, binormal.x, tangent.x, pnt.x,
    normal.y, binormal.y, tangent.y, pnt.y,
    normal.z, binormal.z, tangent.z, pnt.z,
  ]
}

/** 3×3 identity in row-major order. */
export const IDENTITY3: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * CadQuery `Location(x, y, z, rx, ry, rz)` rotation matrix —
 * `gp_Quaternion::SetEulerAngles(gp_Extrinsic_XYZ, …)`, i.e. an **extrinsic**
 * X→Y→Z composition `R = Rz · Ry · Rx`.
 *
 * This is NOT what `THREE.Euler(order = 'XYZ')` builds (`Rx · Ry · Rz`), which is
 * why {@link composeAffine34} multiplies the matrices here instead of routing a
 * rotation through `rotateBrep`. With `rz = 0` the two agree; with both `rx` and
 * `ry` non-zero they do not — and `text(..., planar=True)` uses exactly that pair
 * (`moved(rx=-90, ry=-90)`), so the distinction is load-bearing.
 *
 * @param rx - rotation about X, degrees
 * @param ry - rotation about Y, degrees
 * @param rz - rotation about Z, degrees
 * @returns row-major 3×3 rotation
 */
export function eulerExtrinsicXYZ(rx: number, ry: number, rz: number): number[] {
  const toRad = Math.PI / 180
  const a = rx * toRad
  const b = ry * toRad
  const c = rz * toRad
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  const cc = Math.cos(c)
  const sc = Math.sin(c)
  return [
    cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca,
  ]
}

/**
 * Compose `frame ∘ rotate ∘ translate(-offset)` into one row-major 3×4 affine —
 * `p ↦ M·R·(p − t) + pnt`, matching upstream's
 * `shape.moved(-pos).moved(rx, ry).moved(frame)`. Each OCCT `Moved` composes on
 * the world side, so the source-order left-most transform is applied first.
 *
 * @param frame - the 3×4 from {@link locationAtFrame}
 * @param rot - row-major 3×3 rotation, or `null` for identity
 * @param offset - the translation removed before rotating (`moved(-pos)`)
 * @returns row-major 3×4 affine
 */
export function composeAffine34(frame: Affine34, rot: number[] | null, offset: Vec3): Affine34 {
  const r = rot ?? IDENTITY3
  const A: number[] = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      A.push(
        frame[i * 4]! * r[j]! + frame[i * 4 + 1]! * r[3 + j]! + frame[i * 4 + 2]! * r[6 + j]!,
      )
    }
  }
  const b = [0, 1, 2].map(
    (i) =>
      frame[i * 4 + 3]! -
      (A[i * 3]! * offset.x + A[i * 3 + 1]! * offset.y + A[i * 3 + 2]! * offset.z),
  )
  return [A[0]!, A[1]!, A[2]!, b[0]!, A[3]!, A[4]!, A[5]!, b[1]!, A[6]!, A[7]!, A[8]!, b[2]!]
}
