// source: test_assembly.py::test_PointInPlane_constraint (var box_and_vertex)
// box_and_vertex: box = Workplane().box(1,2,3) (uncentered? CQ default centered
// → bbox x[-0.5,0.5] y[-1,1] z[-1.5,1.5]) named "box"; vertex = single vertex at
// origin named "vertex" (vol 0).
// Constraints: 3× PointInPlane(vertex → box >X / >Y / >Z faces, param=0).
// Solved: vertex translation → (0.5, 1, 1.5) (CQ asserted corner).
// Box stays Fixed-anchored at origin; vertex contributes 0 volume.
// ref (cadquery 2.8.0 probe): Compound, vol 6 (box only; vertex is a point).
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let box = await cq.box(cq.Workplane('XY'), 1, 2, 3)
let vtx = await cq.vertex(0, 0, 0)
let cBox = await cqa.constraintEx('box', '', box, '', '', null, 'Fixed')
let cX = await cqa.constraintEx('vertex', '', vtx, 'box', '>X', box, 'PointInPlane', 0)
let cY = await cqa.constraintEx('vertex', '', vtx, 'box', '>Y', box, 'PointInPlane', 0)
let cZ = await cqa.constraintEx('vertex', '', vtx, 'box', '>Z', box, 'PointInPlane', 0)
let cons = await cqa.concatConstraints(cBox, cX, cY, cZ)
let asm = cqa.buildAssembly('box_and_vertex', [{ name: 'box', shape: box }, { name: 'vertex', shape: vtx }], cons)
asm.solve()
let result = cq.compound(cq.val(box), cq.val(vtx))
