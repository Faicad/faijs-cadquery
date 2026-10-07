// Discriminating probe: which cq-compat blocked cases are already unblocked by
// occt-wasm@5.6.0's parameter surface (the API faijs 0.30.7/0.30.8 now wires)?
//  A) shell(..., joinType) — does JoinType.Intersection reach MakeThickSolidByJoin?
//     Upstream ground truth (mark-blocked.ts): unit box hollow arc=0.698/0.565,
//     intersection=0.728/0.584.
//  B) sweepFull curvilinearEquivalence — is it honoured at runtime (unlike
//     sweepAdvanced, whose CE the 2026-10-06 probe showed is a no-op: 17759.157)?
import { OcctKernel } from 'occt-wasm';

const k = await OcctKernel.init();
const out = [];
const v = (id) => k.getVolume(id);
const topFace = (id) => {
  const faces = k.getSubShapes(id, 'face');
  let best = faces[0];
  let bestZ = -Infinity;
  for (const f of faces) {
    const c = k.getSurfaceCenterOfMass(f);
    const z = c[c.length === 3 ? 2 : 2];
    if (z > bestZ) {
      bestZ = z;
      best = f;
    }
  }
  return best;
};

// ---- A) shell joinType ----
try {
  const box = k.makeBox(1, 1, 1);
  const bb = k.getBoundingBox(box, false);
  out.push(`A box vol=${v(box)} bb=z[${bb.zmin},${bb.zmax}]`);
  const top = topFace(box);
  for (const [name, jt] of [['Arc(0)', 0], ['Tangent(1)', 1], ['Intersection(2)', 2], ['omitted', undefined]]) {
    let line;
    try {
      const res = jt === undefined
        ? k.shell(box, [top], -0.1, 1e-3)
        : k.shell(box, [top], -0.1, 1e-3, jt);
      line = `ok vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`A shell(-0.1) joinType=${name}: ${line}`);
  }
} catch (e) {
  out.push(`A FATAL: ${e && e.message ? e.message : String(e)}`);
}

// ---- B) sweepFull curvilinearEquivalence ----
try {
  const circle = k.makeCircleEdge({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.5);
  const profile = k.makeWire([circle]);
  const spine = k.makeWire([k.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })]);
  // unequal-length straight guide -> CE is a no-op only if the kernel ignores it
  const aux = k.makeWire([k.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 })]);
  for (const ce of [true, false]) {
    let line;
    try {
      const res = k.sweepFull(profile, spine, {
        mode: 3,
        auxSpine: aux,
        curvilinearEquivalence: ce,
      });
      line = `ok vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`B sweepFull(mode=Auxiliary, CE=${ce}): ${line}`);
  }
  for (const [name, opts] of [['CE=true,Contact=Contact', { mode: 3, auxSpine: aux, curvilinearEquivalence: true, guideContact: 1 }], ['CE=true,Contact=Border', { mode: 3, auxSpine: aux, curvilinearEquivalence: true, guideContact: 2 }]]) {
    let line;
    try {
      const res = k.sweepFull(profile, spine, opts);
      line = `ok vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`B sweepFull(${name}): ${line}`);
  }
} catch (e) {
  out.push(`B FATAL: ${e && e.message ? e.message : String(e)}`);
}

// ---- C) shell positive thickness with removed faces (upstream "outward opening") ----
try {
  const box = k.makeBox(1, 1, 1);
  const top = topFace(box);
  for (const [name, jt] of [['Arc(0)', 0], ['Intersection(2)', 2], ['omitted', undefined]]) {
    let line;
    try {
      const res = jt === undefined
        ? k.shell(box, [top], 0.1, 1e-3)
        : k.shell(box, [top], 0.1, 1e-3, jt);
      line = `ok vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`C shell(+0.1) joinType=${name}: ${line}`);
  }
} catch (e) {
  out.push(`C FATAL: ${e && e.message ? e.message : String(e)}`);
}

// ---- D) BREP round-trip channels (toBREP text / toBREPBinary binary) ----
try {
  const box = k.makeBox(1, 1, 1);
  const text = k.toBREP(box);
  const back = k.fromBREP(text);
  out.push(`D toBREP/fromBREP: textLen=${text.length} vol=${v(back)} f=${k.getSubShapes(back, 'face').length}`);
  const hasBin = typeof k.toBREPBinary === 'function' && typeof k.fromBREPBinary === 'function';
  out.push(`D toBREPBinary/fromBREPBinary present=${hasBin}`);
  if (hasBin) {
    const bin = k.toBREPBinary(box);
    const back2 = k.fromBREPBinary(bin);
    out.push(`D binary round-trip: bytes=${bin.length} vol=${v(back2)} f=${k.getSubShapes(back2, 'face').length}`);
  }
} catch (e) {
  out.push(`D FATAL: ${e && e.message ? e.message : String(e)}`);
}

// ---- E) closed hollow matrix (no removed faces): upstream truth 0.488 / 0.728 ----
try {
  const box = k.makeBox(1, 1, 1);
  for (const [tw, jt] of [[0.1, 0], [0.1, 2], [-0.1, 0], [-0.1, 2]]) {
    let line;
    try {
      const res = k.shell(box, [], tw, 1e-3, jt);
      line = `type=${k.getShapeType(res)} vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`E shell([], t=${tw}, jt=${jt}): ${line}`);
  }
} catch (e) {
  out.push(`E FATAL: ${e && e.message ? e.message : String(e)}`);
}

// ---- F) offset joinType (closed outward hollow = offset solid minus original) ----
try {
  const box = k.makeBox(1, 1, 1);
  for (const [t, jt] of [[0.1, 0], [0.1, 2], [-0.1, 0], [-0.1, 2]]) {
    let line;
    try {
      const res = k.offset(box, t, 1e-3, jt);
      line = `type=${k.getShapeType(res)} vol=${v(res)} f=${k.getSubShapes(res, 'face').length}`;
    } catch (e) {
      line = `THREW: ${e && e.message ? e.message : String(e)}`;
    }
    out.push(`F offset(t=${t}, jt=${jt}): ${line}`);
  }
} catch (e) {
  out.push(`F FATAL: ${e && e.message ? e.message : String(e)}`);
}

console.log(out.join('\n'));