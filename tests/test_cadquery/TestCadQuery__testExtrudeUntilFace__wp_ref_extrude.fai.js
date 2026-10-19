// source: test_cadquery.py::TestCadQuery::testExtrudeUntilFace (var wp_ref_extrude, FINAL value)
// wp_ref_extrude = Workplane("XY").box(10,10,10).center(20,0).box(10,10,10)
//                  .faces(">X[1]").workplane().rect(1,1).extrude(10)
// (the 2-box stage only — wp_ref was re-later re-assigned; this var was
// computed from the ORIGINAL two-box shape; '>X[1]' = x=5 face)
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane('XY'), 10, 10, 10)
let b2 = await cq.box(cq.center(b1, 20, 0), 10, 10, 10)
let f = cq.faces(b2, '>X[1]')
let w = await cq.workplane(f)
let r = cq.rect(w, 1, 1)
let wp_ref_extrude = await cq.extrude(r, 10)
let result = cq.val(wp_ref_extrude)
