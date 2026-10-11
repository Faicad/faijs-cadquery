// source: test_assembly.py::test_unary_constraints (var simple_assy2)
// simple_assy2: b1 (1x1x1 centered, Fixed) + b2 (2x1x1 centered, loc z=4).
// Constraints: Fixed(b1), FixedPoint(b2 → world (0,0,-3)), FixedAxis(b2 >Z face → (0,1,1)).
// Solved: b2 center (0,0,-3), +Z normal → (0,1,1)/√2. Rotated 2x1 footprint
// about x-axis-ish → half-extent xy = 1cos45+0.5sin45 = 1.0606601717798214,
// z half 0.5 → b2 z [-3.5,-2.5].
// ref (cadquery 2.8.0 probe): 2 solids, vol 1 + 2 = 3, com (1/3,1/3,1/3).
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.box(cq.Workplane('XY'), 2, 1, 1)
let cFixed = await cqa.constraintEx('b1', '', b1, '', '', null, 'Fixed')
let cFP = await cqa.constraintEx('b2', '', b2, '', '', null, 'FixedPoint', [0, 0, -3])
let cFA = await cqa.constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', [0, 1, 1])
let cons = await cqa.concatConstraints(cFixed, cFP, cFA)
let asm = cqa.buildAssembly('simple_assy2', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2, loc: { translation: [0, 0, 4] } }], cons)
asm.solve()
let result = asm.toCompound()
