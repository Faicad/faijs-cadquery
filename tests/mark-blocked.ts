/**
 * mark-blocked.ts — record hand-written `blocked` annotations in tests/manifest.json.
 *
 * Phase 2 stage B: while writing mirror scripts we hit cases that cq-compat cannot
 * express yet. Instead of leaving them at the machine default (`pending:mirror`,
 * which claims "just needs a script"), we downgrade them to `blocked` with the
 * concrete first missing capability and `manual: true` so gen-manifest.ts keeps
 * the annotation across regenerations.
 *
 * Usage: npx tsx tests/mark-blocked.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(HERE, 'manifest.json')

/** var-level: exact manifest key -> blockedBy */
const BY_KEY: Record<string, string> = {
  // CLOSED 2026-10-07 (occt-wasm 5.6 unblock, T1): `shell` honours the kernel's
  //   5th `joinType` arg and no longer throws on positive thickness + removed
  //   faces, so testLegoBrick__s is ported (f43/e72/v48 bitwise).
  // CLOSED 2026-10-07 (T1 follow-up): `__tmp` was never a kernel gap — it is
  //   the brick plus the 7 hollow posts, i.e. `faces("<Z").workplane(invert=
  //   true).rarray(...,7,1).circle(3.25).circle(2.4).extrude(8.1)`. All of
  //   that was already implemented; only the mirror was missing. Ported
  //   bitwise (f71/e114/v76, volume diff 0); mutation (dropping the inner
  //   circle) turns it red at +21.6% volume. `op:shell` is now empty — do NOT
  //   re-add any lego brick entry.
  // CLOSED 2026-10-10 (N1 / A-class batch): the "single pendingRect/pendingCircle
  //   slot" note was STALE — the `pendingWires` LIST path (extrude branch when
  //   solidWires.length > 1, `extrudePendingWires`) already cuts the construction
  //   rect's four circles as holes. Mirror PASSes bitwise (vol 1.9018252295753182,
  //   f10/e24/v16 = 6 box faces + 4 hole faces). Entry removed so gen-manifest
  //   re-derives it as ported; do NOT re-add.
  // polygon + cutThruAll: makePolygonPrismAt at the through-cut height aborts the
  // occt-wasm process (Node-level crash, not a JS throw) — see U21 in the phase2 plan
  'tests.test_cadquery::TestCadQuery::testPolygonPlugin__s': 'kernel:crash-polygon-cutThruAll',
  // 2-D wire ops not implemented
  // CLOSED 2026-10-03 (roadmap B1-3a, stale label #2): `Workplane.threePointArc`
  //   has existed since the 2-D arc ops — the label was stale too. The mirror
  //   (a 25-step flat chain: nested `await` in an argument position is rejected
  //   by the parser) is a straight PASS: vol 13234.9225135, topo f26/e72/v48.
  // CLOSED 2026-10-03 (roadmap B1-3a, stale label): `Workplane.polyline` has
  //   existed since the 2-D drafting ops — the label was stale, not a missing
  //   API. The mirror now exists and is PASS-NT: geometry is exact against the
  //   ref (vol 5800, boolean diff 0) but the mirrored profile keeps an unhealed
  //   seam on the mirror axis (cand f15/e39/v26 vs ref f14/e36/v24).
  // free-function Solid constructors / CQ() wrapper
  // CLOSED 2026-10-03 (roadmap B1-3a): `Solid.makeCone(radius1, radius2, height)`
  //   is exported as `cq.solidMakeCone` (kernel primitive — core's `cad.cone`
  //   asserts radiusBottom > 0 and rejects the apex-at-base case upstream allows),
  //   and `CQ` (upstream's `CQ = Workplane` alias, cq.py:4565) builds an XY
  //   workplane seeded with a shape. testCone__s / testCone__t both carry mirrors
  //   and parity-PASS against their refs (vol 2.09439510239, com z 1.5).
  //   NOTE: `Workplane.plugin` / the CadQuery plugin-pattern (testCylinderPlugin)
  //   is NOT a `blocked` (future-gap) case — it is explicitly OUT OF SCOPE and is
  //   recorded as `skipped` in manifest.json (roadmap §2.3, like VTK/GLTF/VRML).
  //   `Workplane.plugin` was a CadQuery 1.x method removed in 2.x; the upstream
  //   test only demonstrates monkey-patching a class method (internally
  //   `eachpoint(lambda) + union`). The underlying `eachpoint`-lambda capability
  //   is a real future gap tracked separately by G-C25 / testCompoundCenter__s.
  //   => removed from BY_KEY 2026-10-04 so gen-manifest won't re-pin it to blocked.
  // CLOSED 2026-10-03 (roadmap B1-3a, stale label #3): `findSolid` has been
  //   exported since the object-stack work (P3) — the label was stale. Mirror
  //   `testFindSolid__s` is a straight PASS (compound of the two uncombined
  //   cubes: vol 2, topo f12/e24/v16/s2).
  // extrude(both=) / extrude(combine="cut"|"s") — CLOSED 2026-10-03 (roadmap B1-6):
  //   testExtrude__s / __wp_ref (both=True), testExtrude__wp /
  //   __wp_ref_regular_cut (combine="s"), and testExtrude__r (combine="cut") now
  //   all carry mirrors. The five BY_KEY entries were removed so gen-manifest
  //   re-derives them as `ported` (their manifest.json entries were cleared too —
  //   gen-manifest preserves any prior `blocked` + `manual:true` annotation).
  // cutBlind("last"|"next") — untilLastFace / untilNextFace
  'tests.test_cadquery::TestCadQuery::testCutBlindUntilFace__wp': 'op:cutBlind.until-face',
  'tests.test_cadquery::TestCadQuery::testCutBlindUntilFace__wp_last': 'op:cutBlind.until-face',
  'tests.test_cadquery::TestCadQuery::testCutBlindUntilFace__wp_next': 'op:cutBlind.until-face',
  // Shape.faces(">Z") face-compound extraction WORKS (faceCompound op, script kept
  // as .fai.js.blocked) but the faijs STEP exporter only handles shapes with solid
  // sub-shapes — exportStepFromSolids throws "shape contains no solid sub-shapes"
  // for a compound of faces (ref exports it fine via Shape.exportStep)
  // U22 resolved 2026-09-09: exportStepFromSolids now dispatches solid -> shell
  // -> face, so face-compound parts export. The four former
  // 'step-export:faces-compound' entries (test_single_ent_selector__fs,
  // test_constructors__c1/c2, test_extrude_face__c) are mirrored and passing.
  // Shape-domain offset — CLOSED 2026-10-04 (roadmap B2-5). The free functions
  //   `plane(w,l)` (`shapes.py:6381`) and `offset(s,t,{cap,both})`
  //   (`shapes.py:6969`) are now implemented in `src/workplane.ts`; all four
  //   test_offset vars mirror and PASS (vol/bbox/com deltas <= 2e-14).
  //   Kernel mapping: offset == `OcctKernel.thicken(shape,t,tol)` (documented as
  //   "thicken a face/shell into a solid"), probe-verified against the 2.8.0
  //   capture for the face (vol 1), shell-inward (vol 0.875) and both=True
  //   (vol 2, fuse of +t/-t) shapes. See the `plane` / `offset` JSDoc.
  //   The four BY_KEY entries were REMOVED so gen-manifest re-derives them as
  //   `ported` (it preserves any prior blocked+manual:true annotation).
  //   Do NOT re-add.
  // ---------------------------------------------------------------------------
  // Phase 2 stage K (batch 2) — verified unreproducible, 2026-09-10
  // ---------------------------------------------------------------------------
  // Loft over COPLANAR sections (w1 = circle(1) and w2 = ellipse(1.5,1).move(0,
  // y=1) both sit at z=0). occt-wasm's `loft(wires, solid, ruled)` exposes none
  // of the upstream BRepOffsetAPI_ThruSections knobs (C2 continuity, uniform
  // parametrization, degree 3, CheckCompatibility), so the two builders diverge
  // only when sections share a plane: measured non-coplanar controls all match
  // exactly (3 circles 12.566370; circle/ellipse/circle 16.755155; spread +
  // tilted 17.320334 vs 17.320002) while the coplanar variant lands at
  // 19.798698 vs upstream 17.148726.
  'tests.test_free_functions:::test_loft__r4': 'kernel:loft-coplanar-sections',
  // The exported value is `compound(plane(1,1), vertex(0,0,1))`; the ref STEP is
  // a degenerate compound (vol -0.037037, one lone face) and the comparator's
  // boolean-difference probe fails on it ("cut: boolean operation failed"), so
  // no candidate can be graded.
  'tests.test_cadquery::TestCadQuery::test_loft_to_vertex__c': 'ref:degenerate-compound-vertex',
  // CLOSED 2026-10-07 (occt-wasm 5.6 unblock, T1). The stale reason above claimed
  //   the kernel only offers an arc offset — refuted by probe: occt-wasm 5.6
  //   binds `shell(solid, faces, thickness, tol, joinType)` and
  //   `offset(shape, t, tol, joinType)` (dist/index.d.ts:172/188). Positive
  //   thickness + removed faces now routes through kernel.shell with the
  //   upstream sign, and all three vars are ported bitwise
  //   (s1 f23/e48/v28, s2 f5/e6/v4, s3 f6/e8/v5). Do NOT re-add.
  // CLOSED 2026-10-10 (N1 / A-class): "the kernel lays the major axis on global
  //   X and every rotation re-approximates the curve" was wrong on both counts —
  //   probed in src/ellipse-axis.probe.test.ts. `makeEllipseEdge` puts the major
  //   axis on gp_Ax2(center, normal)'s DEFAULT X direction, which depends on the
  //   normal (+Z→+X, -Z→-X, ±X→±Z, ±Y→±Z, (1,1,0)→(1,-1,0)/√2,
  //   (1,1,1)→(1,0,-1)/√2), and a RIGID `rotate` keeps the analytic ellipse
  //   (curveType still "ellipse", volume π·major·minor to machine precision) —
  //   only the matrix path degrades it. It still rejects major < minor, so
  //   buildProfileWire now builds the wide edge, MEASURES the major direction
  //   (curvePointAtParam at FirstParameter = the major endpoint) and rotates it
  //   about the plane normal onto the plane's +Y. Mirror is PASS: volΔ 0,
  //   bboxΔ 0, topo f4/e6/v4, centroidΔ 6.7e-5 (the REF's artefact — its own
  //   com.y is +6.71e-5 for a solid that is symmetric about y=0). Mutation gate:
  //   swapping the radii keeps the volume but pushes bboxΔ to 1 → FAIL.
  //   Entry removed so gen-manifest re-derives ported.
  // ---------------------------------------------------------------------------
  // Sweep family — RECLASSIFIED 2026-10-04 (roadmap B2-3 completion)
  // ---------------------------------------------------------------------------
  // Multi-section pipe shell. Upstream's multisection sweep AND the free
  // `sweep(sections, path)` both build ONE `BRepOffsetAPI_MakePipeShell(spine)`
  // and call `builder.Add(section, False, False)` once per section
  // (occ_impl/shapes.py:4682 `Solid.sweep_multi`). occt-wasm exposes ONLY the
  // single-profile wrapper `sweepPipeShell(profile, spine, freenet?, smooth?)`
  // (index.d.ts:169) — no multi-`Add` binding. `sweepWithLaw` is a different
  // mechanism (profile scaling, not section interpolation) and `loft` does not
  // follow a spine. Measured 2026-10-04, every composition is wrong:
  //   specialSweep (2 sections, straight spine, ref vol 62.4256):
  //     loft[c@-10,c@0,r@10] 65.7339 (Δ5.3%) | sweep(circle) 62.8319 (Δ0.65%, 3f)
  //     | sweep(rect) 80.0000 (Δ28%)
  //   r5 (2 identical rect sections + B-spline spine, ref vol 0.913416):
  //     sweep(rect, p2) gives vol 0.913424 (Δ8.8e-6) but bb z[-0.008,1.400] vs
  //     ref [0,1] — a single profile caps PERPENDICULAR to the spine, while the
  //     multi-section pipe caps at the sections' planes. Different solids.
  //   arcSweep (4 sections on a curved spine) / r7 (2 differing face sections):
  //     a straight-section loft cannot follow the spine at all.
  //   normalSweep (2 sections + normal=(0,1,1)): only the multi-section half is
  //     missing — the single-profile FixedUp path is parity-verified.
  // => relabelled from `op:sweep.multisection` / `op:sweep.pipeshell` (both of
  //    which claimed an in-repo op was missing) to a KERNEL binding gap.
  //    Kernel work: expose multi-section `Add` (roadmap B2-3 / B6).
  'tests.test_cadquery::TestCadQuery::testMultisectionSweep__specialSweep': 'kernel:sweep-multisection-pipe',
  'tests.test_cadquery::TestCadQuery::testMultisectionSweep__arcSweep': 'kernel:sweep-multisection-pipe',
  'tests.test_cadquery::TestCadQuery::testMultisectionSweep__normalSweep': 'kernel:sweep-multisection-pipe',
  // circletorectSweep uses the SAME straight-spine loft as its two PASSING
  //   siblings (defaultSweep / recttocircleSweep). The geometry is exact
  //   (volΔ 1.13e-5 relative, all 7 face areas within 1e-5, topo f7/e15/v10)
  //   but the comparator's boolean cross-check degenerates on the
  //   near-coincident B-spline surfaces (cut(ref,cand) = the whole ref,
  //   common = 0, fuse = -2.1e-4) while each solid cuts correctly against an
  //   external half-box (common 36.7390 / 36.7395) and the boolean returns to
  //   normal once the near-coincidence is broken (scale cand by 0.98 -> 4.44).
  //   Same class as the twistExtrude entries below; no in-repo fix (B6-3).
  'tests.test_cadquery::TestCadQuery::testMultisectionSweep__circletorectSweep': 'kernel:boolean-near-coincident-bspline',
  // Auxiliary-spine sweep — RECLASSIFIED 2026-10-04 (was op:sweep.aux-spine).
  //   The op is now IMPLEMENTED: the kernel exposes `sweepOriented` with a
  //   SweepMode.Auxiliary (3) channel, and `sweep(…, {auxSpine})` is wired to it.
  //   But that kernel mode is NOT equivalent to the OCP call CadQuery makes,
  //   `BRepOffsetAPI_MakePipeShell::SetMode(aux, CurvilinearEquivalence=True)`
  //   (occ_impl/shapes.py:4587). Measured on TestCadQuery::testSweep's aux case
  //   (path 102.50 long, guide 105.23):
  //     kernel sweepOriented(...,3,up,aux) -> vol 17759.157  (12.2 % off ref)
  //     OCP SetMode(aux, True)             -> vol 20218.347  (== ref)
  //     OCP SetMode(aux, False)            -> vol 20500.445
  //     OCP default / Fixed                -> vol 20500.455
  //     OCP Frenet                         -> vol 19295.966
  //   The kernel mode only coincides with CadQuery when the guide's
  //   reparametrisation is a no-op (equal-length guides, e.g. test_sweep_aux's
  //   length-1 guide, which DOES match the ref: volΔ 4.3e-6, topo f6/e12/v8), so
  //   it cannot be relied on. `sweep(auxSpine=…)` therefore REJECTS LOUDLY
  //   (workplane.ts) rather than returning divergent geometry — same rule as the
  //   `draft` neutral-plane rejection. `normal=` (SweepMode.FixedUp) IS
  //   parity-verified and stays implemented.
  //   Kernel binding needed to lift: expose CurvilinearEquivalence on the
  //   auxiliary-spine mode (roadmap G-C9 / B6).
  //   RE-VERIFIED 2026-10-07 against occt-wasm 5.6 on BOTH entry points
  //   (sweepAdvanced and the newer sweepFull): the flag is NOT ignored —
  //   CE=true and CE=false give different solids — but CE=true, the mode
  //   CadQuery defaults to, is 12.163% off (17759.15746693434 vs 20218.347),
  //   and sweepFull reproduces sweepAdvanced to the digit, so the new entry
  //   point closes nothing. CE=false (20500.445) and Fixed (20500.455) ARE
  //   bit-exact against OCP — only the default mode is wrong.
  //   Kernel-side probe: scripts/_analysis/probe-aux-spine-sweepfull.mjs;
  //   frozen by src/sweep-aux-spine-sweepfull.probe.test.ts; the loud
  //   rejection is frozen by src/sweep-aux-spine-guard.test.ts.
  'tests.test_cadquery::TestCadQuery::testSweep__result': 'kernel:sweep-aux-spine-mode',
  // CLOSED 2026-10-04 (roadmap B2-3): test_sweep r6/r8 were mislabelled
  //   `op:sweep.pipeshell` — the SINGLE-profile path already reproduces them.
  //   r8 (plain face, no hole) = a wire-level `sweep(rect, spline)`, an exact
  //   hit (volΔ 3e-12, topo f6/e12/v8). r6 (face with an inner wire) = upstream
  //   `Solid.sweep(face, path)`, which expands to `sweep(face.outerWire(),
  //   face.innerWires(), path)` + `rv.cut(*inner_shapes)` (shapes.py:4638-4655)
  //   — expressed as `sweep(outer) cut sweep(inner)`; verified exact
  //   (volΔ 2e-12, topo f7/e15/v10). Both BY_KEY entries were REMOVED and their
  //   manifest.json entries cleared so gen-manifest re-derives them as `ported`
  //   (it preserves any prior blocked+manual:true annotation). Do NOT re-add.
  // r5 / r7 stay blocked — they are true multi-section pipes (see the
  // `kernel:sweep-multisection-pipe` block above).
  'tests.test_free_functions:::test_sweep__r5': 'kernel:sweep-multisection-pipe',
  'tests.test_free_functions:::test_sweep__r7': 'kernel:sweep-multisection-pipe',
  // see the block above (kernel:sweep-aux-spine-mode)
  'tests.test_free_functions:::test_sweep_aux__r1': 'kernel:sweep-aux-spine-mode',
  'tests.test_free_functions:::test_sweep_aux__r2': 'kernel:sweep-aux-spine-mode',
  // ---------------------------------------------------------------------------
  // Gear-extension ops E1–E4 parity (2026-09-11) — the mirrors run and produce
  // candidate STEPs, but the SOLID-oriented comparator cannot grade them. Each
  // snapshot below is the measured evidence that the geometry itself matches.
  // ---------------------------------------------------------------------------
  // E1 splineFace produces a FACE. The comparator's volume / centre-of-mass
  // metrics are undefined for a non-solid (measured volPct 575 %, centroid
  // 9.5e15) while bbox (4.4e-16) and topology (f1/e4/v4) match exactly. The
  // default `row-approx-loft` strategy matches CadQuery Face.makeSplineApprox
  // to 4.2e-11 (straight) / 5.6e-7 (helical) on gear grids and bit-identically
  // on polynomial grids (area 1608.303209872); the opt-in `grid` strategy
  // diverges (≈2.3e-4) because occt-wasm exposes no DegMin/DegMax/Tol3D surface
  // fit — it can only fit the whole grid with kernel defaults.
  'tests.test_cadquery::TestFace::testSplineApproxPoly__r': 'comparator:non-solid-metrics',
  // E2 helix produces a WIRE. The in-memory wire is exact (len 51.250548550 vs
  // ref 51.250549089), but occt-wasm's STEP writer degrades the helix B-spline
  // (24 poles vs CadQuery's 85), so the round-tripped candidate measures
  // 44.1568406 and its bbox differs by 5.4e-3 — an export-fidelity bug, not a
  // geometry error.
  'tests.test_cadquery::TestCadQuery::testMakeHelix__r': 'kernel:step-export-wire-fidelity',
  // E4 twistExtrude is a solid whose volume/centroid/bbox/topology all match the
  // reference to machine precision (volDiffPct 2.6e-5 %, centroid 3.6e-14,
  // vertices identical, both shapes valid), but BRepAlgoAPI_Cut on the two
  // near-coincident twisted B-spline solids fails asymmetrically (A-B 2.6e-4,
  // B-A 999.99 = the whole solid; stable across 8..128 loft sections, with or
  // without a STEP round-trip), so the comparator's boolean probe cannot grade it.
  'tests.test_cadquery::TestCadQuery::testTwistExtrude__r': 'kernel:boolean-near-coincident-bspline',
  // ---------------------------------------------------------------------------
  // pending:mirror cleanup batch (2026-09-11) — verified unreproducible
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // CLOSED 2026-10-03 (roadmap B1-7): wedge() with a degenerate (point) top.
  // Upstream CadQuery 2.8.0 builds a 5-face pyramid when xmin==xmax && zmin==zmax;
  // cq-compat now lofts the bottom wire to the apex vertex via `loftWithVertices`
  // (BRepOffsetAPI_ThruSections::AddVertex). The three mirrors
  // (testWedgeDefaults__s / testWedgeCombined__s / testWedgePointList__s) are in
  // place and parity-PASS. Also fixed: wedge fed its kernel-built solid to
  // `cad.translate`, which the CLI's autoLift:false path rejected via the
  // N1 guard (E_TOPO_UNTRACKED_INPUT) — it now uses kernel-level `translateBrep`.
  // ---------------------------------------------------------------------------
  // twistExtrude of a rect by 45deg over height 10 produces a twisted B-spline
  // solid; the comparator's symmetric boolean probe fails asymmetrically on the
  // near-coincident surfaces (same root cause as E4 testTwistExtrude,
  // kernel:boolean-near-coincident-bspline). Geometry itself matches to machine
  // precision (volΔ% 2.6e-5) — keep blocked until the kernel boolean is robust.
  'tests.test_cadquery::TestCadQuery::testTwistExtrudeCombine__r': 'kernel:boolean-near-coincident-bspline',
  // Free-function text() (2026-09-30, updated 2026-10-05 / roadmap N4):
  //  - the FLAT overload `text(txt, size, font, path, kind, halign, valign)` is
  //    mirrored and passing (test_text__r1..r5, __c);
  //  - the SPINE overload `text(txt, size, spine, planar)` IS IMPLEMENTED
  //    (`textOnSpine` + `src/spine-frame.ts`) and both mirrors exist
  //    (test_text__r7 / __r8). Their GEOMETRY is verified independently:
  //    bbox matches the ref to 5.5e-13, every face normal matches the ref
  //    exactly, and the glyph area matches a Green's-theorem integral of the
  //    font outline to 1e-15. They are pinned `blocked` anyway because the
  //    COMPARATOR cannot grade them, and pinning is the only encoding that
  //    survives gen-manifest (`manual: true`) — dropping them would have the
  //    next regeneration call them ported and lose the finding.
  //
  //    WHY the comparator cannot grade them: both results are OPEN 2-D shells,
  //    and compare.ts runs its volume/COM/boolean probes whenever
  //    `faces > 0` (step-compare.ts `hasMass`). For an open shell
  //    `BRepGProp::VolumeProperties` is `∮x·n dA`, not a volume:
  //      · r7 — the two glyph planes are nearly antiparallel, so the integral is
  //        a near-total cancellation of ~0.25-sized contributions. Measured raw
  //        (occt-wasm, the comparator's own reader): ref 0.003036936696537975 vs
  //        cand 0.003388861288015331 → 11.6 %, which is downstream of NOTHING but
  //        OCC's own glyph-outline approximation (2.8e-5 relative, see below) —
  //        the metric amplifies it ~4000x. Before the glyph-orientation fix in
  //        `src/text-solid.ts#reverseWire` the sign flip read 212 % = 200 % + 12 %.
  //      · r8 — ref volume is EXACTLY 0 and com (0,0,0); cand volume is 2.07e-19
  //        (numerically zero), so `getCenterOfMass` returns a real point and
  //        comΔ = 4.98. A knife-edge on floating-point noise.
  //    So no correct implementation passes; the only way would be to reproduce
  //    OCC's coarsened outline, i.e. to be deliberately less exact.
  //
  //    The 2.8e-5 area gap itself is OCC's approximation, measured not guessed:
  //    ref "C" has 4 edges (`LINE,BSPLINE,LINE,BSPLINE`) against the outline's
  //    22 (ref f2/e12/v12 vs cand f2/e49/v49), and a Green's-theorem integral of
  //    the font outline gives 0.3480125268300373 against the capture's
  //    0.3480026696998122 — our faces are the exact ones. Pinned as a unit test
  //    (`src/text-spine.test.ts` → "is EXACT on the glyph area…").
  'tests.test_free_functions:::test_text__r7': 'comparator:open-shell-volume',
  'tests.test_free_functions:::test_text__r8': 'comparator:open-shell-volume',
  //  - **r9 stays blocked** on a real capability gap: `text(txt, size, spine,
  //    base)` is `tmp = text(txt, size, spine, False)` then
  //    `f.project(base, f.normalAt())` (`occ_impl/shapes.py:6805`), and
  //    `Face.project` = OCCT `BRepProj_Projection`, which occt-wasm does not bind
  //    (the kernel has only the POINT projections `projectPointOnFace` /
  //    `projectPointOnEdge` and the HLR `projectEdges`). Same gap as
  //    `test_project__res`, so it carries the same label.
  //  - test_faceOn engraves text onto a spherical FACE via `faceOn(f, text(…)`;
  //    `faceOn` is a `cadquery.func`-only op (never a Workplane/Shape method)
  //    that cq-compat does not implement.
  'tests.test_free_functions:::test_text__r9': 'op:project',
  'tests.test_free_functions:::test_faceOn__f2': 'op:faceOn',
  // draft(): the `kernel:draft-existing-solid` label for test_draft__res1/res2
  // was STALE — the kernel does have `draft` (single-face, origin neutral), and
  // both mirrors now PASS bit-for-bit (volΔ/comΔ/bboxΔ 0, topo f6/e12/v8).
  // Entries deliberately REMOVED (N5, 2026-10-05); re-adding them here would
  // silently revert the ported cases to blocked on the next regen (the
  // stamp-only-check-nothing trap). See roadmap §10.4.5.
  // project(): edge-to-surface projection (project(e, base) onto a cylinder
  // face). No cq-compat op or kernel projection exists.
  'tests.test_free_functions:::test_project__res': 'op:project',
  // Solved-assembly compounds: the Plane-constraint solver produces rotations
  // that are not clean angles (measured: constrain simple_assy s1 = 1x1x2 box
  // tilted ~4.25 deg, com (1,-4.5,0.5); subassy1/subassy2/nested_assy solved
  // placements likewise). The assembly solver is out of scope for mirrors
  // (handover doc §8.1 Assembly group, remote-phase item).
  'tests.test_assembly:::test_constrain__simple_assy': 'op:assembly-solve',
  'tests.test_assembly:::test_constrain__nested_assy': 'op:assembly-solve',
  'tests.test_assembly:::test_constrain__subassy1': 'op:assembly-solve',
  'tests.test_assembly:::test_constrain__subassy2': 'op:assembly-solve',
  // FixedAxis (0,1,1) solver output is not the minimal rotation: measured ref
  // bbox x ±1.026 / y,z ±0.745 for a 2x1x1 box (a pure -45 deg x rotation
  // would give exactly ±1 / ±0.7071 like test_fixed_rotation does) — the
  // solver's rotation cannot be reconstructed without the solver itself.
  // CLOSED as UNREACHABLE (2026-10-11 convergence-alignment experiment):
  // FixedAxis leaves the twist DOF about (0,1,1) underdetermined — the final
  // rotation depends on the optimizer's trajectory, not the constraint set.
  // Replicated CQ solver.py's exact m-parameterization + penalty (1e-16) in a
  // standalone LM (out/_diag/_lm_exp.mjs, committed probe): driving to the
  // true penalized minimum (obj ~1e-15) lands on quat (0.347,-0.161,-0.389,
  // -0.838), while CQ IPOPT returns (-0.3825,0.0104,0.0250,0.9235) and the
  // shipped faijs LM (-0.3825,0.0112,0.0272,0.9235) — three DIFFERENT legal
  // solutions on the same manifold. The pure minimal-angle snap differs from
  // ref bbox by 0.026–0.038 >> the 1e-3 tolerance, so no solver-side knob
  // (init/tolerances/parameterization) reaches bitwise equality. Blocked on a
  // bitwise-stable comparator channel for underdetermined poses (cross-repo).
  'tests.test_assembly:::test_unary_constraints__simple_assy2': 'op:assembly-solve',
  'tests.test_assembly:::test_unary_constraints__assy': 'op:assembly-solve',
  'tests.test_assembly:::test_unary_constraints__w': 'op:assembly-solve',
  // box_and_vertex: solved compound of box + cylinder + a VERTEX whose exact
  // PointInPlane position is underdetermined (only plane distances are
  // asserted; the vertex contributes to the ref compound but its solved
  // position cannot be pinned without the solver).
  'tests.test_assembly:::test_PointInPlane_3_parts__box_and_vertex': 'op:assembly-solve',
  // ---------------------------------------------------------------------------
  // Exported-API batch (2026-10-01) — split/section/sweep/offset2D/mirrorX/
  // mirrorY/polarArray/rotateAboutCenter/slot2D/… were already implemented in
  // src/workplane.ts but missing from src/index.ts, so the coverage analyzer
  // counted them as missing. Exporting them flipped 26 cases to
  // pending:mirror; 10 were mirrored and pass (testSection box/s1/s2,
  // testSlot2D box/result, testRotateAboutCenter r, testPolarArray s,
  // testSimpleMirror s, testOccBottle p). These are the ones that turned out to
  // be genuine gaps behind the analyzer's false "portable" verdict.
  // ---------------------------------------------------------------------------
  // offset2D of a self-intersecting shrinking profile (polyline+mirrorX+
  // mirrorY, offset -0.9): upstream OCC MakeOffset2D SPLITS the offset into 4
  // independent closed regions (ref s4 / vol 1.15123653709), while the kernel
  // offsetWire2D returns per-input-wire COMPOUNDS of 2 wires (large ring,
  // face area 72.37 vs upstream's small regions) — a MakeOffset2D semantics
  // gap, NOT a missing end-cap (probed 2026-10-01: degree analysis shows no
  // dangling endpoints; makeFace on the sub-wire succeeds with the wrong
  // area). Needs the kernel's full multi-region offset semantics.
  'tests.test_cadquery::TestCadQuery::testOffset2D__s': 'op:offset2D-multi-region',
  // CLOSED 2026-10-07 (C 桶误判标签，见 docs/plans/2026-10-06-occt-wasm-extension-plan.md
  //   §2.4): the `kernel:fillet-chain-reapply` label was WRONG on two counts.
  //   (1) The kernel half was already fixed upstream (`#288`, shipped in occt-wasm
  //       5.6.0) — chained fillet works; `probe-fillet-chain.mjs` proves it.
  //   (2) The real blockers were two cq-compat bugs, both found and fixed while
  //       writing the mirrors:
  //       a) `faceWithHoles` DISCARDED the return value of `addHolesInFace`
  //          (which returns the holed face instead of mutating in place), so
  //          every nested profile extruded solid — `circle(5).circle(2)` gave
  //          785.398 (f3) where upstream gives the tube 659.734 (f4), and
  //          `rect(10,10).rect(4,4).extrude(10)` gave 1000 (f6) vs 840 (f10).
  //       b) `Workplane.translate` moved `wp.origin`. Upstream keeps the plane
  //          (`newObject()` preserves `self.plane`), so `workplane()`'s default
  //          ProjectedOrigin re-anchored to the translated centre and
  //          `topOfLid` drilled 4 counterbores INTO the part (vol -352) where
  //          upstream drills into empty space (topOfLid == cutlip, vol identical).
  //   All 9 mirrors now exist and parity-PASS bit-for-bit (vol Δ ~1e-13).
  //   => removed from BY_KEY 2026-10-07 so gen-manifest won't re-pin them to blocked.
  // extrude("next"/"last") — untilNextFace/untilLastFace — plus the indexed
  // face selector `faces(">X[1]")`. Neither exists. NOTE: the ref geometry also
  // disagrees with a straight reading of the source (wp_ref measures s3 /
  // vol 2125 / bbox x[-5, 32.5] where two 10³ boxes would be s2 / 2000 /
  // x[-5, 25]), so even once the ops land the mirror needs re-deriving.
  'tests.test_cadquery::TestCadQuery::testExtrudeUntilFace__wp_ref': 'op:extrude-until-face',
  'tests.test_cadquery::TestCadQuery::testExtrudeUntilFace__wp_ref_extrude': 'op:extrude-until-face',
  'tests.test_cadquery::TestCadQuery::testExtrudeUntilFace__part': 'op:extrude-until-face',
  'tests.test_cadquery::TestCadQuery::testExtrudeUntilFace__part_section': 'op:extrude-until-face',
  // r2 = Workplane().box(1,1,3).split(r1) where r1 is a parametricSurface.
  //   `parametricSurface` itself SHIPPED in 9a9cc94, so the old label
  //   `op:parametricSurface` was stale — the real gate is that `split()` only
  //   handles a PLANAR face (op:splitByFace, a C-class kernel gap). Re-labelled
  //   2026-10-10 (N1): the manifest already carried op:splitByFace, so running
  //   mark-blocked reverted it to the stale tag; keeping the two in sync.
  'tests.test_cadquery::TestCadQuery::testParametricSurface__r2': 'op:splitByFace',
  // CLOSED 2026-10-10 (N2-1): the angle-domain sphere shipped. `tool` =
  //   Solid.makeSphere(1, angleDegrees3=120) = BRepPrimAPI_MakeSphere(Ax2, 1, 0,
  //   pi/2, 2pi/3) is now reproducible: `cq.sphere(wp, 1, { angle1: 0, angle2: 90,
  //   angle3: 120 })` builds the meridian slice and revolves it (see
  //   `angleDomainSphere` in src/workplane.ts). Bitwise PASS on the harness —
  //   volDelta 5.2e-11 %, comDelta 9.4e-14, bboxDelta 2.4e-16, topo ref f4/e7/v4
  //   == cand f4/e7/v4.
  //   Capture corrections that shipped with it: (a) the old note's `cast` label
  //   was already retagged here in N1 — `result` (the compsolid) ERRORED in the
  //   ref, this `tool` var is the only gradeable one; (b) `Solid.makeSphere`
  //   defaults are a1=0/a2=90 (a HEMISPHERE), unlike `Workplane.sphere`'s
  //   -90/90/360; (c) OCCT's V domain is a slice between two PARALLEL DISCS, not
  //   a sector to the centre — a sector reproduces the volume only when a bound
  //   is a pole or the equator and is off by up to 2x in between.
  // sweep with an inner-hole section CLOSED (2026-10-01): the ref STEP for
  // test_history_sweep__res is a PLAIN UNIT BOX (vol=1.0, f6/e12/v8/s1) — a
  // ref-side anomaly, not the hollow-tube sweep product the upstream
  // expression builds. The mirror reproduces the ref geometry (comment pins
  // the anomaly). No sweep-hole-section capability is implied by the flip.
  // `side` is a History sub-shape lookup (op.generated(f1.outerWire().edges())),
  // not pure geometry — same class as test_history_extrude__sides (§7.2).
  'tests.test_free_functions:::test_history_sweep__side': 'op:history-subshape',
  // ---------------------------------------------------------------------------
  // pending:mirror cleanup batch (2026-10-01) — triaged against upstream sources
  // ---------------------------------------------------------------------------
  // cut = box.faces(">Z").workplane(invert=True).rect(1.5,5)
  //        .twistExtrude(10, 90, combine="cut") — the 90°-twist tool cut into
  // the box hangs the kernel boolean (>300 s, no completion), the same
  // near-coincident twisted B-spline boolean gap as testTwistExtrude/Combine.
  'tests.test_cadquery::TestCadQuery::testTwistExtrudeCombineCut__cut': 'kernel:boolean-near-coincident-bspline',
  // union/intersect with tol=eps (fuzzy boolean) — UNBLOCKED 2026-10-06 (P2-2):
  // occt-wasm 5.6's booleanOp now carries fuzzyValue, and cq-compat's
  // union/cut/intersect expose it as `{tol}` (routed through booleanOpBase).
  // Calibrated bit-equal vs CadQuery 2.8.0 (union tol=1e-3 → 2.001 after clean;
  // see src/boolean-op-base.test.ts + scripts/probe-fuzzy-bool.py). All five
  // tol-dependent vars (res_fuzzy / res_fuzzy2 / res_fuzzy_intersect / _cmp /
  // _val) are mirrored and pass parity (6/6 PASS, 2026-10-06). BY_KEY entries
  // REMOVED so gen-manifest re-derives them as ported. Do NOT re-add.
  // Solid.makeSolid(Shell.makeShell(faces)) over 4 arbitrary 3D triangle faces
  // CLOSED (2026-10-01): faceFromPoints (3D vertex ring -> wire -> face) +
  // solidFromFaces give the exact √2/12 tetrahedron; mirror parity PASS.
  // NOTE: solidFromFaces' first argument is the FRAME workplane, not a face —
  // passing f1 there silently drops it from the sew (3 faces, vol √2/18).
  // Assembly solver cases: solved placements need the constraint solver
  // (PointOnLine / Point via expression grammar / tag-based selection), same
  // class as the existing op:assembly-solve entries.
  // N3 收口（2026-10-11）：以下 5 条已写镜像并逐位 PASS（parity compare cen/bbox
  // ~1e-10 / 0，变异测试 src/assembly-n3-mutation.test.ts 5/5 红→绿），BY_KEY 移除，
  // gen-manifest 重扫即翻 ported：
  //   - point_on_line ×3（FixedAxis×2 + PointOnLine 边约束）
  //   - constrain_with_tags / expression_grammar（未求解装配初始位姿链）
  'tests.test_assembly:::test_PointInPlane_constraint__box_and_vertex': 'op:assembly-solve',
  // CLOSED (found 2026-10-05 while flipping the free-function `text` spine
  //   overload): the five pytest.raises error-path cases (duplicate name /
  //   empty solve / invalid constraint kind / unary-with-solve / save-raises)
  //   were pinned here as 'raises', but all five have had committed mirrors for
  //   a while and gen-manifest reports them `ported`. The pins were therefore
  //   STALE — and latent: because `mark-blocked.ts` only writes, nothing
  //   surfaced them until a later run re-annotated all five back to `blocked`
  //   (`manual: true`), i.e. a silent REGRESSION of 5 ported cases waiting for
  //   the next person to run the script. Removed so regeneration keeps them
  //   ported (do NOT re-add; the same trap is documented on the plane() /
  //   findSolid / polyline / addCavity closures above).
  // NOTE: they are case-level `raises` — the upstream test asserts an exception,
  // so their ref runs export no geometry. That is why they are easy to mistake
  // for non-portable; the mirrors assert the same raise through the DSL.
  // STEP subshape metadata round-trip (subshape names/colors/layers) —
  // importStep/load return plain members; no _subshape_names metadata channel.
  'tests.test_assembly:::test_assembly_subshape_import__subshape_assy': 'op:assembly-subshape-import',
  'tests.test_assembly:::test_assembly_subshape_import__imported_assy': 'op:assembly-subshape-import',
  'tests.test_assembly:::test_assembly_multi_subshape_import__multi_subshape_assy': 'op:assembly-subshape-import',
  'tests.test_assembly:::test_assembly_multi_subshape_import__imported_assy': 'op:assembly-subshape-import',
  // `assy` = simple_assy AFTER assy.save(step) + re-import. The ref captured a
  //   CadQuery assembly-STEP artefact: the part added as a raw Solid.makeBox is
  //   DROPPED on round trip (out/ref/manifest.json: assy_orig vol 9 vs assy
  //   vol 8, f24/e48/v32 -> f18/e36/v24). Our round trip is lossless (vol 9), so
  //   a bitwise match is impossible without hand-faking the artefact — refused
  //   (plan §4.5-4 / §6.2, "don't impersonate"). Its pre-export twin
  //   `__assy_orig` (vol 9) IS ported. Divergence documented in
  //   tests/test_assembly/test_assembly_step_import_roundtrip__assy.fai.js.blocked.
  'tests.test_assembly:::test_assembly_step_import_roundtrip__assy': 'ref:step-roundtrip-drops-part',
  // CLOSED 2026-10-07 (occt-wasm 5.6 unblock, T2-b): test_native_export /
  //   test_save_stl_formats assert on FILE OUTPUT (XCAF-XML exists, STL
  //   binary-vs-ASCII), which is not STEP-observable — exactly the class
  //   test_export / test_save_raises / test_step_export already cover by
  //   mirroring the fixture compound. Both now follow that convention and are
  //   ported bitwise (f24/e48/v32 and f14/e30/v20, volume diff 0).
  //   NOTE: the export FORMAT work itself (BREP/STL writers, the XCAF-XML
  //   serializer) is still a real value-plane gap — it is simply not what
  //   gates these two cases. Do NOT re-add.
  // Visualizer exporters (VRML / glTF / VTK.js) moved to `skipped` in manifest.json
  // (roadmap §2.3) — explicitly unsupported, like Workplane.plugin.
  // CLOSED 2026-10-10 (N1 / A-class batch): the eachpoint OBJECT form already
  //   exists (`eachpoint(wp, item, {combine})`); only the lambda form is a
  //   parser-layer gap, and the lambda is not needed here — a 0.25x0.5 cylinder
  //   placed at each construction-rect vertex reproduces the case bitwise
  //   (vol 0.39269908169872403, com (0,0,0.25), f12/e12/v8). Entry removed so
  //   gen-manifest re-derives it as ported; do NOT re-add.
  // Plane.toLocalCoords / Plane.mirrorInPlane — UNLOCKED 2026-10-04. Both APIs
  //   were already implemented (src/plane.ts) and exported (src/index.ts), with
  //   mirrorInPlane probe-verified against cadquery 2.8.0. The two
  //   testPlaneMethods vars were merely missing their .fai.js mirrors — a stale
  //   label, same class as the B1-3a polyline/threePointArc/findSolid closures.
  //   Mirrors written; gen-manifest now reports them ported. Removed from BY_KEY
  //   so regeneration keeps them ported (do NOT re-add).
  // RE-ASSESSED 2026-10-07 (occt-wasm 5.6 unblock, §3.2 `remove` sew subset).
  //   `remove`'s OTHER half — `test_sewing__sh` — is now PORTED: kernel.sew
  //   reproduces ReShape's face accounting exactly (f5/e12/v8, volume diff 0),
  //   so removing a face needs no ReShape once the faces are known.
//   `test_sewing__res3` CLOSED 2026-10-10 (N2-4): the blocker was the host
//   CLI's STEP writer dropping the floating cap (ftop.moved(x=1)) that stays a
//   bare TopoDS_Face child of the compound (7 faces in memory, 6 written by
//   the host). Resolution: route the case through a self-hosted XCAF exporter
//   (tests/export-cand-step.mjs, raw occt-wasm addShape) that preserves every
//   face — wired into tests/run-cand.ts for any case tagged
//   `export:free-face-in-compound`. Mirror (test_sewing__res3.fai.js) + parity
//   PASS (f7/e16/v12 == ref; vol/bbox/com deltas machine-precision, boolean
//   0/0). Mutation gate preserved by src/free-face-compound-export.test.ts.
//   BY_KEY entry removed so gen-manifest re-derives it as ported. Do NOT re-add.

  // CLOSED 2026-10-10 (N1 / A-class batch): `test_set_ops__simple_box` is a
  //   pytest FIXTURE = box(1,1,1) — the upstream test only ASSERTS on `|`/`&`/`%`
  //   set-operator sizes and exports no geometry, so the ref captures the
  //   fixture. Mirror written (reproduces the fixture box, bitwise parity PASS,
  //   vol 1.0). The set-operator semantics (shapeUnion/shapeIntersect/
  //   shapeDifference, shipped in src/workplane.ts and exported from
  //   src/index.ts) are validated by src/shape-set-ops.test.ts. BY_KEY entry
  //   removed so gen-manifest re-derives it as ported. Do NOT re-add.
  // Solid.addCavity — CLOSED 2026-10-04 (roadmap B2-7): free-function addCavity
  // implemented in workplane.ts via the equivalent boolean cut (outer − cavity);
  // the kernel has no multi-shell MakeSolid.Add / ShapeFix_Solid. All 3 mirrors
  // PASS; removed from BY_KEY so regeneration keeps them ported (do NOT re-add).
  // History sub-shape reflection.
  'tests.test_free_functions:::test_history_extrude__sides': 'op:history-subshape',
  'tests.test_free_functions:::test_history_loft__side': 'op:history-subshape',
  // CLOSED 2026-10-10 (N2-2): the entry above was wrong twice over. The subject
  //   is `f1 = plane(1,1) - face(circle(0.1)); f2 = (plane(2,2) -
  //   face(circle(0.1))).moved(z=1); res = loft(f1, f2)` — NOT
  //   `face(circle(1)).moved(z=1)` — and `plane(w,l)` (free-function
  //   constructor) has been implemented in src/workplane.ts all along. Capture
  //   (out/probe-history-loft.py) also refutes §3.2's "上游是
  //   BRepBuilderAPI_MakeFace(gp_Pln) 的无界面" premise: `plane(1,1)` is a
  //   FINITE 1x1 face (bbox x/y[-0.5,0.5], f1/e4/w1/v4). The real gap was the
  //   hole-carrying loft, and the already-ported test_loft__r6 decomposition
  //   closes it with zero new src code: outer loft (rect 1x1 -> rect 2x2) minus
  //   inner loft (circle 0.1 -> circle 0.1). Bitwise PASS on the harness —
  //   volDelta 9.6e-14 %, comDelta 9.7e-17, bboxDelta 0, booleanDelta 0/0,
  //   topo ref f7/e15/v10 == cand f7/e15/v10. Mutations: frustum 2x2 -> 1.5x1.5
  //   => FAIL (vol 32.6 %), dropping the boolean => FAIL (vol 1.36 %, boolean
  //   bMinusA = pi*0.01, topo f6/e12/v8). Entry removed so gen-manifest
  //   re-derives it as ported; do NOT re-add.
  // testSketch r2 CLOSED (2026-10-01): extrude's taper branch now consumes
  // materialized sketch faces (draftPrism), mirror parity PASS (vol 0.835228,
  // machine-precision). The second .sketch() creates a fresh parent whose
  // stack holds only sketch2 — the first annulus sketch is NOT in the final
  // extrude (probed upstream).
  // testSketch r6: placeSketch of two circles located along a SPLINE's
  // locationAt(0)/locationAt(1) frames, then sweep(multisection=True) — needs
  // a frame-aware sketch placement (xDir binding) + sketch-section sweep.
  'tests.test_cadquery::TestCadQuery::testSketch__r6': 'op:sweep-sketch-sections',
  // ---------------------------------------------------------------------------
  // prism/solid free-function batch (2026-10-01) — the plain-geometry vars are
  // mirrored and pass; these need genuine new geometry paths:
  // ---------------------------------------------------------------------------
  // CLOSED 2026-10-10 (N1 / A-class): the label said "extrude along a
  //   non-normal direction from a face is not supported", but the kernel's
  //   `extrude(face, dx, dy, dz)` is a `BRepPrimAPI_MakePrism` TRANSLATION — it
  //   always took a direction vector; what was missing was the cut-side wiring.
  //   `cutBlind(..., { dir })` (this repo's extension, src/workplane.ts) now
  //   advances the tool along an explicit direction, which is exactly upstream's
  //   `prism(ctx, base, profile, t, dir, additive=False)` oblique subtractive
  //   prism. One-shot capture pinned the semantics: `dir=(0, 0.1, 1)` is the
  //   ADD side, so with `additive=False` the tool runs along (0, -0.1, -1); the
  //   removed volume stays πr²·h (sheared, not rotated). Mirror is a true PASS:
  //   volΔ 1.1e-6 %, centroidΔ 4.1e-9, bboxΔ 0, booleanΔ 0, topo f7/e15/v10.
  //   Mutation gate: flipping the tilt sign keeps the volume but moves the
  //   centroid 0.0144 → FAIL. Entry removed so gen-manifest re-derives ported.
  // prism FROM/TO faces (loft between two extended faces, or a triangular
  // section swept face-to-face) — a face-to-face loft op does not exist.
  'tests.test_free_functions:::test_prism__res5': 'op:prism-from-face',
  'tests.test_free_functions:::test_prism__res6': 'op:prism-from-face',
  // CLOSED 2026-10-10 (N1 / A-class batch): the real blocker was the draftPrism
  //   handle-extraction regression (fixed in src/workplane.ts, see the
  //   "extract draftPrism face via ownHandle" commit) — `extrude(..., {taper})`
  //   now builds the tapered boss. res2 is PASS-NT: the solid matches the ref
  //   bitwise (vol 1.0109579815868446) but upstream's BRepFeat_MakeDPrism splits
  //   the lateral face into 3 (f10/e21/v14) while MakeDraft keeps it single
  //   (f8/e15/v10). Entry removed so gen-manifest re-derives it as ported.
  // taper res3 divides box by the circle face (boolean split by a face) before
  // a from-face subtractive prism — operator + from-face path.
  'tests.test_free_functions:::test_prism_taper__res3': 'op:prism-from-face',
  'tests.test_free_functions:::test_prism_taper__res5': 'op:prism-from-face',
  // CLOSED 2026-10-04 (roadmap B2-2): solid() free function + solidWithInner()
  // implemented via boolean cut. All 12 test_solid variables now ported.
  // B0-5 data hygiene: these three carried a full prose sentence as `blockedBy`
  // (written by an earlier script revision, then orphaned when their BY_KEY
  // entries were dropped — gen-manifest preserves `manual: true` annotations, so
  // the prose survived every regeneration). Normalised to tags:
  // CLOSED 2026-10-07 (occt-wasm 5.6 unblock, T1): the "arc-join only" claim
  //   above is refuted — kernel.offset takes joinType too, so `hollow` (which
  //   defaults to 'intersection', unlike Workplane.shell's 'arc') reproduces
  //   the upstream 0.728 wall volume. Both res2 vars are ported bitwise
  //   (f12/e24/v16 and f11/e24/v16). Do NOT re-add.
  // RE-LABELLED 2026-10-10 (N2-2): this is NOT a `plane` gap (that tag was
  //   wrong — `plane(w,l)` exists, see the test_history_loft__res note above).
  //   `test_name_geometries` (test_assembly.py:2581) asserts on STEP **TEXT**:
  //   `len([l for l in lines if "top_face" in l]) == 2`, same for "plane_" /
  //   "seg_" — i.e. its subject is `Assembly.save(name_geometries=True)` name
  //   propagation, which the geometry-only comparator cannot express at all.
  //   The ref product does not even carry the payload: the ref harness
  //   (ref-harness/cq_step_plugin.py::_export) exports via
  //   `Assembly.toCompound()` + `Shape.exportStep()`, and `Shape.exportStep`
  //   has no `name_geometries` parameter — measured 0 occurrences of
  //   top_face/plane_/seg_ in the ref STEP while all 3 children are present
  //   (4 PRODUCTs, 3 NEXT_ASSEMBLY_USAGE_OCCURRENCE, 1 ADVANCED_BREP + 1
  //   MANIFOLD_SURFACE/OPEN_SHELL + 1 GEOMETRICALLY_BOUNDED_WIREFRAME).
  //   Independently, the ref is ungradeable by itself: compareStepFiles(ref,
  //   ref) throws `OcctError: cut: boolean operation failed` at
  //   step-compare.js (`kernel.cut(shapeA, shapeB)` on a self-pair). Root
  //   cause bisected by the committed probes
  //   tests/ref-harness/name-geometries-probe.py +
  //   tests/_probe-mixed-dim-boolean.ts: all 4 variants of the scene throw
  //   (v_full / v_noface / v_noedge / v_offfac), so it is NOT face
  //   coincidence — it is a mixed-dimensionality compound whose lower-dim
  //   member is embedded in / overlapping a 3D member (non-manifold boolean).
  //   Controls that DO self-compare: solid-only, face-only, edges-only, and
  //   solid+face where the members are disjoint (test_faceOn__f2,
  //   test_constructors__c1) plus solid+edge (test_project__res). Same throw
  //   as the already-D-class ref:degenerate-compound-vertex
  //   (test_loft_to_vertex__c). ⇒ D-class, cross-repo judge-side; this repo is
  //   forbidden from flipping it to ported on its own.
  'tests.test_assembly:::test_name_geometries__assy': 'comparator:mixed-dim-boolean',
  // imprint history images — the free-function imprint is now implemented
  // (roadmap B2-1, 2026-10-04), but b1_imp/b3_imp need History.images()
  // (G-C18) to retrieve the post-imprint faces of the original shapes.
  'tests.test_free_functions:::test_imprint__b1_imp': 'history:images',
  'tests.test_free_functions:::test_imprint__b3_imp': 'history:images',
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8')) as Record<
  string,
  { status?: string; blockedBy?: string | null; source?: string; manual?: boolean }
>

let written = 0
const missing: string[] = []
for (const [key, blockedBy] of Object.entries(BY_KEY)) {
  if (!(key in manifest)) {
    missing.push(key)
    continue
  }
  manifest[key] = {
    status: 'blocked',
    source: manifest[key]?.source ?? key.slice(0, key.lastIndexOf('__')),
    blockedBy,
    manual: true,
  }
  written++
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`mark-blocked: ${written} annotated`)
if (missing.length > 0) {
  console.log('not present in manifest (skipped):')
  for (const k of missing) console.log('  ' + k)
}
