// source: test_cadquery.py::TestCadQuery::testCutBlindUntilFace (var wp, FINAL value)
// wp = Workplane().box(5,5,5).faces(">Y").workplane().circle(2)
//      .cutBlind(until=arbitrary_face)
// arbitrary_face = <Y face (y=0 plane) of the 10³ box on the XZ plane at
// (0,5,0), offset (20,0,0) → centred (20,5,0). Expressed here as a 10³ box
// centred (20,5,0) via translate (cq.Workplane takes no origin arg).
// The cut runs -y from y=2.5 to the y=0 plane → depth 2.5 blind hole.
//
// KNOWN DEVIATION — this case is expected to FAIL grading (stays blocked).
// Upstream routes the arbitrary-face cut through OCCT
// BRepFeat_MakeDPrism::Perform(upToFace), and the measured ref STEP shows the
// prism bottom is NOT the flat y=0 plane: hole wall x/z∈[-2,2] y∈[-1.05,2.5]
// (lateral mean depth 2.8205 → area 35.4483), slanted bottom ellipse
// area 13.3729 (= upstream's own assert value), i.e. the bottom spans
// y∈[0.41,-1.05] about the face plane. Ref vol 89.551 vs our 93.584.
// Our port cuts to the exact face plane (flat bottom, 8 faces) — a clean
// plane-distance semantic; replicating the OCCT UV-dependent slant is a
// kernel-level decision (expose BRepFeat or accept the deviation).
// Measured 2026-10-19 (probe on out/ref/…testCutBlindUntilFace__wp.step).
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.box(cq.Workplane('XY'), 10, 10, 10)
let b1 = await cq.translate(b0, [20, 5, 0])
let arbitrary_face = cq.val(cq.faces(b1, '<Y'))
let a = await cq.box(cq.Workplane(), 5, 5, 5)
let fy = cq.faces(a, '>Y')
let wy = await cq.workplane(fy)
let circ = cq.circle(wy, 2)
let wp = await cq.cutBlind(circ, arbitrary_face)
let result = cq.val(wp)
