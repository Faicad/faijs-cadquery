// source: test_free_functions.py::test_draft (var res2)
// res2 = draft(box_shape, fbot, fside, (0,0,1), 5)   # explicit direction (0,0,1)
//
// Same box / face selection as test_draft__res1, but the pull is given explicitly as
// (0,0,1) instead of inferred — the opposite of the base face normal (0,0,-1), so the
// +X side face tilts the other way (top shrinks). The neutral plane is still z=0.
// ref anchor: vol 0.956255668237038 (= 1 - tan 5°·1), bb x[-0.5,0.5] y[-0.5,0.5] z[0,1], topo f6/e12/v8
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fbot = await cq.faces(b, '<Z')
let fside = await cq.faces(b, '>X')
let d = await cq.draft(b, fbot, fside, { x: 0, y: 0, z: 1 }, 5)
let result = cq.val(d)
