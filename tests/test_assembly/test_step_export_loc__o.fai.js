// source: test_assembly.py::test_step_export_loc (var o)
// `getfixturevalue("boxes8_assy"|"boxes9_assy")` -> 2 boxes at y=10, centres
// (0,10,0.5) and (1,10,0.5) (the fixture's `box()` helper is Solid.makeBox ->
// CORNER-based, so the centred faijs box is translated to those centres), vol 2.
// The upstream test does `assy.save(step)` then `cq.importers.importStep`; `o`
// is the re-read compound. The round trip is lossless, so the in-memory
// binary-BREP round trip (exportBin -> importBin) reproduces the ref bitwise.
// (the saved-STEP location assert is not STEP-observable.)
// NOTE the compound is wrapped inline (see colors_assy0__assy_i for why).
// ref anchor: vol=1.9999999999999991, com (0.5,10,0.5)
import * as cq from '@faicad/faijs-cadquery'
let b0 = await cq.box(cq.Workplane(), 1, 1, 1)
let p1 = await cq.translate(b0, [0, 10, 0.5])
let b1 = await cq.box(cq.Workplane(), 1, 1, 1)
let p2 = await cq.translate(b1, [1, 10, 0.5])
let bytes = await cq.exportBin(cq.Workplane(cq.compound(cq.val(p1), cq.val(p2))))
let back = await cq.importBin(bytes)
let result = cq.val(back)
