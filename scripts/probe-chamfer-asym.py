# One-shot capture (P4-1): upstream CadQuery 2.8.0 asymmetric chamfer truth
# (test_cadquery.py::TestCadQuery::testChamferAsymmetrical).
#   cube = CQ(makeUnitCube()).faces(">Z").chamfer(0.1, 0.2)
# asserts: 10 faces, top edge length 0.6, side edge length 0.9.
# Run: C:\Users\ylt\cadquery-env\Scripts\python.exe scripts/probe-chamfer-asym.py
import cadquery as cq

cube = cq.Workplane("XY").box(1, 1, 1).faces(">Z").chamfer(0.1, 0.2)
s = cube.val()
print("vol", s.Volume())
print("faces", len(s.Faces()), "edges", len(s.Edges()), "verts", len(s.Vertices()))
top = cube.edges(">Z").vals()[0]
side = cube.edges("|Z").vals()[0]
print("top edge len", top.Length())
print("side edge len", side.Length())
bb = s.BoundingBox()
print(f"bbox z [{bb.zmin:.6f},{bb.zmax:.6f}]")
print("capture done")
