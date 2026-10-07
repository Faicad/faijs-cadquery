// Discriminating probe: can occt-wasm 5.6 chain two fillets?
// This is the root question behind the 9 `kernel:fillet-chain-reapply` blocked cases.
import { OcctKernel } from 'occt-wasm';

const k = await OcctKernel.init();
const lines = [];

try {
  const box = k.makeBox(100, 150, 50);
  lines.push(`box type=${k.getShapeType(box)} vol=${k.getVolume(box)}`);

  // First fillet: all edges.
  const edges0 = k.getSubShapes(box, 'edge');
  lines.push(`edges0=${edges0.length}`);
  const f1 = k.fillet(box, [edges0[0], edges0[2], edges0[4], edges0[6]], 10);
  lines.push(`fillet1 ok type=${k.getShapeType(f1)} vol=${k.getVolume(f1)}`);

  // Second fillet chained on the fillet product -- this is what used to trap.
  const edges1 = k.getSubShapes(f1, 'edge');
  lines.push(`edges1=${edges1.length}`);
  let chained = 'THREW';
  try {
    const f2 = k.fillet(f1, [edges1[0]], 2);
    chained = `ok type=${k.getShapeType(f2)} vol=${k.getVolume(f2)}`;
  } catch (e) {
    chained = `THREW: ${e && e.message ? e.message : String(e)}`;
  }
  lines.push(`fillet2 chained=${chained}`);

  // Third fillet, to be sure repeated chaining holds.
  const edges2 = k.getSubShapes(f1, 'edge');
  let third = 'n/a';
  try {
    const f3 = k.fillet(f1, [edges2[1]], 2);
    third = `ok vol=${k.getVolume(f3)}`;
  } catch (e) {
    third = `THREW: ${e && e.message ? e.message : String(e)}`;
  }
  lines.push(`fillet3 chained=${third}`);
} catch (e) {
  lines.push(`FATAL ${e && e.stack ? e.stack : String(e)}`);
}

console.log(lines.join('\n'));
