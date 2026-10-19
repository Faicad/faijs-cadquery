// source: test_cadquery.py::TestCadQuery::testExtrudeUntilFace (var wp_ref, FINAL value)
// wp_ref = Workplane("XY").box(10,10,10).center(20,0).box(10,10,10)
//          .workplane().move(10,0).box(5,5,5)
// (the 3-box compound: 10³ at (0,0,0) and (20,0,0), plus 5³ at (30,0,0) —
// CQ's no-arg workplane() keeps the old origin (20,0,0); the 2D .move(10,0)
// then puts the point at (30,0,0) and box() builds at stack points.)
// API mapping trap on record: CQ has TWO `move` methods —
//   Workplane.move(xDist, yDist)  = relative 2D point-stack move  -> cq.move2D
//   Shape.move(loc)               = in-place twin of moved        -> cq.move
// (cq.move is the Shape-level one: it moves the carried solid, which shifts
// the whole compound — verified wrong here, 2026-10-19.)
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane('XY'), 10, 10, 10)
let b2 = await cq.box(cq.center(b1, 20, 0), 10, 10, 10)
let w0 = await cq.workplane(b2)
let mv = cq.move2D(w0, 10, 0)
let wp_ref = await cq.box(mv, 5, 5, 5)
let result = cq.val(wp_ref)
