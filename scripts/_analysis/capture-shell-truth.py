"""One-shot CadQuery 2.8.0 ground-truth capture for the shell/hollow unblock batch.

Covers the three blocked groups reclassified by
docs/plans/2026-10-07-occt56-api-unblock-reassessment.md:
  - test_free_functions.py::test_hollow        (res1 t=-0.1, res2 t=+0.1, closed)
  - test_free_functions.py::test_hollow_open   (res1 t=-0.1, res2 t=+0.1, faces(">Z"))
  - TestCadQuery::testSimpleShell              (s1/s2/s3)

hollow() free function defaults kind='intersection'; Workplane.shell defaults
kind='arc'. Prints JSON so the parity assertions can pin the exact truth.
"""

import json

import cadquery as cq
from cadquery.func import box, hollow


def stat(name, s):
    try:
        vol = s.Volume()
    except Exception:
        vol = None
    try:
        bb = s.BoundingBox()
        bbox = [bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax]
    except Exception:
        bbox = None
    return {
        "name": name,
        "type": s.ShapeType(),
        "valid": bool(s.isValid()),
        "volume": vol,
        "faces": len(s.Faces()),
        "edges": len(s.Edges()),
        "verts": len(s.Vertices()),
        "bbox": bbox,
    }


b = box(1, 1, 1)
out = [
    stat("hollow_res1_t-0.1", hollow(b, -0.1)),
    stat("hollow_res2_t+0.1", hollow(b, 0.1)),
    stat("hollow_open_res1_t-0.1", hollow(b, b.faces(">Z"), -0.1)),
    stat("hollow_open_res2_t+0.1", hollow(b, b.faces(">Z"), 0.1)),
]

s1 = cq.Workplane("XY").box(2, 2, 2).faces("+Z").shell(0.05)
out.append(stat("SimpleShell_s1", s1.val()))
s2 = cq.Workplane().ellipse(4, 2).extrude(4).faces(">Z").shell(2, kind="intersection")
out.append(stat("SimpleShell_s2", s2.val()))
s3 = cq.Workplane().ellipse(4, 2).extrude(4).faces(">Z").shell(2, kind="arc")
out.append(stat("SimpleShell_s3", s3.val()))

print(json.dumps(out, indent=1, default=str))