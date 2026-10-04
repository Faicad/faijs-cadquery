// source: test_cadquery.py::TestCadQuery::testCopyWorkplane (var obj1)
// obj0 = Workplane("XY").box(1, 1, 10).faces(">Z").workplane()
// obj1 = Workplane("XY").copyWorkplane(obj0).box(1, 1, 1)
// upstream exports obj1.val() — a 1×1×1 box centred at (0,0,5)
// (the 1×1×10 base is NOT carried; copyWorkplane drops the stack).
// ref (cadquery 2.8.0): Solid, vol 1, bbox z∈[4.5,5.5], centre (0,0,5).
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.box(cq.Workplane('XY'), 1, 1, 10)
let topFace = await cq.faces(b0, '>Z')
let obj0wp = await cq.workplane(topFace)
let obj1 = await cq.copyWorkplane(cq.Workplane('XY'), obj0wp)
let obj1box = await cq.box(obj1, 1, 1, 1)
let result = cq.val(obj1box)
