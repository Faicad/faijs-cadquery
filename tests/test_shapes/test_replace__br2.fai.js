// source: test_shapes.py::test_replace (var br2, FINAL value)
// br2 = b.replace(f_top, *f_top_split)  -> same geometry as br1 (the compound
//   of split faces is expanded to individual faces, identical outcome).
// ref (cadquery 2.8.0): Solid, vol 1, topo f7/e16/v12, bbox x[-0.5,0.5] y[-0.5,0.5] z[0,1].
import * as cq from '@faicad/faijs-cadquery'
let bWp = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })
let bShape = cq.val(bWp)
let topFace = cq.val(cq.faces(bWp, '>Z'))
let planeFace = cq.faceMakePlane(0.5, 0.5, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, 1)
let result = cq.replaceFacesOnSolid(bShape, [topFace], cq.splitShapeBy(topFace, planeFace))
