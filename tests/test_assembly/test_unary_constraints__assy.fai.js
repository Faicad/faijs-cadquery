// source: test_assembly.py::test_unary_constraints (var assy)
// Same solved compound re-exported as `assy = assy.solve()` — identical geometry
// to simple_assy2 (ref probe identical: vol 3, same bbox/com).
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
