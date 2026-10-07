// source: test_free_functions.py::test_hollow_open (var res2)
// res2 = hollow(box_shape, box_shape.faces(">Z"), 0.1)  — open top, walls outward.
// Free `hollow` defaults kind='intersection': kernel.shell(solid, [top], -0.1,
// 1e-3, JoinType.Intersection) — the kernel joinType switch reaches OCCT's
// MakeThickSolidByJoin (occt-wasm 5.6 index.d.ts:172).
// ref (probed 2026-10-07): Solid, vol 0.584, 11 faces, e24/v16,
//   bbox [-0.6,0.6,-0.6,0.6,-0.1,1.0].
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let f0 = await cq.faces(b0, '>Z')
let res2 = await cq.hollow(f0, 0.1)
let result = cq.val(res2)