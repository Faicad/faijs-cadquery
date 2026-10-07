#!/usr/bin/env python3
"""One-shot capture: CadQuery 2.8.0 `testEnclosure` truth.

Purpose (docs/plans/2026-10-06-occt-wasm-extension-plan.md §2.4 C bucket):
`kernel:fillet-chain-reapply` (9 manifest entries) was mislabelled -- the kernel
can chain fillets since occt-wasm #288. The suspected real blocker is *this
repo's* second `.edges("#Z")` on an already-filleted shape (the newly generated
edges are arcs/ellipses, not LINE). This capture pins the upstream truth for:

  1. oshell = box.rect().extrude() .edges("|Z").fillet(10).edges("#Z").fillet(2)
     -- what does the SECOND `.edges("#Z")` actually select (count / geom type /
     center), i.e. the value the direction selector must reproduce.
  2. every exported variable's volume / center-of-mass / bbox / topology counts.

Run with the OCP interpreter:
  C:\\Users\\ylt\\cadquery-env\\Scripts\\python.exe scripts/probe-enclosure-capture.py
"""

import json
import os

import cadquery as cq
from cadquery import Workplane

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")


def metrics(shape):
    """volume / com / bbox / topology for one Shape (or Workplane's val)."""
    s = shape.val() if isinstance(shape, Workplane) else shape
    bb = s.BoundingBox()
    return {
        "volume": s.Volume(),
        "centerOfMass": [s.Center().x, s.Center().y, s.Center().z],
        "bbox": [
            [bb.xmin, bb.ymin, bb.zmin],
            [bb.xmax, bb.ymax, bb.zmax],
        ],
        "faces": len(s.Faces()),
        "edges": len(s.Edges()),
        "vertices": len(s.Vertices()),
    }


def edge_dump(wp, label):
    """{type, center} ordered set for the edges currently selected on `wp`."""
    items = []
    for e in wp.vals():
        c = e.Center()
        items.append(
            {
                "geomType": e.geomType(),
                "center": [c.x, c.y, c.z],
                "length": e.Length(),
            }
        )
    return {"label": label, "count": len(items), "edges": items}


def main():
    # ---- parameters copied verbatim from test_cadquery.py:3277-3303 ----
    p_outerWidth = 100.0
    p_outerLength = 150.0
    p_outerHeight = 50.0
    p_thickness = 3.0
    p_sideRadius = 10.0
    p_topAndBottomRadius = 2.0
    p_screwpostInset = 12.0
    p_screwpostID = 4.0
    p_screwpostOD = 10.0
    p_boreDiameter = 8.0
    p_boreDepth = 1.0
    p_flipLid = True
    p_lipHeight = 1.0

    steps = {}

    # ---- outer shell ----
    oshell = Workplane("XY").rect(p_outerWidth, p_outerLength).extrude(p_outerHeight + p_lipHeight)
    steps["oshell_raw"] = metrics(oshell)

    # THE chain under investigation
    oshell_1 = oshell.edges("|Z").fillet(p_sideRadius)
    steps["oshell_after_fillet1"] = metrics(oshell_1)
    # selector truth #1: what does "|Z" pick on the *raw* box
    steps["sel_edges_pipeZ_raw"] = edge_dump(oshell.edges("|Z"), 'oshell.edges("|Z") on raw box')
    # selector truth #2: what does "#Z" pick on the *already filleted* shape
    sel_hashZ = oshell_1.edges("#Z")
    steps["sel_edges_hashZ_after_fillet1"] = edge_dump(
        sel_hashZ, 'oshell.edges("|Z").fillet(10).edges("#Z")'
    )
    oshell = sel_hashZ.fillet(p_topAndBottomRadius)
    steps["oshell"] = metrics(oshell)

    # ---- inner shell ----
    ishell = (
        oshell.faces("<Z")
        .workplane(p_thickness, True)
        .rect((p_outerWidth - 2.0 * p_thickness), (p_outerLength - 2.0 * p_thickness))
        .extrude((p_outerHeight - 2.0 * p_thickness), False)
    )
    ishell = ishell.edges("|Z").fillet(p_sideRadius - p_thickness)
    steps["ishell"] = metrics(ishell)

    # ---- box = outer cut inner ----
    box = oshell.cut(ishell)
    steps["box"] = metrics(box)

    # ---- screwposts ----
    POSTWIDTH = p_outerWidth - 2.0 * p_screwpostInset
    POSTLENGTH = p_outerLength - 2.0 * p_screwpostInset
    box = (
        box.faces(">Z")
        .workplane(-p_thickness)
        .rect(POSTWIDTH, POSTLENGTH, forConstruction=True)
        .vertices()
        .circle(p_screwpostOD / 2.0)
        .circle(p_screwpostID / 2.0)
        .extrude((-1.0) * (p_outerHeight + p_lipHeight - p_thickness), True)
    )
    steps["box"] = metrics(box)

    # ---- split lid / bottom ----
    (lid, bottom) = (
        box.faces(">Z")
        .workplane(-p_thickness - p_lipHeight)
        .split(keepTop=True, keepBottom=True)
        .all()
    )
    steps["lid"] = metrics(lid)
    steps["bottom"] = metrics(bottom)

    lowerLid = lid.translate((0, 0, -p_lipHeight))
    steps["lowerLid"] = metrics(lowerLid)
    cutlip = lowerLid.cut(bottom).translate(
        (p_outerWidth + p_thickness, 0, p_thickness - p_outerHeight + p_lipHeight)
    )
    steps["cutlip"] = metrics(cutlip)

    topOfLidCenters = (
        cutlip.faces(">Z")
        .workplane()
        .rect(POSTWIDTH, POSTLENGTH, forConstruction=True)
        .vertices()
    )
    steps["topOfLidCenters_count"] = len(topOfLidCenters.vals())

    topOfLid = topOfLidCenters.cboreHole(p_screwpostID, p_boreDiameter, p_boreDepth, (2.0) * p_thickness)
    if p_flipLid:
        topOfLid.rotateAboutCenter((1, 0, 0), 180)
    steps["topOfLid"] = metrics(topOfLid)

    result = topOfLid.union(bottom)
    steps["result"] = metrics(result)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "probe-enclosure-truth.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(steps, f, indent=2, sort_keys=True)
    print("wrote", path)
    for k in ("oshell_raw", "oshell_after_fillet1", "oshell", "ishell", "box", "lid",
              "bottom", "lowerLid", "cutlip", "topOfLid", "result"):
        m = steps[k]
        print(f"{k:22s} vol={m['volume']!r:>22} f{m['faces']}/e{m['edges']}/v{m['vertices']}")
    print("--- selector truth ---")
    for k in ("sel_edges_pipeZ_raw", "sel_edges_hashZ_after_fillet1"):
        s = steps[k]
        print(f"{k}: count={s['count']}")
        types = {}
        for e in s["edges"]:
            types[e["geomType"]] = types.get(e["geomType"], 0) + 1
        print("   geom types:", types)


if __name__ == "__main__":
    main()
