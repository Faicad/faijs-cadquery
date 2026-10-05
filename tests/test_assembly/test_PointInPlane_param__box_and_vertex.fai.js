// source: test_assembly.py::test_PointInPlane_param (var box_and_vertex)
// fixture box_and_vertex: box(1,2,3) @ origin (fully centered, vol 6)
//   + a lone Vertex solved by the assembly constraint solver to (2.5, 0, 1.51).
// The constraint/solve asserts are not STEP-observable; only the compound is compared.
// ref anchor: vol=6, bbox x[-0.5,2.5] y[-1,1] z[-1.5,1.51]
//   (vertex at (2.5,0,1.51) extends box x→2.5, z→1.51; box is fully centered).
// Upstream box is Workplane.box → fully centered; faijs cq.box default centered matches.
//
// ⚠ UNGRADEABLE (NOT ported) — discovered 2026-10-05 (N6):
//   1. `cq.vertex(x,y,z)` IS already exported (workplane.ts:5528 / index.ts:62), so
//      the old `op:vertex-shape` label was a MISDIAGNOSIS — the op gap does not exist.
//   2. The real blocker is the COMPARATOR: a "solid + lone vertex" compound makes
//      OCCT boolean ops crash (kernel.cut / kernel.fuse both throw BOOLEAN_FAILED,
//      even comparing the ref STEP against ITSELF). Verified: cut(ref,ref) and
//      fuse(ref,ref) both fail. So no candidate can be graded regardless of fidelity.
//   3. Secondary: faijs STEP export drops the lone vertex (brepSolids/export path
//      keeps only the solid), so even an in-memory box+vertex compound exports box-only.
//   ⇒ labeled `comparator:vertex-degenerate-compound` (same family as
//     `comparator:open-shell-volume`); mirror kept as the faithful faijs construction.
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 1, 2, 3)
let result = cq.compound(cq.val(p1), cq.vertex(2.5, 0, 1.51))
