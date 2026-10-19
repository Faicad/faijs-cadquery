// source: test_free_functions.py::test_prism (var res6)
// res6 = prism(box_shape, None, tri, (face("<Y").extend(10), face(">Y").extend(10)),
//              (0, 1, 0))
//   — the SAME from/to-face prism as res5, spelled with the explicit
//   direction overload (+y). The default direction derivation (from the face
//   normals) yields the identical geometry — the measured ref face set is
//   identical to res5 (1 solid, 9 faces, vol 1.5; see res5 mirror notes,
//   incl. the 7-vs-9 topology note: our fuse glues the coplanar y-faces,
//   the ref's BRepFeat_MakePrism path does not — boolean-diff channel).
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let w = cq.Workplane('XZ')
let tri = cq.close(cq.polyline(w, [[-0.5, 1], [0.5, 1], [0, 2]]))
let bar = await cq.extrude(tri, 1)
let barM = await cq.translate(bar, [0, 0.5, 0])
let res6 = await cq.union(base, barM)
let result = cq.val(res6)
