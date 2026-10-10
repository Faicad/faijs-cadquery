// source: test_assembly.py::test_colors_assy0 (var assy_i)
// `getfixturevalue("multi_subshape_assy")` -> the 2-box compound (vol 1125).
// The upstream test exports the assembly to STEP then `assy.load`s it back;
// `assy_i` is the RE-LOADED compound. The round trip is lossless for disjoint
// solids, so the in-memory binary-BREP round trip (exportBin -> importBin, the
// real kernel channel) reproduces the ref geometry bitwise.
// (colors / locs / names / subshape metadata are not STEP-observable.)
// NOTE the compound is wrapped inline: a bare `let comp = cq.compound(...)`
// binding is a LIVE faijs terminal, so it would split the export into
// `out.step_<i>_comp` files and break the ref->cand pairing.
// ref anchor: vol=1124.9999999999998
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 10, 10, 10)
let b2 = await cq.box(cq.Workplane(), 5, 5, 5)
let p2 = await cq.translate(b2, [10, 10, 10])
let bytes = await cq.exportBin(cq.Workplane(cq.compound(cq.val(p1), cq.val(p2))))
let back = await cq.importBin(bytes)
let result = cq.val(back)
