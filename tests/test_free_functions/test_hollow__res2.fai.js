// source: test_free_functions.py::test_hollow (var res2)
// res2 = hollow(box_shape, 0.1)  — walls outward, closed.
// Free `hollow` defaults kind='intersection' (shapes.py:7590 MakeThickSolidByJoin
// Intersection=True, Join=GeomAbs_Intersection). Implemented as outer offset
// (kernel.offset honours joinType) minus the original solid.
// ref (probed 2026-10-07): Solid, vol 0.728, 12 faces, e24/v16,
//   bbox [-0.6,0.6,-0.6,0.6,-0.1,1.1].
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let res2 = await cq.hollow(b0, 0.1)
let result = cq.val(res2)