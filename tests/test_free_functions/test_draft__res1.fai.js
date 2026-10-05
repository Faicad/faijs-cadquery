// source: test_free_functions.py::test_draft (var res1)
// res1 = draft(box_shape, fbot, fside, 5)   # fbot = face("<Z"), fside = face("|X or |Y")
//
// `box(1,1,1)` here is `occ_impl.shapes.box` = BRepPrimAPI_MakeBox(Ax2((-0.5,-0.5,0),+Z),1,1,1)
//   => xy-CENTRED, base on z=0 (NOT z-centred).
// `face("|X or |Y")` selects ONE side face; the frozen ref capture used the +X face
//   (ref bbox xmax = 0.587488664 = 0.5 + tan 5°).
// Direction is inferred from the base face normal (0,0,-1); the neutral plane is the
//   base plane z=0 (through the origin) — which the kernel's origin-neutral reproduces.
// ref anchor: vol 1.0437443317629618, bb x[-0.5,0.587488664] y[-0.5,0.5] z[0,1], topo f6/e12/v8
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fbot = await cq.faces(b, '<Z')
let fside = await cq.faces(b, '>X')
let d = await cq.draft(b, fbot, fside, 5)
let result = cq.val(d)
