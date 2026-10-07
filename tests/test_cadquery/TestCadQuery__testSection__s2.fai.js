// source: test_cadquery.py::TestCadQuery::testSection (var s2)
// box = Workplane("XY", origin=(1, 2, 3)).box(1, 1, 1)
// s2  = box.section(0.5)         → plane offset +0.5 along +Z, i.e. z = 3.5
//       (exactly the box top face — upstream still reports area 1)
// NOTE: `Workplane(origin=...)` is not expressible here (gap U16), so the box is
// built at the origin and moved as a SOLID. `section` measures `height` from the
// workplane origin — (0,0,0) in that arrangement — so the equivalent slice is the
// absolute z = 3.5 (upstream's plane z=3 plus its 0.5 offset), not 0.5.
import * as cq from '@faicad/faijs-cadquery'
let p = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box = await cq.translate(p, [1, 2, 3])
let s2 = await cq.section(box, 3.5)
let result = cq.val(s2)
