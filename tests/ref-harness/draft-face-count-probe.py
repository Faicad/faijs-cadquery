"""One-shot capture (N5): how many faces does `box(1,1,1).face("|X or |Y")` select,
and what does upstream `draft` actually do on them?"""
from cadquery.occ_impl.shapes import box, draft, _get_faces, _get_one_wire  # noqa

b = box(1, 1, 1)
fbot = b.face("<Z")
fside = b.face("|X or |Y")

print("fside type:", type(fside).__name__)
faces = list(_get_faces(fside))
print("len(_get_faces(fside)):", len(faces))
for i, f in enumerate(faces):
    n = f.normalAt()
    print(f"  face{i} normal=({n.x:.6f},{n.y:.6f},{n.z:.6f}) area={f.Area():.12f}")

pf = b.face("<Z")
print("fbot normal:", pf.normalAt().toTuple())
pln = pf.toPln()
lp = pln.Location()
ad = pln.Axis().Direction()
print("fbot pln location:", (lp.X(), lp.Y(), lp.Z()), "axis:", (ad.X(), ad.Y(), ad.Z()))

r1 = draft(b, fbot, fside, 5)
r2 = draft(b, fbot, fside, (0, 0, 1), 5)
print("res1 vol:", r1.Volume(), "nFaces:", len(r1.Faces()))
print("res2 vol:", r2.Volume(), "nFaces:", len(r2.Faces()))
print("res1 >Z area:", r1.face(">Z").Area(), "fbot area:", fbot.Area())
print("res2 >Z area:", r2.face(">Z").Area())
