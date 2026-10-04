// source: test_assembly.py::test_imprinting (var touching_assy)
// touching_assy fixture: b1 = Workplane().box(1,1,1)  (centred at origin)
//                         b2 = Workplane(origin=(1,0,0)).box(1,1,1)
// exported var = Assembly.toCompound() = compound of the two touching boxes.
// ref (cadquery 2.8.0): Compound, vol 2, bbox x[-0.5,1.5], com (0.5,0,0),
//   topo f12/e24/v16/s2.
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.translate(b1, [1, 0, 0])
let result = cq.compound(cq.val(b1), cq.val(b2))
