// source: test_assembly.py::test_constraint_validation (var simple_assy2)
// fixture simple_assy2: b1 box(1,1,1) @ origin; b2 box(2,1,1) @ loc (0,0,4)
// (the pytest.raises branch never reaches the exporter; only the fixture compound is captured)
// ref anchor: vol=2.9999999999999996
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 1, 1, 1)
let b2 = await cq.translate(cq.Workplane(), [0, 0, 4])
let p2 = await cq.box(b2, 2, 1, 1)
let result = cq.compound(cq.val(p1), cq.val(p2))
