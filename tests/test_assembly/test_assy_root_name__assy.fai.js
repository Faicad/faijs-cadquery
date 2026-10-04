// source: test_assembly.py::test_assy_root_name (var nested_assy)
// fixture nested_assy: b1 box(1,1,1) @ root loc (0,0,0) name TOP;
//   b2 box(1,1,1) @ (0,4,0) name SECOND; b3 pushPoints([(-2,0),(2,0)]).box(1,1,0.5)
//   @ loc (0,4,0) under SECOND -> centres (-2,8,0) and (2,8,0)
// (the toCAF root-name assert is not STEP-observable; the harness exports the compound)
// ref anchor: vol=3.000000000000001
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 1, 1, 1)
let b2 = await cq.translate(cq.Workplane(), [0, 4, 0])
let p2 = await cq.box(b2, 1, 1, 1)
let b3a = await cq.translate(cq.Workplane(), [-2, 8, 0])
let p3 = await cq.box(b3a, 1, 1, 0.5)
let b3b = await cq.translate(cq.Workplane(), [2, 8, 0])
let p4 = await cq.box(b3b, 1, 1, 0.5)
let result = cq.compound(cq.val(p1), cq.val(p2), cq.val(p3), cq.val(p4))
