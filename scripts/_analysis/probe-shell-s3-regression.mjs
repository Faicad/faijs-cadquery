// Regression discriminator for TestCadQuery__testClosedShell__s3.
//
// The 2026-10-07 shell() change threads a 5th `joinType` arg into
// kernel.shell/kernel.offset. s3 = polyline prism .shell(-0.05) fails at the
// boolean cut after the change; this probe asks whether the OLD call shape
// (no 5th arg) succeeds, i.e. whether the failure is a regression or was
// already there.
//
// Old:  kernel.shell(h, [], 0.05, 1e-3)        -> cut(solid, inner)
// New:  kernel.shell(h, [], 0.05, 1e-3, 0)     -> cut(solid, inner)   (kind='arc')
import { OcctKernel } from 'occt-wasm';

const k = await OcctKernel.init();
const v = (id) => k.getVolume(id);

const pts = [
  [1.0, 0.0],
  [0.3, 0.2],
  [0.0, 0.0],
  [0.3, -0.1],
  [1.0, -0.03],
];
const edges = [];
for (let i = 0; i < pts.length; i++) {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  edges.push(
    k.makeLineEdge({ x: a[0], y: a[1], z: 0 }, { x: b[0], y: b[1], z: 0 }),
  );
}
const wire = k.makeWire(edges);
const face = k.makeFace(wire);
const prism = k.extrude(face, 0, 0, 1);
console.log(`prism vol=${v(prism)} faces=${k.getSubShapes(prism, 'face').length}`);

for (const [name, args] of [
  ['OLD shell(h,[],0.05,1e-3)', [0.05, 1e-3]],
  ['NEW shell(h,[],0.05,1e-3,0)', [0.05, 1e-3, 0]],
  ['NEW shell(h,[],0.05,1e-3,2)', [0.05, 1e-3, 2]],
]) {
  let inner;
  try {
    inner = k.shell(prism, [], ...args);
    console.log(`${name}: inner vol=${v(inner)} faces=${k.getSubShapes(inner, 'face').length}`);
  } catch (e) {
    console.log(`${name}: shell THREW ${e && e.message ? e.message : String(e)}`);
    continue;
  }
  try {
    const cut = k.cut(prism, inner);
    console.log(`  cut ok: vol=${v(cut)} faces=${k.getSubShapes(cut, 'face').length}`);
  } catch (e) {
    console.log(`  cut THREW: ${e && e.message ? e.message : String(e)}`);
  }
}
