// source: test_assembly.py::test_special_methods (var subshape_assy)
// fixture subshape_assy: cube_1 box(10,10,10) @ origin; cyl_1 cylinder(h=10, r=2.5) @ (0,0,-10)
// (the __dir__ / attribute asserts are not STEP-observable; only the compound is compared)
// ref anchor: vol=1196.349540849362
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 10, 10, 10)
let c1 = await cq.translate(cq.Workplane(), [0, 0, -10])
let p2 = await cq.cylinder(c1, 10, 2.5)
let result = cq.compound(cq.val(p1), cq.val(p2))
