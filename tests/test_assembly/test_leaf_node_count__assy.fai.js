// source: test_assembly.py::test_leaf_node_count (var assy)
// ref resolved to fixture empty_top_assy (vol 0.9999999999999998 matches exactly):
//   single box(1,1,1) @ origin under an empty top-level assembly named "top"
// (the toCAF leaf-node count assert is not STEP-observable; only the compound is compared)
// ref anchor: vol=0.9999999999999998
import * as cq from '@faicad/faijs-cadquery'
let p1 = await cq.box(cq.Workplane(), 1, 1, 1)
let result = cq.compound(cq.val(p1))
