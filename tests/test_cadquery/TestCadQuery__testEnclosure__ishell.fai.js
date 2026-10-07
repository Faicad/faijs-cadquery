// source: test_cadquery.py::TestCadQuery::testEnclosure (var ishell)
// ishell = oshell.faces("<Z").workplane(3.0, True)
//          .rect(100.0-6.0, 150.0-6.0).extrude(50.0-6.0, False)
//          .edges("|Z").fillet(10.0-3.0)
// Upstream truth (out/probe-enclosure-truth.json):
//   vol 593733.2737611396, com (0, 0, 25), bbox [[-47,-72,3],[47,72,47]],
//   f10/e24/v16
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
let result = cq.val(ishell)
