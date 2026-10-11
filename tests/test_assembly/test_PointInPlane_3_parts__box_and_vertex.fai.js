// source: test_assembly.py::test_PointInPlane_3_parts (var box_and_vertex)
// box_and_vertex fixture + cylinder (circle(0.1).extrude(2)) added at origin.
// Constraints: Plane(box >Z, cylinder <Z), PointInPlane(vertex, cylinder >Z),
// PointInPlane(vertex, box >X). Solved: cylinder z[1.5,3.5] (sits on box top),
// vertex lands on cylinder-top plane & box >X plane → (0.5, ·, 3.5); box Fixed.
// ref (cadquery 2.8.0 probe): 2 solids — box vol 6 bbox x[-0.5,0.5] y[-1,1]
// z[-1.5,1.5]; cylinder vol 0.0628319 bbox x/y ±0.1 z[1.5,3.5].
import * as cq from '@faicad/faijs-cadquery'
import * as cqa from '@faicad/faijs-cadquery/assembly'
let box = await cq.box(cq.Workplane('XY'), 1, 2, 3)
let vtx = await cq.vertex(0, 0, 0)
let cylWp = await cq.circle(cq.Workplane('XY'), 0.1)
let cyl = await cq.extrude(cylWp, 2)
let cBox = await cqa.constraintEx('box', '', box, '', '', null, 'Fixed')
let cPlane = await cqa.constraintEx('box', '>Z', box, 'cylinder', '<Z', cyl, 'Plane')
let cPipCyl = await cqa.constraintEx('vertex', '', vtx, 'cylinder', '>Z', cyl, 'PointInPlane')
let cPipBox = await cqa.constraintEx('vertex', '', vtx, 'box', '>X', box, 'PointInPlane')
let cons = await cqa.concatConstraints(cBox, cPlane, cPipCyl, cPipBox)
let asm = cqa.buildAssembly('box_and_vertex', [{ name: 'box', shape: box }, { name: 'vertex', shape: vtx }, { name: 'cylinder', shape: cyl }], cons)
asm.solve()
let result = asm.toCompound()
