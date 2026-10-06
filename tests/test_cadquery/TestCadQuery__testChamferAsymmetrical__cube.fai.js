// source: test_cadquery.py::TestCadQuery::testChamferAsymmetrical (var cube)
// cube = CQ(makeUnitCube()).faces(">Z").chamfer(0.1, 0.2); makeUnitCube stub: rect(1,1).extrude(1)
// asserts: 10 faces, top edge 0.6, side edge 0.9 (parity vs ref STEP; kernel
// channel = batch chamferDistAngle with theta = atan2(0.2, 0.1) — see
// scripts/probe-chamfer-asym-kernel.mts and src/workplane.ts chamfer())
import * as cq from '@faicad/faijs-cadquery'
let c0 = await cq.extrude(cq.rect(cq.Workplane('XY'), 1, 1), 1)
let cube = await cq.chamfer(cq.faces(c0, '>Z'), 0.1, 0.2)
let result = cq.val(cube)