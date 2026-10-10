/**
 * _probe-mixed-dim-boolean.ts — reproduce (and bisect) the comparator failure
 * that makes `tests.test_assembly:::test_name_geometries__assy` ungradeable.
 *
 * WHY THIS EXISTS (D-class evidence, plan §3.4 / §3.1.1 ⑥):
 *   The case is blocked by `comparator:mixed-dim-boolean`. The claim is
 *   "compareStepFiles cannot grade this ref at all" — the strongest possible
 *   form of that claim is a SELF-comparison, so this probe runs
 *   `compareStepFiles(ref, ref)` with the exact options `tests/compare.ts`
 *   uses. It throws `OcctError: cut: boolean operation failed` from
 *   `step-compare.js` (`kernel.cut(shapeA, shapeB)`).
 *
 *   To name the trigger (and to give the @faicad/cq-compat-compare team a
 *   minimal repro) it also grades 4 synthetic variants of the same scene plus
 *   10 controls spanning every dimensionality mix that DOES grade.
 *
 * The variants are produced by `tests/ref-harness/name-geometries-probe.py`
 * (needs the cadquery env; they land in out/_diag/). Regenerate with:
 *   C:\Users\ylt\cadquery-env\Scripts\python.exe tests/ref-harness/name-geometries-probe.py
 * then:
 *   npx tsx tests/_probe-mixed-dim-boolean.ts
 *
 * FINDING (2026-10-10): all 4 variants throw, including `v_offfac` where NO
 * member is coincident with another — so the trigger is NOT face coincidence.
 * It is a compound of MIXED DIMENSIONALITY whose lower-dimensional member is
 * embedded in / overlapping a 3D member: a non-manifold boolean that OCCT's
 * BRepAlgoAPI refuses. The controls below confirm that homogeneous compounds
 * (solid-only / face-only / edge-only) and mixed compounds with disjoint
 * members grade fine.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareStepFiles } from '@faicad/cq-compat-compare'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const REF = join(ROOT, 'out', 'ref')
const DIAG = join(ROOT, 'out', '_diag')

const OPTS = { strictTopology: false, linearTolerance: 1e-3, volumeRelativeTolerance: 1e-3 }

/** Expected to THROW — mixed-dimensionality compound, lower-dim member embedded. */
const EXPECT_THROW: Array<[string, string]> = [
  ['v_full  (solid+face+edge)', join(DIAG, 'v_full.step')],
  ['v_noface(solid+edge)     ', join(DIAG, 'v_noface.step')],
  ['v_noedge(solid+face)     ', join(DIAG, 'v_noedge.step')],
  ['v_offfac(none coincident)', join(DIAG, 'v_offfac.step')],
  ['REF (the actual case)    ', join(REF, 'tests.test_assembly___test_name_geometries__assy.step')],
]

/** Expected to GRADE — homogeneous, or mixed with disjoint members. */
const EXPECT_OK: Array<[string, string]> = [
  ['solid only            ', 'tests.test_free_functions___test_box__s'],
  ['solid only (loft)     ', 'tests.test_free_functions___test_loft__r6'],
  ['face only (2D)        ', 'tests.test_cadquery__TestCadQuery__test_loft_face__c'],
  ['faces only (2D)       ', 'tests.test_cadquery__TestCadQuery__test_compound_faces_center__compound'],
  ['edges only (1D)       ', 'tests.test_free_functions___test_history_offset__sides'],
  ['solid+face (disjoint) ', 'tests.test_free_functions___test_faceOn__f2'],
  ['solid+face (disjoint) ', 'tests.test_free_functions___test_constructors__c1'],
  ['solid+edge (disjoint) ', 'tests.test_free_functions___test_project__res'],
].map(([label, stem]) => [label, join(REF, `${stem}.step`)])

let unexpected = 0

async function grade(label: string, file: string, expectThrow: boolean): Promise<void> {
  if (!existsSync(file)) {
    console.log(`${label}  SKIP    (missing ${file})`)
    if (expectThrow) unexpected++
    return
  }
  try {
    const r = await compareStepFiles(file, file, OPTS)
    const topo = `f${r.topology.a.faces}/e${r.topology.a.edges}/v${r.topology.a.vertices}`
    console.log(`${label}  OK      ${topo}`)
    if (expectThrow) {
      console.log('           ^^ UNEXPECTED: expected this one to throw')
      unexpected++
    }
  } catch (e) {
    const err = e as { operation?: string; message: string }
    console.log(`${label}  THROW   ${err.operation ?? ''}: ${err.message}`)
    if (!expectThrow) {
      console.log('           ^^ UNEXPECTED: expected this one to grade')
      unexpected++
    }
  }
}

console.log('=== expected THROW (mixed-dim compound, embedded lower-dim member) ===')
for (const [label, f] of EXPECT_THROW) await grade(label, f, true)

console.log('\n=== expected OK (homogeneous, or mixed with disjoint members) ===')
for (const [label, f] of EXPECT_OK) await grade(label, f, false)

console.log(
  `\n_probe-mixed-dim-boolean: ${unexpected === 0 ? 'CONFIRMED' : `${unexpected} UNEXPECTED`}` +
    ` — trigger is mixed dimensionality, not face coincidence`,
)
