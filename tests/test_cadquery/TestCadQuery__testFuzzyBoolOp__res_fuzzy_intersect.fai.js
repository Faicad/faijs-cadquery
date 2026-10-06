// source: test_cadquery.py::TestCadQuery::testFuzzyBoolOp (var res_fuzzy_intersect)
// res_fuzzy_intersect = box1.intersect(box4, tol=1e-3)
//   where box4 = Workplane("XY", origin=(1e-3, 0, 0)).box(1, 1, 1)
// ref (cadquery 2.8.0): vol 1.0 — fuzzy intersect treats the eps-shifted face
// as coincident, so the whole box1 survives.
import * as cq from '@faicad/faijs-cadquery'
let box1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b4 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box4 = await cq.translate(b4, [1e-3, 0, 0])
let res_fuzzy_intersect = await cq.intersect(box1, box4, { tol: 1e-3 })
let result = cq.val(res_fuzzy_intersect)
