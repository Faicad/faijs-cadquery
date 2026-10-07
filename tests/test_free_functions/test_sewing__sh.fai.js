// source: test_free_functions.py::test_sewing (var sh)
//   b = box(1, 1, 1)                    -- xy-centred, bottom z = 0
//   ftop = b.faces(">Z")
//   sh = b.remove(ftop)                 -- Shape.remove = BRepTools_ReShape
//
// ReShape is NOT bound by occt-wasm (reassessment §3.3 W5-a), but its result
// here is driven by nothing more than "take the box's other five faces": the
// upstream sewing seam lives entirely in `shell()`, which kernel.sew does bind.
// So `sh` is mirrored as shellFromFaces(the five faces) instead — that is
// reassessment §3.2's open question ("sew subset"), answered yes by
// scripts/_analysis/probe-sewing-reshape.mjs: f5/e12/v8, i.e. the six faces
// minus one, with the seam edges/vertices left un-merged exactly as ReShape
// leaves them.
//
// The one visible difference: ReShape keeps the ORIGINAL solid's shell node, so
// the reference STEP still reads MANIFOLD_SOLID_BREP / CLOSED_SHELL carrying 5
// faces, while the mirror exports a real OPEN_SHELL. The comparator's topology
// check covers faces/edges/vertices only (not solids), so it still pairs.
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fx0 = await cq.faces(b, '<X')
let fx1 = await cq.faces(b, '>X')
let fy0 = await cq.faces(b, '<Y')
let fy1 = await cq.faces(b, '>Y')
let fz0 = await cq.faces(b, '<Z')
let sh = await cq.shellFromFaces(cq.Workplane(), [fx0, fx1, fy0, fy1, fz0])
let result = cq.val(sh)
