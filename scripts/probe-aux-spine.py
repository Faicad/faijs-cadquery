# One-shot capture (P1-1): upstream aux-spine sweep truth values.
# Run: C:\Users\ylt\cadquery-env\Scripts\python.exe scripts/probe-aux-spine.py
import math
import cadquery as cq
from cadquery.occ_impl.shapes import Wire


def wire_from_pts(pts, tangents, plane):
    wp = cq.Workplane(plane)
    w = wp.spline(pts, tangents=tangents).vals()[0]
    return w


def probe(tag, profile, spine_pts, spine_tgts, aux_pts, aux_tgts, plane="XY"):
    path = wire_from_pts(spine_pts, spine_tgts, plane)
    aux = wire_from_pts(aux_pts, aux_tgts, plane)
    wp = cq.Workplane("XY").rect(*profile) if plane == "XY" else None
    # Use the same entry as upstream test_sweep: sweep with auxSpine
    res = cq.Workplane("XY").rect(*profile).sweep(cq.Workplane(plane).add(path), auxSpine=cq.Workplane(plane).add(aux))
    shape = res.val()
    print(f"{tag}: vol={shape.Volume()!r} faces={len(shape.Faces())} edges={len(shape.Edges())} verts={len(shape.Vertices())}")
    bb = shape.BoundingBox()
    print(f"{tag}: bbox=({bb.xmin:.6f},{bb.ymin:.6f},{bb.zmin:.6f})-({bb.xmax:.6f},{bb.ymax:.6f},{bb.zmax:.6f})")


# Case A (testSweep result): profile 10x20, path (0,0,0)->(0,20,100) tg (0,0,1)x2, aux (0,20,0)->(20,0,100) tg (0,0,1)x2
# NB: the workplane transforms fold into the endpoints, so all wires are built
# on XY with the WORLD endpoints recorded in the mirror comments.
probe("A-testSweep", (10, 20), [(0, 0, 0), (0, 20, 100)], [(0, 0, 1), (0, 0, 1)], [(0, 20, 0), (20, 0, 100)], [(0, 0, 1), (0, 0, 1)], "XY")

# Case B (test_sweep_aux r1/r2): profile 1x1 on XY, spine (0,0,0)->(0,0,1), aux (1,0,0)->(1,0,1) tg ((0,1,0),(0,-1,0))
probe("B-aux-r1", (1, 1), [(0, 0, 0), (0, 0, 1)], [(0, 0, 1), (0, 0, 1)], [(1, 0, 0), (1, 0, 1)], [(0, 1, 0), (0, -1, 0)], "XY")

print("capture done")
