// source: test_cadquery.py::TestCadQuery::testSimpleShell (var s3)
// s3 = Workplane().ellipse(4, 2).extrude(4).faces(">Z").shell(+2, kind="arc")
// Elliptical prism, top face removed, 2 mm walls with the rounded (arc) join
// (Workplane.shell default kind). kernel.shell(solid, [top], -2, 1e-3, Arc).
// ref (probed 2026-10-07): Solid, vol 332.59716178407103, 6 faces, e8/v5,
//   bbox [-6,6,-4,4,-2,4].
import * as cq from '@faicad/faijs-cadquery'
let w1 = await cq.ellipse(cq.Workplane('XY'), 4, 2)
let w2 = await cq.extrude(w1, 4)
let w3 = await cq.faces(w2, '>Z')
let s3 = await cq.shell(w3, 2)
let result = cq.val(s3)