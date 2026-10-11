// source: test_assembly.py::test_point_on_line (var assy)
// Same solved compound re-exported as `assy = assy.solve()` — identical geometry
// to simple_assy2 (ref probe identical: vol 3, same bbox/com).
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
