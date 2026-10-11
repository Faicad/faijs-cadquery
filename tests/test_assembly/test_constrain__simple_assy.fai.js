// source: test_assembly.py::test_constrain (var simple_assy)
// simple_assy fixture SOLVED with 3 constraints:
//   root b1 = makeBox(1,1,1) (x/y/z [0,1], NOT centered) at loc (2,-5,0)
//   subassy1 = { b2 = box(1,1,2) centered, loc (1,1,0) }
//   subassy2 = { b3 = pushPoints [(0,0),(-2,-5)] box(1,1,3), loc (2,3,0) }
//   c1: Plane(root <X face, subassy1.b2 <Z face); c2: Axis(root <X, subassy2.b3 <Z);
//   c3: Point(subassy1.b2 >Z face, subassy2.b3 <Z face)
// CQ asserts after solve: assy loc stays (2,-5,0); children[0] loc → (-1,0.5,0.5).
// ref (cadquery 2.8.0 probe): 4 solids, vol 1@x[2,3]y[-5,-4], vol 2@x[0,2],
// vol 3@x[-3,0]y[-5.04,-3.96]z[-0.04,1.04], vol 3@x[-3,0]y[-10.19,-9.11]z[-1.62,-0.54].
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
], cons, b1, [2, -5, 0])
asm.solve()
let result = asm.toCompound()
