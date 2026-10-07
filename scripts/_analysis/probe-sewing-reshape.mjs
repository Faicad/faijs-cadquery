// Probe for reassessment §3.2 `remove` (sew subset), cases
// tests.test_free_functions:::test_sewing__sh and __res3.
//
// Ground truth comes out of the reference STEP files themselves
// (out/ref/tests.test_free_functions___test_sewing__*.step), so this probe
// answers one question per output line: can occt-wasm's already-bound `sew`
// family reproduce them, given that BRepTools_ReShape is NOT bound (§3.3 W5-a)?
//
//  upst box: `box(1,1,1)` free function = x/y centred, bottom z = 0, i.e.
//  [-0.5,0.5] x [-0.5,0.5] x [0,1].
//
//  case                 : b = box(...); ftop = b.faces(">Z"); sh = b.remove(ftop)
//  Q1 can sew(the other 5 box faces) reproduce `sh` numerically + topologically?
//  Q2 can sew resume ReShape's exact edge/vertex accounting? (expect f5/e12/v8)
//
//  case                 : res3 = shell(sh.faces(), ftop, ftop.moved(x=1), manifold=False)
//  Q3 does `sew` keep an isolated face (non-manifold) instead of dropping it?
//     Without a manifold switch the kernel can only do manifold sewing, so this
//     decides whether __res3 is portable or still blocked.
import { OcctKernel } from 'occt-wasm';

const k = await OcctKernel.init();
const out = [];
const nf = (id) => k.getSubShapes(id, 'face').length;
const ne = (id) => k.getSubShapes(id, 'edge').length;
const nv = (id) => k.getSubShapes(id, 'vertex').length;
const line = (s) => out.push(s);
const shift = (shape, x, y, z) => k.translate(shape, x, y, z);

// centred box, bottom at z=0
const raw = k.makeBox(1, 1, 1);
const b = shift(raw, -0.5, -0.5, 0);
const bb = k.getBoundingBox(b, false);
line(`box vol=${k.getVolume(b)} bb x[${bb.xmin},${bb.xmax}] y[${bb.ymin},${bb.ymax}] z[${bb.zmin},${bb.zmax}]`);

const faces = k.getSubShapes(b, 'face');
const splitByMaxZ = () => {
  // top face = maximum surface centre z (`getSurfaceCenterOfMass` -> {x,y,z})
  let top = faces[0];
  let topZ = -Infinity;
  for (const f of faces) {
    const c = k.getSurfaceCenterOfMass(f);
    if (c.z > topZ) {
      topZ = c.z;
      top = f;
    }
  }
  const rest = faces.filter((f) => f !== top);
  return { top, rest };
};
const { top, rest } = splitByMaxZ();
line(`faces=${faces.length} topFace.comZ=${k.getSurfaceCenterOfMass(top).z}`);

const describe = (label, id) => {
  try {
    line(
      `${label}: vol=${k.getVolume(id)} area=${(() => {
        try {
          return k.getArea ? k.getArea(id) : 'n/a';
        } catch {
          return 'n/a';
        }
      })()} f${nf(id)}/e${ne(id)}/v${nv(id)} type=${k.getShapeType ? k.getShapeType(id) : '?'}`,
    );
  } catch (e) {
    line(`${label}: describe THREW ${e && e.message ? e.message : String(e)}`);
  }
};

// ---- Q1/Q2: remove top face -> sew rest ----
describe('Q1 sew(5 faces)', k.sew(rest, 1e-3));
describe('Q1 sewAndSolidify(5)', (() => {
  try {
    return k.sewAndSolidify(rest, 1e-3);
  } catch (e) {
    line(`Q1 sewAndSolidify(5): THREW ${e && e.message ? e.message : String(e)}`);
    return null;
  }
})() ?? k.sew(rest, 1e-3));
try {
  describe('Q1 buildSolidFromFaces(5)', k.buildSolidFromFaces(rest, 1e-3));
} catch (e) {
  line(`Q1 buildSolidFromFaces(5): THREW ${e && e.message ? e.message : String(e)}`);
}

// ---- Q3: non-manifold sewing (res3) ----
// sh.faces() == the 5 remaining faces; plus ftop at its ORIGINAL place; plus
// the same face translated x+1. The last one shares nothing with the box.
const floatFace = shift(top, 1, 0, 0);
const inputs = [...rest, top, floatFace];
line(`Q3 input faces=${inputs.length}`);
describe('Q3 sew(6 box faces + floating face)', k.sew(inputs, 1e-3));
try {
  describe('Q3 sewAndSolidify(same 7)', k.sewAndSolidify(inputs, 1e-3));
} catch (e) {
  line(`Q3 sewAndSolidify(7): THREW ${e && e.message ? e.message : String(e)}`);
}

console.log(out.join('\n') + '\n');
