# One-shot capture (P2): upstream CadQuery 2.8.0 fuzzy-boolean truth values
# (test_cadquery.py::TestCadQuery::testFuzzyBoolOp, eps = 1e-3).
# Run: C:\Users\ylt\cadquery-env\Scripts\python.exe scripts/probe-fuzzy-bool.py
import cadquery as cq

eps = 1e-3

box1 = cq.Workplane("XY").box(1, 1, 1)
box2 = cq.Workplane("XY", origin=(1 + eps, 0.0)).box(1, 1, 1)
box3 = cq.Workplane("XY", origin=(2, 0, 0)).box(1, 1, 1)

res = box1.union(box2)
res_fuzzy = box1.union(box2, tol=eps)
res_fuzzy2 = box1.union(box3).union(box2, tol=eps)

print("res            vol", res.val().Volume(), "solids", res.solids().size())
print("res_fuzzy      vol", res_fuzzy.val().Volume(), "solids", res_fuzzy.solids().size())
print("res_fuzzy2     vol", res_fuzzy2.val().Volume(), "solids", res_fuzzy2.solids().size())

box4 = cq.Workplane("XY", origin=(eps, 0.0)).box(1, 1, 1)

res_cut = box1.cut(box4)
res_fuzzy_cut = box1.cut(box4, tol=eps)
res_fuzzy_intersect = box1.intersect(box4, tol=eps)

print("res_cut        vol", res_cut.val().Volume(), "solids", res_cut.solids().size())
print("res_fuzzy_cut  vol", res_fuzzy_cut.val().Volume(), "solids", res_fuzzy_cut.solids().size())
print("res_fuzzy_isec vol", res_fuzzy_intersect.val().Volume(), "solids", res_fuzzy_intersect.solids().size())

# compounds
box1_cmp = cq.Compound.makeCompound(box1.vals())
box4_cmp = cq.Compound.makeCompound(box4.vals())
print("cmp_fuzzy_cut   vol", box1_cmp.cut(box4_cmp, tol=eps).Volume())
print("cmp_fuzzy_isec  vol", box1_cmp.intersect(box4_cmp, tol=eps).Volume())
print("cmp_plain_cut   vol", box1_cmp.cut(box4_cmp).Volume())

# solids
print("val_fuzzy_cut   vol", box1.val().cut(box4.val(), tol=eps).Volume())
print("val_fuzzy_isec  vol", box1.val().intersect(box4.val(), tol=eps).Volume())
print("val_plain_isec  vol", box1.val().intersect(box4.val()).Volume())

print("capture done")
