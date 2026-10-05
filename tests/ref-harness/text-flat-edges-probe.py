"""One-shot: per-face edge breakdown of `text("CQ", 1)` (the flat fixture used by
`text(txt, size, spine)`), to explain the area delta against faijs.

Run with the OCP interpreter:
    C:/Users/ylt/cadquery-env/Scripts/python.exe \
        packages/faijs-cadquery/tests/ref-harness/text-flat-edges-probe.py

NOT part of CI.
"""

from __future__ import annotations

from cadquery.func import text

flat = text("CQ", 1)
print(f"compound : area={flat.Area()!r} edges={len(flat.Edges())} wires={len(flat.Wires())}")
for i, f in enumerate(flat.Faces()):
    edges = f.Edges()
    per = sum(e.Length() for e in edges)
    print(f"F{i} area={f.Area()!r} edges={len(edges)} perimeter={per!r}")
    print("    kinds=[" + ",".join(e.geomType() for e in edges) + "]")
    print("    lens=[" + ",".join(f"{e.Length():.8g}" for e in edges) + "]")
    for j, w in enumerate(f.Wires()):
        print(f"    wire[{j}] edges={len(w.Edges())} len={w.Length()!r}")
