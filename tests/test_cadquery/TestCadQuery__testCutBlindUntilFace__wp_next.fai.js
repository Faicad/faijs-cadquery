// source: test_cadquery.py::TestCadQuery::testCutBlindUntilFace (var wp_next, FINAL value)
// Same wp_ref as the wp_last sibling (3D pushPoints z=5 via workplane offset);
// cutBlind("next") — cuts to the NEAREST face, leaving a larger remaining
// volume (upstream: vol(wp_last) < vol(wp_next)).
import * as cq from '@faicad/faijs-cadquery'
let bar = await cq.box(cq.Workplane('XY'), 40, 10, 2)
let up = await cq.workplane(bar, { offset: 5 })
let pp = cq.pushPoints(up, [[-20, 0], [0, 0], [20, 0]])
let wp_ref = await cq.box(pp, 10, 10, 10)
let f4 = cq.faces(wp_ref, '>X[4]')
let w = await cq.workplane(f4, { centerOption: 'CenterOfMass' })
let r = cq.rect(w, 2, 2)
let wp_next = await cq.cutBlind(r, 'next')
let result = cq.val(wp_next)
