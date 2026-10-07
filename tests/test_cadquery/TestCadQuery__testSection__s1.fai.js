// source: test_cadquery.py::TestCadQuery::testSection (var s1)
// box = Workplane("XY", origin=(1, 2, 3)).box(1, 1, 1)
// s1  = box.section()            → plane through the workplane origin, z = 3
// NOTE: `Workplane(origin=...)` is not expressible here (gap U16), so the box is
// built at the origin and moved as a SOLID. `section` measures `height` from the
// workplane origin — (0,0,0) in that arrangement — so the equivalent slice is the
// absolute z = 3, not the default 0.
import * as cq from '@faicad/faijs-cadquery'
let p = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box = await cq.translate(p, [1, 2, 3])
let s1 = await cq.section(box, 3)
let result = cq.val(s1)
