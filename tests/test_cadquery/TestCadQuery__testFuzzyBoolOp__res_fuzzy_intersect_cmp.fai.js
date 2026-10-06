// source: test_cadquery.py::TestCadQuery::testFuzzyBoolOp (var res_fuzzy_intersect_cmp)
// box1_cmp = Compound.makeCompound(box1.vals())
// res_fuzzy_intersect_cmp = box1_cmp.intersect(box4_cmp, tol=1e-3)
// ref (cadquery 2.8.0): vol 1.0 — same as res_fuzzy_intersect but through
// compound wrappers. Compounds are inlined into the consuming Workplane call
// (mirror discipline: bare intermediate shapes are never terminals).
import * as cq from '@faicad/faijs-cadquery'
let box1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b4 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box4 = await cq.translate(b4, [1e-3, 0, 0])
let res_fuzzy_intersect_cmp = await cq.intersect(cq.Workplane(cq.compound(cq.val(box1))), cq.Workplane(cq.compound(cq.val(box4))), { tol: 1e-3 })
let result = cq.val(res_fuzzy_intersect_cmp)
