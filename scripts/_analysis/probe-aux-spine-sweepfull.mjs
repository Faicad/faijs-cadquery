// T4 discriminator: does occt-wasm 5.6 `sweepFull` reach OCCT's
// SetMode(auxSpine, CurvilinearEquivalence=True)?
//
// The 2026-10-06 finding (frozen by src/sweep-aux-spine-guard.test.ts) is that
// `sweepAdvanced` TYPES curvilinearEquivalence but ignores it: the upstream
// testSweep aux case returns 17759.157 instead of CadQuery's 20218.347.
// sweepFull (new in 5.6) is a DIFFERENT kernel entry point — it forwards the
// MakePipeShell knobs sweepAdvanced cannot reach — so the flag may land there.
//
// The earlier probe in this folder (probe-occt56-unblock.mjs §B) used a straight
// spine plus a straight guide and died with "Courbes non jointives" — invalid
// INPUT, not evidence. This probe uses the REAL upstream testSweep geometry
// (scripts/probe-aux-spine.py Case A):
//   profile  rect 10 x 20 on XY
//   spine    spline (0,0,0) -> (0,20,100), tangents (0,0,1) (0,0,1)
//   aux      spline (0,20,0) -> (20,0,100), tangents (0,0,1) (0,0,1)
//
// Frozen CadQuery 2.8.0 truth (mark-blocked.ts:162-166):
//   SetMode(aux, CurvilinearEquivalence=True) -> 20218.347254736764
//   SetMode(aux, CurvilinearEquivalence=False) -> 20500.445
//   Fixed (no aux)                             -> 20500.455
import { OcctKernel } from 'occt-wasm';

const k = await OcctKernel.init();
const vol = (id) => k.getVolume(id);

function rectWire(w, d) {
  const hw = w / 2;
  const hd = d / 2;
  const corners = [
    { x: -hw, y: -hd, z: 0 },
    { x: hw, y: -hd, z: 0 },
    { x: hw, y: hd, z: 0 },
    { x: -hw, y: hd, z: 0 },
  ];
  const edges = [];
  for (let i = 0; i < 4; i++) {
    edges.push(k.makeLineEdge(corners[i], corners[(i + 1) % 4]));
  }
  return k.makeWire(edges);
}

const p = (x, y, z) => ({ x, y, z });
const profile = rectWire(10, 20);
// interpolatePointsWithTangents returns an EDGE; the sweep entry points want a
// WIRE spine/guide (the kernel raises "TopoDS::Wire" otherwise).
const spine = k.makeWire([
  k.interpolatePointsWithTangents([p(0, 0, 0), p(0, 20, 100)], p(0, 0, 1), p(0, 0, 1)),
]);
const aux = k.makeWire([
  k.interpolatePointsWithTangents([p(0, 20, 0), p(20, 0, 100)], p(0, 0, 1), p(0, 0, 1)),
]);

console.log(`profile wire ok=${!!profile} spine ok=${!!spine} aux ok=${!!aux}`);

const cases = [
  ['sweepOriented(mode=3, aux)', () => k.sweepOriented(profile, spine, 3, undefined, aux)],
  ['sweepOriented(mode=0, Fixed)', () => k.sweepOriented(profile, spine, 0)],
  ['sweepAdvanced(mode=3, aux, CE=true)', () => k.sweepAdvanced(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: true })],
  ['sweepAdvanced(mode=3, aux, CE=false)', () => k.sweepAdvanced(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: false })],
  ['sweepFull(mode=3, aux, CE=true)', () => k.sweepFull(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: true })],
  ['sweepFull(mode=3, aux, CE=false)', () => k.sweepFull(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: false })],
  ['sweepFull(mode=3, aux, CE=true, contact=Contact)', () => k.sweepFull(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: true, contact: 1 })],
  ['sweepFull(mode=3, aux, CE=true, contact=ContactOnBorder)', () => k.sweepFull(profile, spine, { mode: 3, auxSpine: aux, curvilinearEquivalence: true, contact: 2 })],
  ['sweepFull(mode=0, Fixed)', () => k.sweepFull(profile, spine, { mode: 0 })],
];

const TRUTH = { ceTrue: 20218.347254736764, ceFalse: 20500.445, fixed: 20500.455 };
for (const [name, fn] of cases) {
  try {
    const res = fn();
    const v = vol(res);
    const dTrue = ((v - TRUTH.ceTrue) / TRUTH.ceTrue) * 100;
    console.log(
      `${name}: vol=${v} faces=${k.getSubShapes(res, 'face').length} ` +
        `(vs CE=true truth ${TRUTH.ceTrue}: ${dTrue.toFixed(3)}%)`,
    );
  } catch (e) {
    console.log(`${name}: THREW ${e && e.message ? e.message : String(e)}`);
  }
}
console.log(`truth: CE=true ${TRUTH.ceTrue} | CE=false ${TRUTH.ceFalse} | Fixed ${TRUTH.fixed}`);
