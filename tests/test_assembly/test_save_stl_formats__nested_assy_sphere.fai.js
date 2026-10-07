// source: test_assembly.py::test_save_stl_formats (var nested_assy_sphere)
// fixture nested_assy_sphere: b1 box(1,1,1) @ root loc (0,0,0) name TOP;
//   b2 box(1,1,1) @ (0,4,0) name SECOND; b3 = pushPoints([(-2,0),(2,0)]).sphere(1)
//   @ loc (0,4,0) under SECOND -> sphere centres (-2,8,0) and (2,8,0)
// Upstream asserts the STL file exists (binary then ASCII) and that reading the
// binary file as text raises UnicodeDecodeError. Mesh format/appending is not
// STEP-observable, so — same convention as test_export__nested_assy — the
// mirror captures the fixture compound the harness exports.
// ref anchor: vol = 1 + 1 + 2*(4/3*pi) = 10.37758040957278
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 1, 1, 1)
let b2 = await cq.box(cq.Workplane(), 1, 1, 1)
let p2 = await cq.translate(b2, [0, 4, 0])
let s1 = await cq.sphere(cq.Workplane(), 1)
let p3 = await cq.translate(s1, [-2, 8, 0])
let s2 = await cq.sphere(cq.Workplane(), 1)
let p4 = await cq.translate(s2, [2, 8, 0])
let result = cq.compound(cq.val(p1), cq.val(p2), cq.val(p3), cq.val(p4))
