// source: test_free_functions.py::test_sewing (var res3)
//   b = box(1, 1, 1)                    -- xy-centred, bottom z = 0
//   ftop = b.faces(">Z")
//   sh = b.remove(ftop)                 -- box minus top (5 faces)
//   res3 = shell(sh.faces(), ftop, ftop.moved(x=1), manifold=True)
//        => sew the 5 box-minus-top faces + ftop + ftop.moved(x=1) into one
//           manifold. OCCT keeps a FLOATING face (ftop.moved) as a bare face
//           child of the compound => Compound of 7 faces, volume 7.
//   ref (cadquery 2.8.0): Compound, vol 7, f7/e16/v12  (out/ref/...test_sewing__res3.step)
//
// Mirror note: sh.faces() == the 5 faces; so res3 == shellFromFaces of the 7
// faces directly. kernel.sew is faithful in memory (f7/e16/v12 per
// src/shell-from-faces.test.ts); the only historical blocker was the STEP
// writer dropping the floating face. N2-4 writes it via a self-hosted XCAF
// exporter (raw addShape) instead of the host CLI's filtered writer.
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let fx0 = await cq.faces(b, '<X')
let fx1 = await cq.faces(b, '>X')
let fy0 = await cq.faces(b, '<Y')
let fy1 = await cq.faces(b, '>Y')
let fz0 = await cq.faces(b, '<Z')
let ftop = await cq.faces(b, '>Z')
let ftopMoved = await cq.translate(ftop, [1, 0, 0])
let res3wp = await cq.shellFromFaces(cq.Workplane(), [fx0, fx1, fy0, fy1, fz0, ftop, ftopMoved])
let result = cq.val(res3wp)
