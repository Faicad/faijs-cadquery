// source: test_free_functions.py::test_prism_taper (var res5)
// res5 = prism(box_shape, None, circle(0.2).moved(z=0.5),
//              (face("<Z"), face(">Z")), 5, False)
//   — subtractive from/to-face prism with taper=5°: a BI-CONE through-hole
//   centred on the profile plane z=0.5 (radius 0.2); end radii on the
//   z=0 / z=1 planes:
//     z=0: 0.2 + 0.5·tan(5°) = 0.24374433
//     z=1: 0.2 − 0.5·tan(5°) = 0.15625567
// Measured 2026-10-19 (out/ref): 12 faces — 4 box sides + top/bottom with
// hole (0.9233 / 0.8134) + 6 cone faces (the ref's BRepFeat_MakeDPrism
// splits each conical half into 3 patches; our whole-cone cut gives 8);
// vol = 1 − two frusta = 0.872338.
// Our until=face path rejects taper (kernel TKFeat missing), so the taper is
// built geometrically: two conical halves boolean-cut SEQUENTIALLY — do not
// fuse them into one bicone first (they share a full face at z=0.5 and the
// OCCT fuse of such a pair degenerates: the second cone silently
// disappears, measured 2026-10-19 — vol 0.9224 instead of 0.8723).
// NOTE: cq.cone is the free-function analogue — it always builds at the
// world origin and ignores the workplane origin/stack; the upper half is
// positioned with cq.translate (measured 2026-10-19: a workplane offset
// does NOT move it).
import * as cq from '@faicad/faijs-cadquery'
let t5 = 5 * Math.PI / 180
let rBot = 0.2 + 0.5 * Math.tan(t5)
let rTop = 0.2 - 0.5 * Math.tan(t5)
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let lower = await cq.cone(cq.Workplane(), 2 * rBot, 0.4, 0.5)
let upperRaw = await cq.cone(cq.Workplane(), 0.4, 2 * rTop, 0.5)
let upper = await cq.translate(upperRaw, [0, 0, 0.5])
let step1 = await cq.cut(base, lower)
let res5 = await cq.cut(step1, upper)
let result = cq.val(res5)
