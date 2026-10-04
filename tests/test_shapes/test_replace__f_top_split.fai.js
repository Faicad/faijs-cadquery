// source: test_shapes.py::test_replace (var f_top_split, FINAL value)
// f_top = b.faces(">Z")
// f_top_split = f_top / plane(0.5, 0.5).moved(f_top.Center())
//   -> top face (1x1 @ z=1) split by a 0.5x0.5 region at its centre:
//      2 faces (inner 0.5x0.5 square + surrounding frame).
// ref (cadquery 2.8.0): Compound of 2 faces, vol 0, bbox z=1, topo f2/e12/v12.
import * as cq from '@faicad/faijs-cadquery'
let bWp = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })
let topFace = cq.val(cq.faces(bWp, '>Z'))
let planeFace = cq.faceMakePlane(0.5, 0.5, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, 1)
let result = cq.splitShapeBy(topFace, planeFace)
