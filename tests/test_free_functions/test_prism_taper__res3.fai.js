// source: test_free_functions.py::test_prism_taper (var res3)
// res3 = prism(box_shape / c, ftop, c, box_shape.face("<Z"), additive=False)
//   — subtractive prism from ftop (z=1) to the <Z face plane (z=0): a full
//   through-hole of radius 0.2 along z.
// (box_shape / c: c is the 2D circle FACE on ftop — a zero-volume cut, so
//  the base solid is the plain box.)
// Measured 2026-10-19 (out/ref): 7 faces — 4 box sides + top/bottom with
// hole (area 1−π0.04 = 0.8743) + cylinder wall (2π0.21 = 1.2566);
// vol = 1 − π0.04·1 = 0.874354.
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fz = await cq.faces(base, '>Z')
let wz = await cq.workplane(fz)
let circ = cq.circle(wz, 0.2)
let res3 = await cq.cutBlind(circ, 'last')
let result = cq.val(res3)
