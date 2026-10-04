// source: test_assembly.py::test_imprinting (var s, FINAL value)
// s = the second box of disjoint_assy, located at origin=(2,0,0): a single
// unit box spanning x[1.5,2.5], com (2,0,0).
// ref (cadquery 2.8.0): Solid, vol 1, topo f6/e12/v8/s1.
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.translate(b1, [2, 0, 0])
let result = cq.val(b2)
