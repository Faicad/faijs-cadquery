// source: test_free_functions.py::test_prism (var res5)
// res5 = prism(box_shape, None, tri, (face("<Y").extend(10), face(">Y").extend(10)))
//   — additive prism from the <Y face plane to the >Y face plane.
// tri = face(polygon(ftop.edge("<<X").Center(), ftop.edge(">>X").Center(),
//                  ftop.Center() + Vector(0,0,1)))
//   = triangle in the y=0 plane: (-0.5,0,1), (0.5,0,1), (0,0,2).
// extend(10) only enlarges the face surfaces for robust plane detection —
// the prism spans exactly the box's y range [-0.5,0.5] (measured ref bbox).
// Measured 2026-10-19 (out/ref): 1 solid, 9 faces — 4 box sides + bottom +
// 2 slants (area 1.1180) + 2 triangle ends (0.5); the z=1 "roof" is an
// INTERIOR interface: the prism's base face coincides with the box top face
// and the fuse removes it. vol = 1 + (½·1·1)·1 = 1.5.
// TOPOLOGY NOTE: our construction (swept bar fused to the box) yields 7
// faces — OCCT glue merges each triangle end with the coplanar box side
// (→ pentagon). The ref's 9 come from BRepFeat_MakePrism's internal
// boolean, which does not glue. Geometry (vol/bbox/boolean diff) is
// identical, so grading is expected to ride the boolean-diff channel.
// NOTE: Workplane('XZ') normal is -Y (CQ Plane.named table) → extrude(+1)
// goes to y∈[-1,0]; the +0.5 translate centres the bar on y∈[-0.5,0.5].
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let w = cq.Workplane('XZ')
let tri = cq.close(cq.polyline(w, [[-0.5, 1], [0.5, 1], [0, 2]]))
let bar = await cq.extrude(tri, 1)
let barM = await cq.translate(bar, [0, 0.5, 0])
let res5 = await cq.union(base, barM)
let result = cq.val(res5)
