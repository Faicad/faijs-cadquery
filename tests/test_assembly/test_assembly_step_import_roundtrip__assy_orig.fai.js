// source: test_assembly.py::test_assembly_step_import_roundtrip (var assy_orig)
// Parametrized over [subshape_assy, boxes0_assy, nested_assy, simple_assy] x
// [step, xml, xbf]; the ref harness captured the LAST combination
// (kind=xbf, assy_orig="simple_assy") -> vol 9. `getfixturevalue("simple_assy")`
// returns the fixture below, inlined (the ORIGINAL var has no round trip —
// it is the pre-export assembly, so it equals test_assembly__simple_assy):
//   b1 = Solid.makeBox(1,1,1) @ loc (2,-5,0)  [corner box -> centre (2.5,-4.5,0.5)]
//   b2 = Workplane().box(1,1,2) @ loc (1,1,0), root loc folds in -> centre (3,-4,0)
//   b3 = pushPoints([(0,0),(-2,-5)]).box(1,1,3) @ loc (2,3,0), root loc folds in
//        -> centres (4,-2,0) and (2,-7,0)
// faijs' `box()` is xy-centred, so each part is translated to its absolute centre.
// ref anchor: vol=9, com (2.9444,-4.3889,0.05556), topo f24/e48/v32/s4
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane(), 1, 1, 1)
let p1 = await cq.translate(b1, [2.5, -4.5, 0.5])
let b2 = await cq.box(cq.Workplane(), 1, 1, 2)
let p2 = await cq.translate(b2, [3, -4, 0])
let b3a = await cq.box(cq.Workplane(), 1, 1, 3)
let p3 = await cq.translate(b3a, [4, -2, 0])
let b3b = await cq.box(cq.Workplane(), 1, 1, 3)
let p4 = await cq.translate(b3b, [2, -7, 0])
let result = cq.compound(cq.val(p1), cq.val(p2), cq.val(p3), cq.val(p4))
