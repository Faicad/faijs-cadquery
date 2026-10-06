# One-shot capture (P3): upstream CadQuery 2.8.0 History truth values
# (test_free_functions.py::test_history_extrude — the case behind
#  test_history_extrude__sides; sweep/loft contribute topology-level asserts).
# History maps INPUT subshapes -> OUTPUT subshapes of the last op. We record
# the {type,center} of first/last/generated members so the TS side can freeze
# the same collections (P3 非比对输出走 {type,center} 保序集合口径).
# Run: C:\Users\ylt\cadquery-env\Scripts\python.exe scripts/probe-history.py
import cadquery as cq
from cadquery.occ_impl.shapes import History

def desc(s):
    c = s.Center()
    return f"{s.ShapeType()}({c.x:.6f},{c.y:.6f},{c.z:.6f})"

print("=== test_history_extrude: plane(1,1) extruded (0,0,1) ===")
res = cq.Workplane("XY").rect(1, 1).extrude(1)
top = res.faces(">Z").val()
bot = res.faces("<Z").val()
sides = res.faces("|Z").vals()
print("top ", desc(top))
print("bot ", desc(bot))
print("all faces (sorted)")
for s in sorted(res.faces().vals(), key=desc):
    print("  ", desc(s))
print("faces total", len(res.faces().vals()))

print("=== sweep/loft: topology-level asserts only ===")
print("history_sweep: side.faces()==4, inner.faces()==1, top|bot|side|inner == 7")
print("history_loft : bot == res.face('<Z'), sides generated from f.edges()")

print("capture done")
