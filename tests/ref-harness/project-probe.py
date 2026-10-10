"""project-probe.py — ref-side capture (plan §5) for the `project` batch (4 blocked cases).

Two DISTINCT upstream primitives are involved, neither of which occt-wasm
exposes:

  cadquery.func.project(s, base)            -> BRepAlgo_NormalProjection   (shapes.py:7542)
      "normal projection": an APPROXIMATE B-spline fit, parameterised by
      SetParams(tol, tol**(2/3), continuity, degree, maxseg).
  cadquery.func.project(s, base, direction) -> BRepProj_Projection         (shapes.py:7566)
      "cylindrical projection": exact directional projection.
  Shape.project(face, d)                    -> BRepProj_Projection + BRepExtrema_DistShapeShape
                                               + Face.constructOn (shapes.py:2482)
  Face.project(other, d)                    -> Wire.project + constructOn   (shapes.py:3795)

occt-wasm's nearest names are NOT substitutes:
  projectEdges(shape, viewOrigin, viewDirection) -> HLRBRep hidden-line removal (rendering)
  projectPointOnFace(face, point)                -> ORTHOGONAL nearest point (no direction)

This is the plan-§5 one-shot capture behind the C-class verdict for the
`project` batch: it prints the exact in-memory truth for all 4 blocked cases so
the classification rests on measurement, not on reading the source.

NOTE `func.cylinder(1, 2)` is DIAMETER 1 x height 2 (radius 0.5) -- same
convention as `func.sphere(4)` being diameter 4 (see plan §3.1.1 ③). That is
the only reason the projected bbox is y +-0.5000001 instead of +-1.
"""

import cadquery as cq
from cadquery.func import cylinder, circle, text, project, box, sphere, plane
from cadquery.occ_impl.shapes import Face, Solid, Wire, Compound, Edge, Vector

SEP = "=" * 74


def report(name, s):
    st = s.ShapeType()
    print(f"{name}\n  type={st} f={len(s.Faces())} e={len(s.Edges())} v={len(s.Vertices())} w={len(s.Wires())}")
    bb = s.BoundingBox()
    print(f"  bbox x[{bb.xmin:.12g},{bb.xmax:.12g}] y[{bb.ymin:.12g},{bb.ymax:.12g}] z[{bb.zmin:.12g},{bb.zmax:.12g}]")
    if st == "Solid":
        print(f"  vol={s.Volume():.12g}")
    print(f"  geomTypes={sorted({el.geomType() for el in s.Faces()}) if s.Faces() else []}"
          f" edgesOn={sorted({el.geomType() for el in s.Edges()})}")


print(SEP, "\nCASE 1  test_free_functions::test_project__res")
print("  base = cylinder(1,2).faces('%CYLINDER'); e = circle(0.1).moved(rx=90).moved(y=0.5,z=1)")
print("  FINAL res = project(e, base, (0, 1, 0))   # cylindrical projection\n")
base = cylinder(1, 2).faces("%CYLINDER")
e = circle(0.1).moved(rx=90).moved(y=0.5, z=1)
print("  base (the target):")
report("  base", base.val() if hasattr(base, "val") else base)
res = project(e, base, (0, 1, 0))
report("  res", res)
for i, el in enumerate(res.Edges() if hasattr(res, "Edges") else []):
    print(f"    edge{i}: {el.geomType()} closed={el.IsClosed()} len={el.Length():.12g}")

print("\n" + SEP, "\nCASE 2/3  TestCadQuery::test_project__res_ex / __res_o_ex")
print("  t = Compound.makeText('T',5,0).Faces()[0]")
print("  f = Workplane('XZ', origin=(0,0,-7)).sphere(6).faces('not %PLANE').val()")
print("  res_ex = Solid.extrudeLinear(t.project(f, (0,0,-1)), (0,0,0.5))   # 10 faces asserted\n")
for letter, want in (("T", "res_ex"), ("O", "res_o_ex")):
    tface = Compound.makeText(letter, 5, 0).Faces()[0]
    tgt = cq.Workplane("XZ", origin=(0, 0, -7)).sphere(6).faces("not %PLANE").val()
    proj = tface.project(tgt, (0, 0, -1))
    report(f"  {letter}: projected face", proj)
    ex = Solid.extrudeLinear(proj, (0.0, 0.0, 0.5))
    report(f"  {letter}: {want} (extruded)", ex)
    print(f"    upstream asserts len(Faces()) == {'10' if letter == 'T' else 'n/a'} -> actual {len(ex.Faces())}")

print("\n" + SEP, "\nCASE 4  test_free_functions::test_text__r9")
print("  c = cylinder(10,10).moved(rz=180); cf = c.faces('%CYLINDER'); spine = c.edges('<Z')")
print("  r9 = text('CQ', 1, spine, cf)   # projected onto the cylindrical face\n")
c = cylinder(10, 10).moved(rz=180)
cf = c.faces("%CYLINDER")
spine = c.edges("<Z")
r9 = text("CQ", 1, spine, cf)
report("  r9", r9)
print(f"    upstream asserts r9.faces('<<X').geomType() == 'CYLINDER' -> actual "
      f"{r9.faces('<<X').geomType()}")

print("\n" + SEP, "\nGAP EVIDENCE: the missing primitives")
print("  BRepAlgo_NormalProjection      -> not in occt-wasm (no method name contains 'normal')")
print("  BRepProj_Projection            -> not in occt-wasm")
print("  BRepExtrema_DistShapeShape     -> not bound; occt-wasm has only distanceBetween()")
print("  Face.constructOn (multi-wire)  -> cad.faceOnSurface takes a SINGLE wire (see plan §3.1.1 ③)")
print("  occt-wasm's projectEdges       -> HLRBRep hidden-line removal, NOT curve projection")
print("  occt-wasm's projectPointOnFace -> orthogonal nearest point, no direction argument")
