// source: test_assembly.py::test_step_export_loc (var assy)
// ref resolved to fixture boxes9_assy (vol 1.9999999999999991 matches exactly).
// GOTCHA: the fixture uses `box()` from cadquery.occ_impl.shapes (== Solid.makeBox),
// which is CORNER-based, not centred — so the two 1x1x1 blocks end up with centres
// (0, 10, 0.5) and (1, 10, 0.5): bbox (-0.5,9.5,0)..(1.5,10.5,1), centre (0.5,10,0.5).
// Mirror them with faijs' centred box() by translating to those centres.
// (the exported-STEP location assert is not STEP-observable; only the compound is compared)
// ref anchor: vol=1.9999999999999991, com (0.5,10,0.5), bbox (-0.5,9.5,0)..(1.5,10.5,1)
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.translate(cq.Workplane(), [0, 10, 0.5])
let p1 = await cq.box(b0, 1, 1, 1)
let b1 = await cq.translate(cq.Workplane(), [1, 10, 0.5])
let p2 = await cq.box(b1, 1, 1, 1)
let result = cq.compound(cq.val(p1), cq.val(p2))
