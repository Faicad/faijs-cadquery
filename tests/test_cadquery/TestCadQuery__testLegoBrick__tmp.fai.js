// source: test_cadquery.py::TestCadQuery::testLegoBrick (var tmp)
// P=8, c=0.1, H=9.6, bumpDiam=4.8, t=1.5, postDiam=P-t=6.5
// tmp = s.faces("<Z").workplane(invert=True)
//         .rarray(P, P, lbumps-1=7, wbumps-1=1, center=True)
//         .circle(postDiam/2=3.25).circle(bumpDiam/2=2.4).extrude(H-t=8.1)
// i.e. the 7 hollow posts under the brick: an annulus (outer 3.25, inner 2.4)
// extruded along the INVERTED bottom-face normal (downwards, -Z).
// `s` is the brick from the __s mirror (base + shell + bumps).
import * as cq from '@faicad/faijs-cadquery'
let base = await cq.box(cq.Workplane('XY'), 63.8, 15.8, 9.6)
let bot = await cq.faces(base, '<Z')
let hollow = await cq.shell(bot, -1.5)
let topFaces = await cq.faces(hollow, '>Z')
let wp1 = await cq.workplane(topFaces)
let arr = cq.rarray(wp1, 8, 8, 8, 2, true)
let bumps = cq.circle(arr, 2.4)
let s = await cq.extrude(bumps, 1.8)
let botFaces = await cq.faces(s, '<Z')
let wp2 = await cq.workplane(botFaces, { invert: true })
let arr2 = cq.rarray(wp2, 8, 8, 7, 1, true)
let postOuter = cq.circle(arr2, 3.25)
let postInner = cq.circle(postOuter, 2.4)
let tmp = await cq.extrude(postInner, 8.1)
let result = cq.val(tmp)
