// source: test_cadquery.py::TestCadQuery::testGlue (var box2)
// box2 = Workplane("XY", origin=(0, 1, 0)).rect(1, 1).extrude(1)
// ref (probed): vol 1.000000, bbox x in [-0.5,0.5], y in [0.5,1.5], z in [0,1].
// U16: cq-compat Workplane() ignores the origin kwarg (upstream accepts it), so
// the offset is applied with translate() on the BUILT SOLID. It used to be
// applied to the empty workplane instead (relying on translate moving wp.origin),
// but that deviates from upstream: `newObject()` keeps `self.plane`
// (`ns.plane = copy(self.plane)`), so both a real `Workplane(origin=...)` and a
// plain `translate` leave the plane alone. Translating a workplane that holds
// only PENDING wires cannot relocate the profile either.
import * as cq from '@faicad/faijs-cadquery'
let w1 = cq.rect(cq.Workplane('XY'), 1, 1)
let box2 = await cq.extrude(w1, 1)
let box2_moved = await cq.translate(box2, [0, 1, 0])
let result = cq.val(box2_moved)
