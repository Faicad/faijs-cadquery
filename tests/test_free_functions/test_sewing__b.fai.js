// source: test_free_functions.py::test_sewing (var b)
// b = box(1, 1, 1)
// ref (cadquery 2.8.0): Solid, vol 1 — free-function box is xy-centred,
// bottom z = 0 (so bbox x/y in [-0.5,0.5], z in [0,1]).
//
// ⚠ RECLASSIFIED (N7, 2026-10-05): this case was labeled `remove` because the
// SOURCE test `test_sewing` also calls `b.remove(...)` — but that call acts on
// the *other* captured variable (`sh`), NOT on `b`. The variable `b` itself is
// just the unit cube, so it needs no remove/shell op.
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let result = cq.val(b)
