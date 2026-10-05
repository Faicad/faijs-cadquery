// source: test_shapes.py::test_remove (var b)
// b = box(2, 2, 2) - box(1, 1, 1).moved(z=0.5)
// ref (cadquery 2.8.0): Solid, vol 7 — free-function boxes are xy-centred and
// sit on z=0: outer z in [0,2], cavity z in [0.5,1.5], x/y in [-0.5,0.5].
//
// ⚠ RECLASSIFIED (N7, 2026-10-05): this case was labeled `remove` because the
// SOURCE test `test_remove` also calls `b.remove(...)` — but that call acts on
// the *other* captured variable (`br`), NOT on `b`. The variable `b` itself is
// just the hollow box (a plain boolean cut), so it needs no remove op. The
// construction is identical to the already-ported `test_shells__s`.
import * as cq from '@faicad/faijs-cadquery'
let outer = await cq.box(cq.Workplane(), 2, 2, 2, { centered: [true, true, false] })
let inner = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let cavity = cq.moved(inner, cq.Location([0, 0, 0.5]))
let b = await cq.cut(outer, cavity)
let result = cq.val(b)
