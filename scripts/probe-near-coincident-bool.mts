/**
 * One-shot probe (P2-3): can booleanOp's glue/fuzzyValue recover the comparator's
 * boolean probe on near-coincident twisted B-spline solids?
 *
 * Case: testTwistExtrude — ref vs cand twisted rect(10,10) h=10 45°. The plain
 * probe degenerates (A-B 2.6e-4, B-A = whole solid).
 * Run: npx tsx scripts/probe-near-coincident-bool.mts
 */
import { readFileSync, existsSync } from 'node:fs'
import { getKernel } from '@faicad/faijs'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { fromHandle } from '@faicad/faijs/sdk'
import { setupNativeKernel } from '../src/gear-test-harness'
import * as cq from '../src/index.js'

await setupNativeKernel()
const k = getKernel() as never as Record<string, (...a: unknown[]) => any>

const refPath = 'out/ref/tests.test_cadquery__TestCadQuery__testTwistExtrude__r.step'
if (!existsSync(refPath)) {
  console.log('ref step missing')
  process.exit(1)
}
const refHandle = k.importStep(new Uint8Array(readFileSync(refPath)))
console.log('ref vol:', k.getVolume(refHandle))

// cand: twistExtrude rect(10,10) 45° height 10 (same mirror recipe)
const w1 = cq.rect(cq.Workplane('XY'), 10, 10)
const candWp = await cq.twistExtrude(w1, 45, 10, { steps: 32 })
const candHandle = brepOf(cq.val(candWp) as never)
console.log('cand vol:', k.getVolume(candHandle))

function probe(tag: string, op: number, opts?: Record<string, unknown>) {
  try {
    const r = k.booleanOp(op, [refHandle], [candHandle], opts)
    console.log(tag.padEnd(24), 'vol:', k.getVolume(r.result))
  } catch (e) {
    console.log(tag.padEnd(24), 'ERROR:', (e as Error).message.slice(0, 70))
  }
}
// op: 0 Fuse / 1 Cut / 2 Common
probe('plain cut (ref-cand)', 1)
probe('glue Shift cut', 1, { glue: 1 })
probe('glue Full cut', 1, { glue: 2 })
probe('fuzzy 1e-3 cut', 1, { fuzzyValue: 1e-3 })
probe('fuzzy 1e-4 cut', 1, { fuzzyValue: 1e-4 })
probe('fuzzy 1e-5 cut', 1, { fuzzyValue: 1e-5 })
probe('plain common', 2)
probe('fuzzy 1e-3 common', 2, { fuzzyValue: 1e-3 })
probe('fuzzy 1e-5 common', 2, { fuzzyValue: 1e-5 })
probe('glue+fuzzy common', 2, { glue: 1, fuzzyValue: 1e-4 })
void fromHandle
