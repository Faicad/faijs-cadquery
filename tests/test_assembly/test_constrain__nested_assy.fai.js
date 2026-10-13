// source: test_assembly.py::test_constrain (var nested_assy)
// nested_assy fixture SOLVED with 2 constraints:
//   TOP = { root b1 = box(1,1,1) centered, loc (0,0,0) }
//   SECOND = { root b2 = box(1,1,1) centered, loc (0,4,0);
//              BOTTOM = pushPoints [(-2,0),(2,0)] box(1,1,0.5), loc (0,4,0) }
//   c1: Plane("TOP@faces@>Z", "SECOND/BOTTOM@faces@<Z"); c2: Axis("TOP@faces@>X", "SECOND/BOTTOM@faces@<X")
// CQ asserts after solve: children[0] (= SECOND) loc → (2,-4,0.75).
// ref (cadquery 2.8.0 probe): 4 solids, vol 1@x[-0.5,0.5]y[-0.5,0.5], vol 1@(2,-4,0.75),
// vol 0.5@(-0.5,−4,1.25)… vol 0.5@(4.5,−4,1.25).
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b3a0 = await cq.box(cq.Workplane('XY'), 1, 1, 0.5)
let b3b0 = await cq.box(cq.Workplane('XY'), 1, 1, 0.5)
let b3a = await cq.translate(b3a0, [-2, 0, 0])
let b3b = await cq.translate(b3b0, [2, 0, 0])
let b3 = await cq.compound(cq.val(b3a), cq.val(b3b))
let second = await cqa.buildAssemblyRoot('SECOND', [
  { name: 'BOTTOM', shape: b3, loc: { translation: [0, 4, 0] } },
], [], b2, [0, 4, 0])
let c1 = await cqa.constraintEx('TOP', '>Z', b1, 'SECOND.BOTTOM', '<Z', b3, 'Plane')
let c2 = await cqa.constraintEx('TOP', '>X', b1, 'SECOND.BOTTOM', '<X', b3, 'Axis')
let cons = await cqa.concatConstraints(c1, c2)
let asm = await cqa.buildAssemblyRoot('TOP', [
  { name: 'SECOND', shape: second },
], cons, b1)
asm.solve()
let result = asm.toCompound()
