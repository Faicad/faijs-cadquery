// source: test_cadquery.py::TestCadQuery::testConstructionWire (var r)
// s = Workplane(Plane.YZ())
// r = s.rect(2.0, 2.0).rect(1.3, 1.3, forConstruction=True).vertices()
//      .circle(0.125).extrude(0.5)
// Outer 2x2 square profile extruded 0.5 with the four 0.125 circles (at the
// construction rect's vertices) cut out as holes: 6 box faces + 4 hole faces.
// The `pendingWires` LIST path handles the mixed construction/profile stack;
// the old "single pendingRect/pendingCircle slot" note in mark-blocked was
// stale (the LIST path landed with the nested-wire-extrude work).
// ref anchor: vol=1.9018252295753182 (=2*2*0.5 - 4*pi*0.125^2*0.5), f10/e24/v16
import * as cq from '@faicad/faijs-cadquery'
let s = cq.Workplane('YZ')
let w1 = cq.rect(s, 2.0, 2.0)
let w2 = cq.rect(w1, 1.3, 1.3, { forConstruction: true })
let v = cq.vertices(w2)
let c = cq.circle(v, 0.125)
let r = await cq.extrude(c, 0.5)
let result = cq.val(r)
