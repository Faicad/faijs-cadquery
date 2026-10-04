// source: test_shapes.py::test_replace (var b, FINAL value)
// b = box(1, 1, 1)  — cadquery.occ_impl.shapes.box, a unit cube with one
// corner at the origin (z[0,1], com (0,0,0.5)).
// ref (cadquery 2.8.0): Solid, vol 1, com (0,0,0.5), topo f6/e12/v8.
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })
let result = cq.val(b)
