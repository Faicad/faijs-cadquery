// source: test_free_functions.py::test_history_offset (var sides, FINAL value)
// h = History()
// f = plane(1, 1)                          # 1x1 face at z=0
// offset(f, 0.1, both=True,  history=h)    # op0: 2 offset faces
// op = h[-1]
// fs_offset = op.generated(f)              # 2 faces (var reused below)
// sides = op.generated(f.edges())          # 8 edges (var reused below)
// offset(f, 0.1, both=False, history=h)    # op1: 1 offset face
// op = h[-1]
// sides = op.generated(f.edges())          # FINAL: 4 edges of the single +Z offset face
//
// The final `sides` is the boundary wire of `f` offset by 0.1 along +Z:
// a 1x1 square wire at z=0.1 (f0/e4/v8/s0).
// Reproduced directly: a 1x1 face at z=0.1, then its boundary edges.
// ref (cadquery 2.8.0): Wire, vol 0, topo f0/e4/v8, bbox x[-0.5,0.5] y[-0.5,0.5] z[0.1,0.1].
import * as cq from '@faicad/faijs-cadquery'
let f = cq.faceMakePlane(1, 1, { x: 0, y: 0, z: 0.1 }, { x: 0, y: 0, z: 1 }, 1)
let result = cq.edgesOfFace(f)
