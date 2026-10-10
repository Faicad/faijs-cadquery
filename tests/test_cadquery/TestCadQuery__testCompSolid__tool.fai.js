// source: test_cadquery.py::TestCadQuery::testCompSolid (var tool)
// The ONLY STEP-captured var of testCompSolid is
//   tool = Solid.makeSphere(1, angleDegrees3=120)
// (`result`, the compsolid itself, ERRORED in the ref harness with a COMPSOLID
// KeyError — see tests/mark-blocked.ts for why the old `cast` label was wrong).
//
// `Solid.makeSphere`'s signature is
//   makeSphere(radius, pnt=(0,0,0), dir=(0,0,1), angleDegrees1=0,
//              angleDegrees2=90, angleDegrees3=360)
// so passing only angleDegrees3 leaves a1=0, a2=90 — i.e. the V domain runs
// from the EQUATOR to the NORTH POLE and only the U domain is partial. That is
// NOT `Workplane.sphere`'s default triple (-90/90/360, the full sphere), so all
// three angles must be passed explicitly.
//
// This is `BRepPrimAPI_MakeSphere(gp_Ax2(origin, +Z), 1, 0, pi/2, 2pi/3)`: the
// upper hemisphere cut by a 120-degree longitude wedge, i.e. 1/6 of the sphere.
// ref anchor (probe-ref.ts on the ref STEP): vol 0.698131700798,
// bbox x[-0.5,1] y[0,1] z[0,1], com (0.243569644814, 0.421875, 0.375),
// topo f4/e7/v4/s1.
// port anchor (in-memory, out/verify-sphere-sweep.mts): vol 0.698131700797732,
// same bbox/com to ~1e-15, topo f4/e7/v4 — matches the ref STEP exactly.
import * as cq from '@faicad/faijs-cadquery'
let tool = await cq.sphere(cq.Workplane(), 1, { angle1: 0, angle2: 90, angle3: 120 })
let result = cq.val(tool)
