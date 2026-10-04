// source: test_assembly.py::test_colors_assy1 (var assy)
// ref resolved to fixture multi_subshape_assy (vol 1124.9999999999998 matches exactly):
//   cube_1 box(10,10,10) @ origin; cube_2 box(5,5,5) @ loc (10,10,10)
// (the colour/loc/name round-trip asserts are not STEP-observable; only the compound is compared)
// ref anchor: vol=1124.9999999999998
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 10, 10, 10)
let b2 = await cq.translate(cq.Workplane(), [10, 10, 10])
let p2 = await cq.box(b2, 5, 5, 5)
let result = cq.compound(cq.val(p1), cq.val(p2))
