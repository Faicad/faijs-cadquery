// source: test_shapes.py::test_special (var cs)
// cs = c.sort(lambda x: -x.Volume())            -- Shape.sort (occ_impl/shapes.py:1932)
// GOTCHA: the free-function `box` imported by test_shapes.py is
// `occ_impl.shapes.box` (== Solid.makeBox): xy-centred with its base on z=0 —
// hence `{ centered: [true, true, false] }` below.
// λ convention: declare a `function` (an arrow body cannot see `cq`); the op is
// awaited because a DSL `function` compiles to `async function`.
// ref anchor: vol 36 (identical to `c` — this steps's mirror is GEOMETRICALLY
// identical to test_special__c). ⚠ ORDER-BLIND: tests/compare.ts:117-129
// compares vol/com/bbox/boolean-difference/topo counts, none of which is
// order-sensitive, so a PASS here does NOT prove the sort ordered anything.
// The order truth (child volumes [27, 8, 1], one-shot CadQuery 2.8.0 capture)
// is pinned in src/shape-filter.test.ts instead.
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let b2 = await cq.box(cq.Workplane(), 2, 2, 2, { centered: [true, true, false] })
let b3 = await cq.box(cq.Workplane(), 3, 3, 3, { centered: [true, true, false] })
let c = cq.compound(cq.val(b1), cq.val(b2), cq.val(b3))
function byVolumeDesc(x) { return -cq.volumeOf(x) }
let result = await cq.sortByKey(c, byVolumeDesc)
