/**
 * Probe: can the raw occt-wasm kernel express a "tall" ellipse (major axis NOT
 * on the plane's X direction)?
 *
 * `kernel:ellipse-tall-axis` / `TestCQSelectors::testEdgeTypesFilter__c`.
 * `workplane.ts::buildProfileWire` throws for `ellipse(x_radius, y_radius)` with
 * `y_radius > x_radius`:
 *
 *   "[cq-compat] ellipse: y_radius > x_radius is not reproducible (kernel
 *    ellipse is always major-on-X and rotations re-approximate it)"
 *
 * Both halves of that claim are probed here, because both turn out wrong:
 *
 *   A. "always major-on-X" — only true for a ±Z normal. `makeEllipseEdge` builds
 *      `gp_Ax2(center, normal)`, whose default X direction depends on the normal
 *      (the table below maps it). So the axis is NOT pinned to global X.
 *   B. "rotations re-approximate it" — a rigid `rotate` (gp_Trsf) keeps the
 *      analytic ellipse: `curveType()` still reports "ellipse", the bbox stays
 *      exact, and the extruded volume is π·major·minor to machine precision.
 *      What degraded the ellipse before was the *matrix* path
 *      (`transform`/`generalTransform`), which converts to a B-spline.
 *
 * Ground truth (one-shot capture of the upstream case, ref STEP
 * tests.test_selectors__TestCQSelectors__testEdgeTypesFilter__c):
 *   ellipse(3, 4).circle(1).extrude(1) -> vol 34.5575191895 (= π(3·4 − 1)),
 *   bbox x[-3,3] y[-4,4] z[0,1], topo f4/e6/v4/s1.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { setupNativeKernel } from './gear-test-harness'

interface V3 {
  x: number
  y: number
  z: number
}
interface BBox {
  xmin: number
  ymin: number
  zmin: number
  xmax: number
  ymax: number
  zmax: number
}
interface ProbeKernel {
  makeEllipseEdge: (center: V3, normal: V3, major: number, minor: number) => unknown
  makeCircleEdge: (center: V3, normal: V3, radius: number) => unknown
  makeWire: (edges: unknown[]) => unknown
  makeFace: (wire: unknown) => unknown
  addHolesInFace: (face: unknown, holes: unknown[]) => unknown
  extrude: (shape: unknown, dx: number, dy: number, dz: number) => unknown
  rotate: (shape: unknown, axis: { point: V3; direction: V3 }, angleRad: number) => unknown
  getBoundingBox: (shape: unknown) => BBox
  getVolume: (shape: unknown) => number
  curveType: (edge: unknown) => string
  curveParameters: (edge: unknown) => { first: number; last: number }
  curvePointAtParam: (edge: unknown, t: number) => V3
}

function k(): ProbeKernel {
  return getKernel() as unknown as ProbeKernel
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z)
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: V3): V3 => {
  const n = len(a)
  return v(a.x / n, a.y / n, a.z / n)
}
/** Signed angle from `a` to `b` about `axis` (both must be ⊥ axis). */
function signedAngle(a: V3, b: V3, axis: V3): number {
  return Math.atan2(dot(axis, cross(a, b)), dot(a, b))
}
/** Exact major-axis direction of an OCC ellipse edge: param `first` sits on it. */
function majorDir(kk: ProbeKernel, edge: unknown, center: V3): V3 {
  const { first: t0 } = kk.curveParameters(edge)
  return unit(sub(kk.curvePointAtParam(edge, t0), center))
}

const rows: string[] = []
function note(s: string): void {
  rows.push(s)
}

beforeAll(async () => {
  await setupNativeKernel()
})

