// source: test_selectors.py::TestCQSelectors::testEdgeTypesFilter (var c)
// c = Workplane().ellipse(3, 4).circle(1).extrude(1)
//   — a "TALL" ellipse (y_radius=4 > x_radius=3) with a r=1 hole.
// The kernel's makeEllipseEdge rejects major < minor, so the profile is built
// with the major axis at 4 and rotated a rigid 90° about the workplane normal
// onto +Y — an exact rotation (curveType stays "ellipse"; the old
// "rotations re-approximate it" note came from the matrix path, not `rotate`).
// ref anchor: vol=34.5575191895 (= π(3·4 − 1)), com y=0.0000671044036561,
//   bbox x[-3,3] y[-4,4] z[0,1], topo f4/e6/v4/s1
//
// Residual, recorded not hidden: the port's volume/bbox diff are exactly 0 and
// the topology matches f4/e6/v4, but the centroid differs by 6.71e-5 in y. The
// ref's own com.y is +6.71e-5 while the solid (an axis-aligned 3×4 ellipse with
// a concentric r=1 hole) is symmetric about y=0 — mathematically its com.y must
// be 0, which is what the port produces. So the residual is a numerical artefact
// of the ref's own STEP (asymmetric B-spline wall from upstream's boolean/clean),
// not port approximation: the port's `rotate` keeps the analytic ellipse.
// Boolean diff is 1.48e-3 mm³ (harness tolerance 0.1).
import * as cq from '@faicad/faijs-cadquery'
let wp = await cq.ellipse(cq.Workplane(), 3, 4)
wp = await cq.circle(wp, 1)
let c = await cq.extrude(wp, 1)
let result = cq.val(c)
