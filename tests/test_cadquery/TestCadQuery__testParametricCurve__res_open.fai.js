// source: tests.test_cadquery::TestCadQuery::testParametricCurve (var res_open)
//   k = 4; r = 1
//   func = lambda t: (r*(k+1)*cos(t) - r*cos((k+1)*t), r*(k+1)*sin(t) - r*sin((k+1)*t))
//   res_open = Workplane("XY").parametricCurve(func).extrude(3)
//   -> open profile generates an INVALID solid (upstream assertFalse isValid())
//   NOTE: because the result is non-manifold, the candidate STEP export is
//   expected to be degenerate; the logical assertion is frozen in
//   src/parametric-curve.test.ts, not in STEP topology comparison.
import * as cq from '@faicad/faijs-cadquery'
const k = 4
const r = 1
const func = (t) => [
  r * (k + 1) * Math.cos(t) - r * Math.cos((k + 1) * t),
  r * (k + 1) * Math.sin(t) - r * Math.sin((k + 1) * t),
]
let wp = cq.Workplane('XY')
let curve = await cq.parametricCurve(wp, func)
let res = await cq.extrude(curve, 3)
let result = cq.val(res)
