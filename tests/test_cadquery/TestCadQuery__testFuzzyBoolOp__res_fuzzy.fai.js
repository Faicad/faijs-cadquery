// source: test_cadquery.py::TestCadQuery::testFuzzyBoolOp (var res_fuzzy)
// res_fuzzy = box1.union(box2, tol=1e-3)   # eps-overlapping boxes FUSED into 1 solid
// ref (cadquery 2.8.0): vol 2.0009999999999994 (fuzzy fuse merges the 1e-3 gap)
// UNBLOCKED (op:fuzzy-bool — occt-wasm 5.6 booleanOp fuzzyValue, calibrated
// 2026-10-06: clean after fuzzy fuse = 2.0009999999999994 bit-equal, see
// src/boolean-op-base.test.ts and scripts/probe-fuzzy-bool.py).
import * as cq from '@faicad/faijs-cadquery'
let box1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let box2 = await cq.translate(b, [1 + 1e-3, 0, 0])
let res_fuzzy = await cq.union(box1, box2, { tol: 1e-3 })
let result = cq.val(res_fuzzy)
