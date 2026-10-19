// source: test_cadquery.py::TestCadQuery::testExtrudeUntilFace (var part, FINAL value)
// I-beam (flange 10×1×1, web 1×1×10, top flange) + circle(0.4) at (3,0) on the
// base plane z=0 (INSIDE the bottom flange) extrude('next'): the in-solid
// profile skips the exit face and extrudes to the top flange's bottom face.
import * as cq from '@faicad/faijs-cadquery'
let t = cq.tag(cq.Workplane(), 'base')
let f1 = await cq.box(t, 10, 1, 1)
// The .fai.js restricted subset: no inline `await` in call arguments —
// hoist each awaited call into its own let. `top` is also a SEC_IDENT-
// forbidden identifier (host runtime global) — use topF.
let wf = await cq.workplane(cq.faces(f1, '>Z'))
let web = await cq.box(wf, 1, 1, 10, { centered: [true, true, false] })
let wt = await cq.workplane(cq.faces(web, '>Z'))
let topF = await cq.box(wt, 10, 1, 1, { centered: [true, true, false] })
let back = cq.workplaneFromTagged(topF, 'base')
let c = cq.center(back, 3, 0)
let circ = cq.circle(c, 0.4)
let part = await cq.extrude(circ, 'next')
let result = cq.val(part)
