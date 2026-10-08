// source: tests.test_cadquery::TestCadQuery::testParametricCurve (var res_closed)
//   k = 4; r = 1
//   func = lambda t: (r*(k+1)*cos(t) - r*cos((k+1)*t), r*(k+1)*sin(t) - r*sin((k+1)*t))
//   res_closed = Workplane("XY").parametricCurve(func, start=0, stop=2*pi).extrude(3)
//   -> closed profile yields a valid solid with 3 faces (1 side + 2 end caps)
import * as cq from '@faicad/faijs-cadquery'
const k = 4
const r = 1
const func = (t) => [
  r * (k + 1) * Math.cos(t) - r * Math.cos((k + 1) * t),
  r * (k + 1) * Math.sin(t) - r * Math.sin((k + 1) * t),
]
let wp = cq.Workplane('XY')
let curve = await cq.parametricCurve(wp, func, { start: 0, stop: 2 * Math.PI })
let res = await cq.extrude(curve, 3)
let result = cq.val(res)
