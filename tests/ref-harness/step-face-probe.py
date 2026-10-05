"""One-shot: read a ref + cand STEP pair and print per-face geometry/orientation.

Used to explain the comparator's volΔ/comΔ blow-up on the `text(txt, size,
spine)` mirrors (r7/r8), whose shapes are 2-D face compounds lying OFF the
origin — where `BRepGProp::VolumeProperties` is an artifact and its sign flips
with the face orientation.

Usage:
    C:/Users/ylt/cadquery-env/Scripts/python.exe \
        packages/faijs-cadquery/tests/ref-harness/step-face-probe.py r7 r8 r1
"""

from __future__ import annotations

import sys

from cadquery.occ_impl.importers import importStep

REF = "packages/faijs-cadquery/out/ref/tests.test_free_functions___test_text__{}.step"
CAND = "packages/faijs-cadquery/out/cand/test_text__{}.step"


def describe(tag: str, path: str) -> None:
    # `Shape.importStep` does not exist in the installed cadquery 2.8.0 (it was
    # added later); the module-level importer returns a Workplane.
    s = importStep(path).val()
    bb = s.BoundingBox()
    print(f"--- {tag} ---")
    print(f"  type      : {s.geomType()}")
    print(f"  volume    : {s.Volume()!r}")
    print(f"  area      : {s.Area()!r}")
    c = s.Center()
    print(f"  center    : ({c.x!r}, {c.y!r}, {c.z!r})")
    print(f"  bbox      : ({bb.xmin!r},{bb.ymin!r},{bb.zmin!r}) -> ({bb.xmax!r},{bb.ymax!r},{bb.zmax!r})")
    print(f"  topology  : f{len(s.Faces())}/e{len(s.Edges())}/v{len(s.Vertices())}/s{len(s.Solids())}")
    for i, f in enumerate(s.Faces()):
        n = f.normalAt()
        fc = f.Center()
        print(
            f"    face[{i}] {f.geomType():8s} area={f.Area()!r} "
            f"normal=({n.x!r},{n.y!r},{n.z!r}) center=({fc.x!r},{fc.y!r},{fc.z!r})"
        )
    # signed "volume" exactly as BRepGProp computes it for an open shell
    print(f"  oriented_area_vector-ish volume = {s.Volume()!r}")


for tag in sys.argv[1:]:
    print("=" * 74)
    describe(f"REF  {tag}", REF.format(tag))
    describe(f"CAND {tag}", CAND.format(tag))
