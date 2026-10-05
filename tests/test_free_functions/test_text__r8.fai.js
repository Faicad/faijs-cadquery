// source: test_free_functions.py::test_text (var r8)
// r8 = text("CQ", 1, spine, planar=True)
//
// Same spine overload as r7 (see test_text__r7.fai.js) with `planar=True`, which
// adds an extra `moved(rx=-90)` before the `ry=-90` — so every glyph is laid
// FLAT IN THE SPINE'S FRAME PLANE instead of standing up on it.
//
// Two reasons this pair of rotations is pinned in a test
// (`src/text-spine.test.ts` → `eulerExtrinsicXYZ`):
//   * CadQuery's `Location(rx, ry, rz)` uses
//     `gp_Quaternion::SetEulerAngles(gp_Extrinsic_XYZ, …)`, i.e. an EXTRINSIC
//     composition R = Rz·Ry·Rx — which is NOT `THREE.Euler('XYZ')` (Rx·Ry·Rz).
//     With rz = 0 the two agree, but rx=-90 with ry=-90 is exactly the pair
//     where they disagree, so a `rotateBrep`-based placement would tilt the
//     glyphs wrongly.
//   * each OCCT `Moved` composes on the world side, so the left-most transform
//     in the chain is applied FIRST (`moved(-pos)` → `moved(rx, ry)` → frame).
//
// The world normals this produces are pinned in `src/text-spine.test.ts` against
// the captured frames: the glyph's local +Z becomes `-(frame column 0)` here and
// `frame column 1` for r8. Getting them wrong is what made the comparator report
// volΔ 212 % before `text-solid.ts#reverseWire`, even though the bbox matched to
// 5.5e-13.
//
// PARITY STATUS: see test_text__r7.fai.js — pinned `blocked` with
// `blockedBy: comparator:open-shell-volume` because the comparator's volume/COM
// probes are ill-defined for an open 2-D shell (here the ref volume is exactly 0
// and ours is 2.07e-19, so comΔ degrades to 4.98 on floating-point noise).
import * as cq from '@faicad/faijs-cadquery'
let cylinder0 = await cq.cylinder(cq.Workplane('XY'), 10, 5, { centered: [true, true, false] })
let turned = await cq.rotate(cylinder0, [0, 0, 1], 180)
let spine = cq.val(cq.edges(turned, '<Z'))
let result = await cq.textOnSpine('CQ', 1, spine, { planar: true, font: 'Arial' })
