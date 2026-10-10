// source: test_cadquery.py::TestCadQuery::testSphereCustom (var s)
// The plugin captures `locals()` at the END of the test, and `s` is REBOUND by
// the `product(...)` loop below the first `sphere(10, angle1=0, angle2=90,
// angle3=360, ...)` assignment — so the captured `s` is the LAST product combo,
// `Workplane().sphere(10, centered=(False, False, False))`, i.e. a PLAIN
// uncentred sphere. Hence no angle parameters are needed here (the
// narrow:sphere-angles label was stale for this var).
// faijs' `sphere()` is centred by default, so centered=[false,false,false]
// offsets the centre by (+r,+r,+r) along the local axes.
// ref anchor: vol=4188.790204786392 (=4/3*pi*10^3), com (10,10,10), f1/e3/v2
import * as cq from '@faicad/faijs-cadquery'
let s = await cq.sphere(cq.Workplane(), 10, { centered: [false, false, false] })
let result = cq.val(s)
