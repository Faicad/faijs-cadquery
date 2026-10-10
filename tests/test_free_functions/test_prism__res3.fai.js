// source: test_free_functions.py::test_prism (var res3)
// c = circle(0.2).moved(box_shape.faces(">Z"))
// res3 = prism(box_shape, None, c, box_shape.face("<Z"), (0, 0.1, 1), False)
//   — SUBTRACTIVE prism with a tilt. Upstream's `dir=(0, 0.1, 1)` is the
//   material-ADD side; with `additive=False` the tool runs the other way
//   (one-shot capture: the removed mass sits at y = -0.05, i.e. the tool goes
//   from the profile plane z=1 straight down to the target plane z=0 along
//   (0, -0.1, -1)). `cutBlind`'s `dir` extension builds exactly that
//   translation prism (sheared, not rotated), so the removed volume is
//   π·0.2²·1 regardless of the tilt.
// ref anchor: vol=0.874336359635 (= 1 − π·0.2²·1), com=(-1.4e-8, 0.00718622774873, 0.5),
//   bbox x/y ±0.5000001, z[-1e-7, 1.0000001], topo f7/e15/v10/s1
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fz = await cq.faces(base, '>Z')
let wp = await cq.workplane(fz)
wp = await cq.circle(wp, 0.2)
let res3 = await cq.cutBlind(wp, -1.1, { dir: [0, -0.1, -1] })
let result = cq.val(res3)
