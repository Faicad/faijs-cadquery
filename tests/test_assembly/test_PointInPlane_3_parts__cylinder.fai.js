// source: test_assembly.py::test_PointInPlane_3_parts (var cylinder)
// The fixture's cylinder member (circle(0.1).extrude(2)) exported at its
// construction pose — ref probe shows z[0,2] (pre-solve location), i.e. the
// standalone cylinder object, not the assembled placement.
// ref (cadquery 2.8.0 probe): Solid vol 0.0628319 bbox x/y ±0.1 z[0,2].
import * as cq from '@faicad/faijs-cadquery'
let cylWp = await cq.circle(cq.Workplane('XY'), 0.1)
let cyl = await cq.extrude(cylWp, 2)
let result = cq.val(cyl)
