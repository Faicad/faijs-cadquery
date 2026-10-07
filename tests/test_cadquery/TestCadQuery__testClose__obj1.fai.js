// source: test_cadquery.py::TestCadQuery::testClose (var obj1)
// obj1 = Workplane("XY", origin=(0,0,-1.5)).moveTo(5,0)
//        .threePointArc((0,2.5),(-5,0)).threePointArc((0,-2.5),(5,0))
//        .close().extrude(3)
// The (0,0,-1.5) origin is applied to the BUILT SOLID, not to the empty
// workplane: upstream's translate keeps the plane (`newObject()` copies
// `self.plane`), and a workplane holding only pending wires has nothing to move.
// ref (probed): vol 104.8348167191279, 4 faces.
// U16: cq-compat Workplane() ignores the origin kwarg — offset applied with
// translate() on the empty workplane (moves wp.origin).
import * as cq from '@faicad/faijs-cadquery'
let w0 = await cq.moveTo(cq.Workplane('XY'), 5, 0)
let w1 = await cq.threePointArc(w0, [0, 2.5], [-5, 0])
let w2 = await cq.threePointArc(w1, [0, -2.5], [5, 0])
let w3 = await cq.close(w2)
let obj1 = await cq.extrude(w3, 3)
let obj1_moved = await cq.translate(obj1, [0, 0, -1.5])
let result = cq.val(obj1_moved)
