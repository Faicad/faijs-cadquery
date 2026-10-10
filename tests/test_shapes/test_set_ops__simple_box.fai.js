// source: test_shapes.py::test_set_ops (fixture `simple_box`)
//
// `simple_box` is a pytest FIXTURE = box(1, 1, 1) (xy-centred, z 0..1). The
// upstream test only ASSERTS on `|` / `&` / `%` set-operator sizes — it exports
// no geometry of its own. The parity harness captures the fixture as the ref
// STEP, so this mirror reproduces the fixture box for bitwise parity.
//
// The set-operator semantics the test actually exercises
// (Shape.__or__ / __and__ / __mod__ → compound set union / intersection /
// difference over sub-shapes, NOT geometric booleans) live in
// `shapeUnion` / `shapeIntersect` / `shapeDifference` (src/workplane.ts) and are
// covered by src/shape-set-ops.test.ts — they cannot be graded through the
// fixture var because the ref captures no set-op result geometry.
import * as cq from '@faicad/faijs-cadquery'
let simple_box = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })
let result = cq.val(simple_box)
