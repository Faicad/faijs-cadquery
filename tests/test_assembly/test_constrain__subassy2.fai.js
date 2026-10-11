// source: test_assembly.py::test_constrain (var subassy2)
// The solved subassy2 member exported standalone: 2 solids — b3 (two 1x1x3
// boxes) after solve. ref probe: vol 3@x[-5,-2]y[-0.04,1.04]z[-0.04,1.04],
// vol 3@x[-5,-2]y[-5.19,-4.11]z[-1.62,-0.54].
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: false })
let b2 = await cq.box(cq.Workplane('XY'), 1, 1, 2)
let b3a = await cq.box(cq.Workplane('XY'), 1, 1, 3)
let b3b0 = await cq.box(cq.Workplane('XY'), 1, 1, 3)
let b3b = await cq.translate(b3b0, [-2, -5, 0])
let b3 = await cq.compound(cq.val(b3a), cq.val(b3b))
let subassy1 = cqa.buildAssembly('subassy1', [{ name: 'b2', shape: b2, loc: { translation: [1, 1, 0] } }], [])
let subassy2 = cqa.buildAssembly('subassy2', [{ name: 'b3', shape: b3, loc: { translation: [2, 3, 0] } }], [])
let c1 = await cqa.constraintEx('simple_assy', '<X', b1, 'subassy1.b2', '<Z', b2, 'Plane')
let c2 = await cqa.constraintEx('simple_assy', '<X', b1, 'subassy2.b3', '<Z', b3, 'Axis')
let c3 = await cqa.constraintEx('subassy1.b2', '>Z', b2, 'subassy2.b3', '<Z', b3, 'Point')
let cons = await cqa.concatConstraints(c1, c2, c3)
let asm = await cqa.buildAssemblyRoot('simple_assy', [
  { name: 'subassy1', shape: subassy1 },
  { name: 'subassy2', shape: subassy2 },
], cons, b1)
asm.solve()
// solve() bakes b3's solved pose in place — export it directly.
let result = cq.val(b3)
