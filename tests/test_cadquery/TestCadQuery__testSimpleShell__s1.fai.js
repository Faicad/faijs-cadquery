// source: test_cadquery.py::TestCadQuery::testSimpleShell (var s1)
// s1 = Workplane("XY").box(2, 2, 2).faces("+Z").shell(0.05)
// Open the +Z face and grow a 0.05 wall OUTWARD (kind defaults to 'arc' for
// Workplane.shell). kernel.shell(solid, [top], -0.05, 1e-3, Arc).
// ref (probed 2026-10-07): Solid, vol 1.0316777267316828, 23 faces, e48/v28,
//   bbox [-1.05,1.05,-1.05,1.05,-1.05,1.0].
import * as cq from '@faicad/faijs-cadquery'
let w1 = await cq.box(cq.Workplane('XY'), 2, 2, 2, { centered: [true, true, true] })
let w2 = await cq.faces(w1, '+Z')
let s1 = await cq.shell(w2, 0.05)
let result = cq.val(s1)