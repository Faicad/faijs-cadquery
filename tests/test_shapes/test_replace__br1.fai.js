// source: test_shapes.py::test_replace (var br1, FINAL value)
// b = box(1,1,1); f_top = b.faces(">Z")
// f_top_split = f_top / plane(0.5, 0.5).moved(f_top.Center())
// br1 = b.replace(f_top, f_top_split)  -> top face swapped for its 2-face split.
// ref (cadquery 2.8.0): Solid, vol 1, topo f7/e16/v12 (6 faces -> +1 from the
//   split top), bbox x[-0.5,0.5] y[-0.5,0.5] z[0,1].
import * as cq from '@faicad/faijs-cadquery'
let bWp = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })
let bShape = cq.val(bWp)
let topFace = cq.val(cq.faces(bWp, '>Z'))
let planeFace = cq.faceMakePlane(0.5, 0.5, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, 1)
let result = cq.replaceFacesOnSolid(bShape, [topFace], cq.splitShapeBy(topFace, planeFace))
