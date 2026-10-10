// source: test_cadquery.py::TestCadQuery::testSphereCustom (var s0)
// s0 = Workplane().sphere(10, centered=False) — from the `for val in (True,
// False)` loop, captured at its LAST iteration (val=False). A plain sphere with
// a non-centred bbox placement (centre at (r,r,r)); NO angle params involved.
// ref anchor: vol=4188.790204786392, com (10,10,10), f1/e3/v2
import * as cq from '@faicad/faijs-cadquery'
let s0 = await cq.sphere(cq.Workplane(), 10, { centered: false })
let result = cq.val(s0)
