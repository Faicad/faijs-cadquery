"""One-shot capture for `text(txt, size, spine[, planar])` / `text(txt, size, spine, base)`.

Source: cadquery 2.8.0 `tests/test_free_functions.py::test_text` (vars r7/r8/r9),
implementation `cadquery/occ_impl/shapes.py:6772` (spine overload) and
`:6805` (spine + base overload).

Run (must be the OCP interpreter -- the Git-Bash `python` has no OCP):
    C:/Users/ylt/cadquery-env/Scripts/python.exe \
        packages/faijs-cadquery/tests/ref-harness/text-spine-probe.py

The values printed here are frozen into
`packages/faijs-cadquery/src/text-spine.test.ts` as hard-coded expectations
(the repo discipline: one-shot capture -> TS assertions, no per-run probe
channel).  This file itself is NOT part of CI.
"""

from __future__ import annotations

from cadquery.func import cylinder, text
from cadquery.occ_impl.shapes import Face, Wire

SEP = "=" * 72


def describe(tag: str, s) -> None:
    """Print the metric set the STEP comparator gates on."""
    bb = s.BoundingBox()
    print(f"\n--- {tag} ---")
    print(f"  type      : {s.geomType()} / {type(s).__name__}")
    print(f"  volume    : {s.Volume()!r}")
    print(f"  area      : {s.Area()!r}")
    print(f"  center    : ({s.Center().x!r}, {s.Center().y!r}, {s.Center().z!r})")
    print(
        f"  bbox      : ({bb.xmin!r}, {bb.ymin!r}, {bb.zmin!r}) -> "
        f"({bb.xmax!r}, {bb.ymax!r}, {bb.zmax!r})"
    )
    faces = s.Faces()
    edges = s.Edges()
    verts = s.Vertices()
    print(f"  topology  : f{len(faces)} / e{len(edges)} / v{len(verts)}")
    for i, f in enumerate(faces):
        fb = f.BoundingBox()
        c = f.Center()
        n = f.normalAt()
        print(
            f"    face[{i}] {f.geomType():8s} area={f.Area()!r:20s} "
            f"center=({c.x:.6f},{c.y:.6f},{c.z:.6f}) "
            f"normal=({n.x:.6f},{n.y:.6f},{n.z:.6f}) "
            f"bbx=[{fb.xmin:.6f},{fb.xmax:.6f}]"
        )


def vt(v):
    """Coerce a CadQuery Vector (or plain tuple) to a tuple for printing."""
    return tuple(v) if isinstance(v, (tuple, list)) else tuple(v.toTuple())


def as_list(x):
    """`Shape.faces(selector)` returns a bare Shape when the selector is
    unambiguous, a ShapeList otherwise -- normalise for iteration.  NB: a
    bare `Shape` is itself iterable (over its sub-shapes), so test the type
    BEFORE falling back to `list()`."""
    from cadquery.occ_impl.shapes import Shape

    return [x] if isinstance(x, Shape) else list(x)


