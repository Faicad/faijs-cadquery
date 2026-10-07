// source: test_shapes.py::test_bin_import_export (var r)
// r = Shape.importBin(BytesIO of b.exportBin(...))  — the round-tripped box.
// The mirror exercises the REAL binary BREP channel (kernel
// toBREPBinary/fromBrepBinary), not a re-built box: `b` is exported to bytes
// and those bytes are what `r` imports.
// ref anchor: vol=1, bbox ±0.5 × z[0,1], topo f6/e12/v8/s1 (same as `b`).
import * as cq from '@faicad/faijs-cadquery'
let b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let bytes = await cq.exportBin(b)
let r = await cq.importBin(bytes)
let result = cq.val(r)
