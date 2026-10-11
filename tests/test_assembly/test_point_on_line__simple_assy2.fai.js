// source: test_assembly.py::test_point_on_line (var simple_assy2)
// simple_assy2: b1 (1x1x1 centered, Fixed) + b2 (2x1x1 centered, loc z=4).
// Constraints: Fixed(b1), FixedAxis(b2 >Z → (0,2,1)), FixedAxis(b2 >X → (1,0,0)),
// PointOnLine(b2 >X face center → b1 edge ">>Z and >>Y").
// Solved: b2 center lands on b1's +Z+Y edge → (0, 0.5, 0.5); b2's local X axis
// rotated 45° about z → half-extent xy = 1cos45+0.5sin45 = 1.0606601717798214,
// z half 0.5 → b2 z [0,1].
// ref (cadquery 2.8.0 probe): 2 solids, vol 1 + 2 = 3, com (1/3,1/3,1/3).
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.box(cq.Workplane('XY'), 2, 1, 1)
let cFixed = await cqa.constraintEx('b1', '', b1, '', '', null, 'Fixed')
let cFA1 = await cqa.constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', [0, 2, 1])
let cFA2 = await cqa.constraintEx('b2', '>X', b2, '', '', null, 'FixedAxis', [1, 0, 0])
let cPOL = await cqa.constraintEx('b2', '>X', b2, 'b1', '>>Z and >>Y', b1, 'PointOnLine')
let cons = await cqa.concatConstraints(cFixed, cFA1, cFA2, cPOL)
let asm = cqa.buildAssembly('simple_assy2', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], cons)
asm.solve()
let result = asm.toCompound()
