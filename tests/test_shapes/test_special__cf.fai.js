// source: test_shapes.py::test_special (var cf)
// cf = c.filter(lambda x: x.Volume() <= 1)      -- Shape.filter (occ_impl/shapes.py:1928)
// GOTCHA: the free-function `box` imported by test_shapes.py is
// `occ_impl.shapes.box` (== Solid.makeBox): xy-centred with its base on z=0 —
// not z-centred, hence `{ centered: [true, true, false] }` below.
// λ convention: declare a `function` — an ARROW body cannot see the `cq`
// namespace (`cq is not defined`), and a DSL `function` is compiled to
// `async function`, so the op is awaited (it awaits the predicate).
// ref anchor: vol 1, bb x[-0.5,0.5] y[-0.5,0.5] z[0,1], f6/e12/v8, com (0,0,0.5)
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let b2 = await cq.box(cq.Workplane(), 2, 2, 2, { centered: [true, true, false] })
let b3 = await cq.box(cq.Workplane(), 3, 3, 3, { centered: [true, true, false] })
let c = cq.compound(cq.val(b1), cq.val(b2), cq.val(b3))
function isSmall(x) { return cq.volumeOf(x) <= 1 }
let result = await cq.filterByPredicate(c, isSmall)
