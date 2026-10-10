"""One-shot diagnostic (N2-2): why is tests.test_assembly___test_name_geometries__assy
unjudgeable?  Emits 4 variants of the upstream scene so the comparator can be
bisected:

  v_full   — box(1,1,1) + plane(1,1) + segment((0,0),(0,1))  == the ref product
  v_noface — box + segment                (drop the coincident plane face)
  v_noedge — box + plane                  (drop the 1-D segment)
  v_offfac — box + plane moved to z=0.3   (face no longer coplanar with the box)

Upstream `test_name_geometries` (out/cache/v2.8.0/tests/test_assembly.py:2581)
builds exactly `v_full` and then asserts on STEP TEXT:
    len([l for l in lines if "top_face" in l]) == 2 ... etc
i.e. its subject is `Assembly.save(name_geometries=True)` name propagation,
NOT geometry. The ref harness (tests/ref-harness/cq_step_plugin.py::_export)
instead does `Assembly.toCompound()` + `Shape.exportStep()`, which has no
`name_geometries` argument at all -- so the ref product loses the very thing
the test checks (measured: 0 occurrences of top_face/plane_/seg_ in the ref).
"""

import os

from cadquery.func import plane, box, segment
from cadquery import Assembly

OUT = os.path.join("out", "_diag")
# graded by tests/_probe-mixed-dim-boolean.ts — regenerate after any cadquery bump
os.makedirs(OUT, exist_ok=True)


def export(assy, name):
    fn = os.path.join(OUT, f"{name}.step")
    assy.toCompound().exportStep(fn)
    print(f"wrote {fn}")


def base():
    a = Assembly()
    a.add(box(1, 1, 1), name="box")
    a.box.addSubshape(a.box.obj.faces(">Z"), "top_face")
    return a


# v_full — exactly the upstream scene
a = base()
a.add(plane(1, 1), name="face").face.addSubshape(a.face.obj, name="plane_")
a.add(segment((0, 0), (0, 1)), name="edge").edge.addSubshape(a.edge.obj, name="seg_")
export(a, "v_full")

# v_noface — no plane face
a = base()
a.add(segment((0, 0), (0, 1)), name="edge").edge.addSubshape(a.edge.obj, name="seg_")
export(a, "v_noface")

# v_noedge — no segment
a = base()
a.add(plane(1, 1), name="face").face.addSubshape(a.face.obj, name="plane_")
export(a, "v_noedge")

# v_offfac — the plane face lifted off the box bottom (no coincident faces)
a = base()
a.add(plane(1, 1).moved(z=0.3), name="face").face.addSubshape(a.face.obj, name="plane_")
a.add(segment((0, 0), (0, 1)).moved(z=0.3), name="edge").edge.addSubshape(
    a.edge.obj, name="seg_"
)
export(a, "v_offfac")

# what did the ref actually keep?
ref = os.path.join("out", "ref", "tests.test_assembly___test_name_geometries__assy.step")
print("=" * 72)
print(f"ref size = {os.path.getsize(ref)} bytes")
