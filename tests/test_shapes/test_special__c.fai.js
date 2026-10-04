// source: test_shapes.py::test_special (var c)
// c = compound(box(1, 1, 1), box(2, 2, 2), box(3, 3, 3))
// GOTCHA: the free-function `box` imported here is `occ_impl.shapes.box`
// (== Solid.makeBox): xy-centred with its base on z=0 — NOT z-centred.
// Probe-verified: solids bb z[0,1] / z[0,2] / z[0,3], com z = 49/36 = 1.3611.
// (the isinstance asserts are non-geometry; only the compound is compared)
// ref anchor: vol 36, com (0,0,1.36111), bb x[-1.5,1.5] y[-1.5,1.5] z[0,3], f18/e36/v24
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let b2 = await cq.box(cq.Workplane(), 2, 2, 2, { centered: [true, true, false] })
let b3 = await cq.box(cq.Workplane(), 3, 3, 3, { centered: [true, true, false] })
let result = cq.compound(cq.val(b1), cq.val(b2), cq.val(b3))
