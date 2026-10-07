// source: test_cadquery.py::TestCadQuery::testEnclosure (var lid)
// (lid, bottom) = box.faces(">Z").workplane(-3.0-1.0)
//                 .split(keepTop=True, keepBottom=True).all()
// `split` pushes (top, bottom) in that order, so `.all()[0]` is the lid.
// Upstream truth (out/probe-enclosure-truth.json):
//   vol 59244.58013612189, com (0, 0, 48.989), bbox [[-50,-75,47],[50,75,51]],
//   f27/e56/v40
import * as cq from '@faicad/faijs-cadquery'
// NOTE: the faijs source parser rejects an `await` expression used directly as a
// call argument ("unsupported value expression: AwaitExpression"), so every
// async step is bound to its own variable first.
let oshell = cq.Workplane('XY')
oshell = cq.rect(oshell, 100.0, 150.0)
oshell = await cq.extrude(oshell, 50.0 + 1.0)
oshell = await cq.fillet(cq.edges(oshell, '|Z'), 10.0)
oshell = await cq.fillet(cq.edges(oshell, '#Z'), 2.0)
let wp = await cq.workplane(cq.faces(oshell, '<Z'), { offset: 3.0, invert: true })
let ishell = await cq.extrude(cq.rect(wp, 100.0 - 2.0 * 3.0, 150.0 - 2.0 * 3.0), 50.0 - 2.0 * 3.0, false)
ishell = await cq.fillet(cq.edges(ishell, '|Z'), 10.0 - 3.0)
let box = await cq.cut(oshell, ishell)
let wp2 = await cq.workplane(cq.faces(box, '>Z'), { offset: -3.0 })
let pts = cq.vertices(cq.rect(wp2, 100.0 - 2.0 * 12.0, 150.0 - 2.0 * 12.0, { forConstruction: true }))
pts = cq.circle(pts, 10.0 / 2.0)
pts = cq.circle(pts, 4.0 / 2.0)
box = await cq.extrude(pts, (-1.0) * (50.0 + 1.0 - 3.0), true)
let wp3 = await cq.workplane(cq.faces(box, '>Z'), { offset: -3.0 - 1.0 })
let sp = await cq.split(wp3)
let result = cq.val(cq.item(sp, 0))
