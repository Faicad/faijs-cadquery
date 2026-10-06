# One-shot check (P1-1): volume of ref vs cand STEP for the aux-spine cases.
import sys
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp

def vol(path):
    r = STEPControl_Reader()
    if r.ReadFile(path) != IFSelect_RetDone:
        raise RuntimeError("read fail " + path)
    r.TransferRoots()
    s = r.OneShape()
    p = GProp_GProps()
    BRepGProp.VolumeProperties_s(s, p)
    return p.Mass()

base = "out/"
pairs = [
    ("A-testSweep", base + "ref/tests.test_cadquery__TestCadQuery__testSweep__result.step",
     base + "cand/TestCadQuery__testSweep__result.step"),
]
for tag, ref, cand in pairs:
    vr, vc = vol(ref), vol(cand)
    print(f"{tag}: ref={vr!r} cand={vc!r} rel={abs(vr-vc)/vr:.3e}")
