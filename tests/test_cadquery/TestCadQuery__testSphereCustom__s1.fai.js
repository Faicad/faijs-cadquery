// source: test_cadquery.py::TestCadQuery::testSphereCustom (var s1)
// s1 = Workplane().sphere(10, centered=(False, False, False)) — the tuple form
// asserted equivalent to `centered=False` (s0), captured at the loop's last
// iteration (val=False). A plain sphere; NO angle params involved.
// ref anchor: vol=4188.790204786392, com (10,10,10), f1/e3/v2
import * as cq from '@faicad/faijs-cadquery'
let s1 = await cq.sphere(cq.Workplane(), 10, { centered: [false, false, false] })
let result = cq.val(s1)