def main() -> None:
    # --- upstream, verbatim -------------------------------------------------
    c = cylinder(10, 10).moved(rz=180)
    cf = c.faces("%CYLINDER")
    spine = c.edges("<Z")

    r7 = text("CQ", 1, spine)  # normal
    r8 = text("CQ", 1, spine, planar=True)  # planar
    r9 = text("CQ", 1, spine, cf)  # projected

    # --- spine facts --------------------------------------------------------
    print(SEP)
    print("SPINE  (c.edges('<Z')  -- the input to _get_one_wire)")
    print(SEP)
    print(f"  c           : {type(c).__name__} {c.geomType()} vol={c.Volume()!r}")
    print(f"  c.edges('<Z')  -> {type(spine).__name__}")
    for i, e in enumerate(as_list(spine)):
        bb = e.BoundingBox()
        print(
            f"  edge[{i}] {e.geomType():8s} len={e.Length()!r} "
            f"bb=({bb.xmin},{bb.ymin},{bb.zmin})->({bb.xmax},{bb.ymax},{bb.zmax})"
        )
    w = as_list(spine)[0]  # _get_one_wire picks the single wire
    print(f"  wire      : {type(w).__name__} len={w.Length()!r}")
    print(f"  startPoint: {w.startPoint().toTuple()!r}")
    print(f"  endPoint  : {w.endPoint().toTuple()!r}")

    # --- base face facts ----------------------------------------------------
    print()
    print(SEP)
    print("BASE  (c.faces('%CYLINDER'))")
    print(SEP)
    print(f"  count = {len(as_list(cf))}")
    for i, f in enumerate(as_list(cf)):
        n = f.normalAt(1e-15, 1e-15)
        print(f"  face[{i}] {f.geomType():8s} area={f.Area()!r} normal={vt(n)!r}")

    # --- flat text facts (the `pos`/`L` inputs) ----------------------------
    flat = text("CQ", 1)
    print()
    print(SEP)
    print("FLAT TEXT  text('CQ', 1)  -- feeds `pos = el.BoundingBox().center.x`")
    print(SEP)
    describe("flat", flat)
    L = w.Length()
    print(f"\n  L = wire.Length() = {L!r}")
    for i, el in enumerate(flat.Faces()):
        pos = el.BoundingBox().center.x
        print(f"  glyph[{i}] pos(bb.center.x) = {pos!r}   pos/L = {pos / L!r}")
        print(f"           el.moved(-pos) bbox = {el.moved(-pos).BoundingBox()}")

    # --- location frames ----------------------------------------------------
    print()
    print(SEP)
    print("LOCATION FRAMES  spine.locationAt(pos/L)")
    print(SEP)
    for i, el in enumerate(flat.Faces()):
        pos = el.BoundingBox().center.x
        loc = w.locationAt(pos / L)
        try:
            print(f"  glyph[{i}] pos/L={pos / L!r}")
            print(f"    loc.toTuple() = {loc.toTuple()!r}")
        except Exception as exc:  # noqa: BLE001
            print(f"    (toTuple unavailable: {exc})")
        T = loc.wrapped.Transformation()
        print("    loc 3x4 matrix (row-major, Value(r,c) r=1..3 c=1..4):")
        for r in range(1, 4):
            print("      [" + ", ".join(f"{T.Value(r, c)!r}" for c in range(1, 5)) + "]")
        # a few probe points -> where does the frame send them?
        from OCP.gp import gp_Pnt

        for tag, p in (
            ("origin", gp_Pnt(0, 0, 0)),
            ("ex", gp_Pnt(1, 0, 0)),
            ("ey", gp_Pnt(0, 1, 0)),
            ("ez", gp_Pnt(0, 0, 1)),
            ("pos", gp_Pnt(-4.986737491891383, -0.3639356906993792, 0.0)),
        ):
            q = p.Transformed(T)
            print(f"      T({tag}) = ({q.X():.12f}, {q.Y():.12f}, {q.Z():.12f})")
        # where is the spine point for this glyph?
        sp = w.positionAt(pos / L)
        print(f"    wire.positionAt(pos/L) = ({sp.x!r}, {sp.y!r}, {sp.z!r})")
        tt = w.tangentAt(pos / L)
        print(f"    wire.tangentAt(pos/L)  = ({tt.x!r}, {tt.y!r}, {tt.z!r})")
        # the intermediate the upstream loop builds, step by step
        a = el.moved(-pos)
        b = a.moved(rx=0, ry=-90)
        d = b.moved(loc)
        for tag, sh in (("moved(-pos)", a), ("+ry=-90", b), ("+locationAt", d)):
            bb = sh.BoundingBox()
            c = sh.Center()
            print(
                f"    {tag:14s} center=({c.x:.9f},{c.y:.9f},{c.z:.9f}) "
                f"bb=({bb.xmin:.9f},{bb.ymin:.9f},{bb.zmin:.9f})->"
                f"({bb.xmax:.9f},{bb.ymax:.9f},{bb.zmax:.9f})"
            )
        print(f"    a.Volume={a.Volume()!r}  d.Volume={d.Volume()!r}  d.geomType={d.geomType()!r}")

    # --- the three results --------------------------------------------------
    print()
    print(SEP)
    print("RESULTS")
    print(SEP)
    describe("r7  text('CQ',1,spine)             # normal", r7)
    describe("r8  text('CQ',1,spine,planar=True) # planar", r8)
    describe("r9  text('CQ',1,spine,cf)          # projected", r9)

    # --- the assertions upstream makes -------------------------------------
    print()
    print(SEP)
    print("UPSTREAM ASSERTIONS")
    print(SEP)
    from cadquery import Vector

    print(f"  r7.faces('>>Z').Center().z = {r7.faces('>>Z').Center().z!r}  (> 0)")
    print(
        f"  r7.faces('<<X').normalAt() = "
        f"{vt(r7.faces('<<X').normalAt())!r}  dot(0,0,1)="
        f"{r7.faces('<<X').normalAt().dot(Vector(0, 0, 1))!r}"
    )
    print(f"  r7.faces('<<X').geomType() = {r7.faces('<<X').geomType()!r}")
    print(f"  r8.faces('>>Z').Center().z = {r8.faces('>>Z').Center().z!r}  (== 0)")
    print(
        f"  r8.faces('<<X').normalAt() = "
        f"{vt(r8.faces('<<X').normalAt())!r}  (-(0,0,1))="
        f"{(r8.faces('<<X').normalAt() - Vector(0, 0, 1)).Length!r}"
    )
    print(f"  r8.faces('<<X').geomType() = {r8.faces('<<X').geomType()!r}")
    print(f"  r9.faces('>>Z').Center().z = {r9.faces('>>Z').Center().z!r}  (> 0)")
    print(
        f"  r9.faces('<<X').normalAt() = "
        f"{vt(r9.faces('<<X').normalAt())!r}  dot(0,0,1)="
        f"{r9.faces('<<X').normalAt().dot(Vector(0, 0, 1))!r}"
    )
    print(f"  r9.faces('<<X').geomType() = {r9.faces('<<X').geomType()!r}")

    # --- internals used by both overloads ---------------------------------
    print()
    print(SEP)
    print("INTERNALS")
    print(SEP)
    from cadquery.occ_impl.shapes import _get_one, _normalize

    print(f"  _get_one_wire(spine) type = {type(_get_one(w, Wire)).__name__}")
    tmp = text("CQ", 1, spine, False)
    print(f"  text('CQ',1,spine,False) == r7 ? {tmp.Volume() == r7.Volume()}")
    base = _get_one(as_list(cf)[0], Face)
    print(f"  _get_one(cf, Face) : {base.geomType()} area={base.Area()!r}")


if __name__ == "__main__":
    main()
