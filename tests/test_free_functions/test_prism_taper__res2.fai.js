// source: test_free_functions.py::test_prism_taper (var res2)
// res2 = prism(box_shape, ftop, c, 0.1, 15)
//   ctx=box_shape, base=ftop (top face), faces=c (circle(0.2) moved onto ftop),
//   t=0.1, angle=15 — an additive TAPERED boss on the top face.
// Upstream routes angle != 0 through BRepFeat_MakeDPrism (a TKFeat feature
// builder occt-wasm does not expose); the port uses the equivalent
// BRepOffsetAPI_MakeDraft path (`extrude(..., {taper})` -> kernel draftPrism).
// The SOLID matches the ref bitwise (vol 1.0109579815868446, same bbox/centroid)
// but the lateral conical face is a SINGLE face here (f8/e15/v10) where
// MakeDPrism splits it into three (f10/e21/v14). Topology-only difference ->
// PASS-NT (recorded, not gated — same class as testPolyline's extra seam).
// ref anchor: vol=1.0109579815868446, f10/e21/v14
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fz = await cq.faces(base, '>Z')
let wp = await cq.workplane(fz)
wp = await cq.circle(wp, 0.2)
let res2 = await cq.extrude(wp, 0.1, true, { taper: 15 })
let result = cq.val(res2)
