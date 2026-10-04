// source: test_assembly.py::test_imprinting (var r, FINAL value)
// r = cq.occ_impl.assembly.imprint(disjoint_assy)[0]  (last assignment in
//   the test overwrites r with the disjoint-assy imprint)
// imprint of two DISJOINT unit boxes keeps them separate -> 2 solids, 12 faces.
// Geometrically identical to disjoint_assy (ref bbox x[-0.5,2.5], com (1,0,0)).
// ref (cadquery 2.8.0): Compound, vol 2, topo f12/e24/v16/s2.
import * as cq from '@faicad/faijs-cadquery'
let b1 = await cq.box(cq.Workplane('XY'), 1, 1, 1)
let b2 = await cq.translate(b1, [2, 0, 0])
let result = cq.imprint(b1, b2)
