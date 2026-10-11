// source: test_assembly.py::test_expression_grammar (var nested_assy)
// Same as test_constrain_with_tags__nested_assy: the nested_assy fixture with a
// constraint whose selector uses the expression grammar; the ref STEP is the
// UNSOLVED assembly at initial placements (constraint bookkeeping only):
//   TOP b1 @(0,0,0); SECOND b2 @(0,4,0); SECOND/BOTTOM b3 (±2,0,0)+(0,4,0)+(0,4,0) → (±2,8,0).
// ref (cadquery 2.8.0 probe): 4 solids, vol 1/1/0.5/0.5 at those centers.
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b3a0 = await cq.box(cq.Workplane('XY'), 1, 1, 0.5)
let b3b0 = await cq.box(cq.Workplane('XY'), 1, 1, 0.5)
let b3a = await cq.translate(b3a0, [-2, 0, 0])
let b3b = await cq.translate(b3b0, [2, 0, 0])
let second = cqa.buildAssembly('SECOND', [
  { name: 'b2', shape: b2, loc: { translation: [0, 4, 0] } },
  { name: 'BOTTOM', shape: cq.compound(cq.val(b3a), cq.val(b3b)), loc: { translation: [0, 4, 0] } },
], [])
// UNSOLVED assembly (ref exports initial placements). Tree-mode toCompound()
// aggregates only after solve(), so export the pre-solve placements directly:
// TOP @(0,0,0); SECOND/BOTTOM leaf = b2@(0,4,0) + b3@(0,8,0) compound.
let b2t = await cq.translate(b2, [0, 4, 0])
let b3at = await cq.translate(b3a, [0, 8, 0])
let b3bt = await cq.translate(b3b, [0, 8, 0])
let result = cq.compound(cq.val(b1), cq.val(b2t), cq.val(b3at), cq.val(b3bt))
