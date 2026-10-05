"""One-shot (N5): which side face did the ref `res1` capture draft?
Print bbox + COM of the frozen ref STEP so the mirror can pick the same face."""
from cadquery.occ_impl.importers import importStep

for name in ("res1", "res2"):
    s = importStep(rf"D:\Faicad\faijs\packages\faijs-cadquery\out\ref\tests.test_free_functions___test_draft__{name}.step").val()
    bb = s.BoundingBox()
    c = s.Center()
    print(
        name,
        f"bb=({bb.xmin:.9f},{bb.ymin:.9f},{bb.zmin:.9f})-({bb.xmax:.9f},{bb.ymax:.9f},{bb.zmax:.9f})",
        f"com=({c.x:.9f},{c.y:.9f},{c.z:.9f})",
        "vol=", s.Volume(),
    )
