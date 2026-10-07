// source: test_cadquery.py::TestCadQuery::testEnclosure (var oshell)
// oshell = Workplane("XY").rect(100.0, 150.0).extrude(50.0 + 1.0)
//          .edges("|Z").fillet(10.0).edges("#Z").fillet(2.0)
//
// C bucket (docs/plans/2026-10-06-occt-wasm-extension-plan.md §2.4): the
// `kernel:fillet-chain-reapply` label was a mislabel — occt-wasm #288 made
// chained fillets work at the kernel level. Upstream truth
// (out/probe-enclosure-truth.json, scripts/probe-enclosure-capture.py):
//   raw box            vol 765000.0        f6/e12/v8
//   after fillet(10)   vol 760622.1225333  f10/e24/v16
//   oshell             vol 759798.0086827  f26/e56/v32
// and the second `.edges("#Z")` (on the already-filleted shape) selects
// **8 edges, all LINE** — NOT arcs. The capture refuted the plan's guess that
// the blocker was "new edges are arcs/ellipses".
import * as cq from '@faicad/faijs-cadquery'
let oshell = cq.Workplane('XY')
oshell = cq.rect(oshell, 100.0, 150.0)
oshell = await cq.extrude(oshell, 50.0 + 1.0)
oshell = await cq.fillet(cq.edges(oshell, '|Z'), 10.0)
oshell = await cq.fillet(cq.edges(oshell, '#Z'), 2.0)
let result = cq.val(oshell)
