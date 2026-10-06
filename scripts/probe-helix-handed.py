# One-shot capture (P4-2): does upstream CadQuery 2.8.0 helix carry handedness,
# and what does the left-handed wire look like geometrically?
#   Wire.makeHelix(pitch=1.5, height=10, radius=1.2, dir=(0,0,1), lefthand=?)
# Driven by the P4-2 decision: only build a handed mirror if upstream HAS the
# semantics AND a gradeable truth exists. Run:
#   C:\Users\ylt\cadquery-env\Scripts\python.exe scripts/probe-helix-handed.py
import math
from cadquery import Wire

for lh in (False, True):
    w = Wire.makeHelix(1.5, 10, 1.2, lefthand=lh)
    bb = w.BoundingBox()
    edges = w.Edges()
    e = edges[0]
    L = e.Length()
    p0 = e.positionAt(0.0)
    t0 = e.tangentAt(0.0)
    pq = e.positionAt(L * 0.25)  # quarter turn: sign of x reveals the winding sense
    print(
        f"lefthand={lh} edges={len(edges)} len={L:.9f} "
        f"bbox x[{bb.xmin:.6f},{bb.xmax:.6f}] y[{bb.ymin:.6f},{bb.ymax:.6f}] "
        f"z[{bb.zmin:.6f},{bb.zmax:.6f}]"
    )
    print(
        f"    start=({p0.x:.6f},{p0.y:.6f},{p0.z:.6f}) "
        f"startTangent=({t0.x:.6f},{t0.y:.6f},{t0.z:.6f}) "
        f"quarter=({pq.x:.6f},{pq.y:.6f},{pq.z:.6f})"
    )
print("capture done")