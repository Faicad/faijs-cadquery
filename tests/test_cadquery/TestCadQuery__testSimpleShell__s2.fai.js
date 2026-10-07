// source: test_cadquery.py::TestCadQuery::testSimpleShell (var s2)
// s2 = Workplane().ellipse(4, 2).extrude(4).faces(">Z").shell(+2, kind="intersection")
// Elliptical prism, top face removed, 2 mm walls built with the SHARP
// (intersection) join. kernel.shell(solid, [top], -2, 1e-3, JoinType.Intersection).
// ref (probed 2026-10-07): Solid, vol 357.3076723502981, 5 faces, e6/v4,
//   bbox [-6,6,-4,4,-2,4].
import * as cq from '@faicad/faijs-cadquery'
let w1 = await cq.ellipse(cq.Workplane('XY'), 4, 2)
let w2 = await cq.extrude(w1, 4)
let w3 = await cq.faces(w2, '>Z')
let s2 = await cq.shell(w3, 2, 'intersection')
let result = cq.val(s2)