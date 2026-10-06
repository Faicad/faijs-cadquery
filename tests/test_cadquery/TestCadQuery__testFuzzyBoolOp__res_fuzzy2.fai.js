// source: test_cadquery.py::TestCadQuery::testFuzzyBoolOp (var res_fuzzy2)
// res_fuzzy2 = box1.union(box3).union(box2, tol=1e-3)
// ref (cadquery 2.8.0): vol 3.0, 1 solid (plain fuse box1+box3, then fuzzy
// union with the eps-overlapping box2).
import * as cq from '@faicad/faijs-cadquery'
let box1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b3 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box3 = await cq.translate(b3, [2, 0, 0])
let b2 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box2 = await cq.translate(b2, [1 + 1e-3, 0, 0])
let first = await cq.union(box1, box3)
let res_fuzzy2 = await cq.union(first, box2, { tol: 1e-3 })
let result = cq.val(res_fuzzy2)