describe('probe: tall ellipse (major axis off the plane X direction)', () => {
  it('kernel axis table + rotation route are exact', () => {
    const kk = k()
    const c = v(0, 0, 0)

    // ---- A. Where does the major axis land, per normal? ----
    // The old note claimed "major-on-global-X". It is major-on-gp_Ax2(centre,
    // normal)'s DEFAULT X, which depends on the normal. Only the ±Z rows agree
    // with global X; ±X/±Y give ±Z, and oblique normals give their own frame.
    const normals: Array<[string, V3, V3]> = [
      ['+X', v(1, 0, 0), v(0, 0, 1)],
      ['-X', v(-1, 0, 0), v(0, 0, -1)],
      ['+Y', v(0, 1, 0), v(0, 0, 1)],
      ['-Y', v(0, -1, 0), v(0, 0, -1)],
      ['+Z', v(0, 0, 1), v(1, 0, 0)],
      ['-Z', v(0, 0, -1), v(-1, 0, 0)],
      ['(1,1,0)', unit(v(1, 1, 0)), unit(v(1, -1, 0))],
      ['(1,1,1)', unit(v(1, 1, 1)), unit(v(1, 0, -1))],
    ]
    for (const [label, n, expected] of normals) {
      const e = kk.makeEllipseEdge(c, n, 4, 3)
      const d = majorDir(kk, e, c)
      note(`A  normal=${label.padEnd(8)} majorDir=(${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}) type=${kk.curveType(e)}`)
      expect(len(sub(d, expected))).toBeLessThan(1e-12)
      expect(kk.curveType(e)).toBe('ellipse')
    }

    // ---- B. major < minor is rejected outright ----
    expect(() => kk.makeEllipseEdge(c, v(0, 0, 1), 3, 4)).toThrow(/invalid construction parameters/)

    // ---- C. Rigid-rotate the wide edge 90° about Z into a TALL ellipse ----
    // Exactness, three ways: still an analytic ellipse, exact bbox, exact volume.
    const wide = kk.makeEllipseEdge(c, v(0, 0, 1), 4, 3)
    const tall = kk.rotate(wide, { point: c, direction: v(0, 0, 1) }, Math.PI / 2)
    expect(kk.curveType(tall)).toBe('ellipse')
    expect(bbox(kk.getBoundingBox(tall))).toBe('x[-3,3] y[-4,4] z[0,0]')
    const solid = kk.extrude(kk.makeFace(kk.makeWire([tall])), 0, 0, 1)
    expect(kk.getVolume(solid) / (Math.PI * 12)).toBeCloseTo(1, 14)

    // The real case: the elliptical face with the r=1 hole punched out the way
    // the port does it (`addHolesInFace`, not one two-loop wire — a shared wire
    // would ADD the hole area because both loops carry the same orientation).
    const holed = kk.addHolesInFace(
      kk.makeFace(kk.makeWire([tall])),
      [kk.makeWire([kk.makeCircleEdge(c, v(0, 0, 1), 1)])],
    )
    const solid2 = kk.extrude(holed, 0, 0, 1)
    expect(kk.getVolume(solid2)).toBeCloseTo(34.5575191895, 9)
    expect(bbox(kk.getBoundingBox(solid2))).toBe('x[-3,3] y[-4,4] z[0,1]')

    // ---- D. Same route on an OBLIQUE plane: are the axes exactly honoured? ----
    // Rotating onto +Y must land the major endpoint exactly on 4·yDir; the minor
    // endpoint lands on −xDir (fine — ±xDir is the same line, radius 3).
    const nObl = unit(v(1, 1, 1))
    const xObl = unit(cross(nObl, v(0, 0, 1)))
    const yObl = cross(nObl, xObl)
    const eObl = kk.makeEllipseEdge(c, nObl, 4, 3)
    const ang = signedAngle(majorDir(kk, eObl, c), yObl, nObl)
    const tallObl = kk.rotate(eObl, { point: c, direction: nObl }, ang)
    expect(kk.curveType(tallObl)).toBe('ellipse')
    const { first: t0, last: t1 } = kk.curveParameters(tallObl)
    const pMajor = kk.curvePointAtParam(tallObl, t0)
    const pMinor = kk.curvePointAtParam(tallObl, t0 + (t1 - t0) / 4)
    const errMajor = len(sub(pMajor, v(4 * yObl.x, 4 * yObl.y, 4 * yObl.z)))
    const errMinor = Math.abs(len(pMinor) - 3)
    note(
      `D  oblique(1,1,1): type=${kk.curveType(tallObl)} |4·yDir - P(t0)|=${errMajor.toExponential(2)} ` +
        `|minor radius - 3|=${errMinor.toExponential(2)}`,
    )
    expect(errMajor).toBeLessThan(1e-12)
    expect(errMinor).toBeLessThan(1e-12)

    console.log('\n' + rows.join('\n') + '\n')
  })
})

function bbox(b: BBox): string {
  // Round to 1e-9 and drop trailing zeros so the expectation strings stay short
  // (all the values here are exact integers).
  const f = (x: number): string => String(Number(x.toFixed(9)))
  return `x[${f(b.xmin)},${f(b.xmax)}] y[${f(b.ymin)},${f(b.ymax)}] z[${f(b.zmin)},${f(b.zmax)}]`
}
