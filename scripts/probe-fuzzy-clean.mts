/**
 * One-shot probe (P2-2): fuzzy fuse volume calibration.
 * occt-wasm booleanOp(fuzzyValue=1e-3) gives 2.0006667 vs CadQuery 2.8.0's
 * 2.001 (Δ = eps/3) on the testFuzzyBoolOp fuse case. Try the clean/simplify
 * pass (upstream fuse defaults to clean=True) to see if it reconciles.
 * Run: npx tsx scripts/probe-fuzzy-clean.mts
 */
import { getKernel } from '@faicad/faijs'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { fromHandle } from '@faicad/faijs/sdk'
import { setupNativeKernel } from '../src/gear-test-harness'

await setupNativeKernel()
const EPS = 1e-3
const k = getKernel() as never as {
  makeBoxFromCorners: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => never
  booleanOp: (op: number, args: never[], tools: never[], opts?: Record<string, unknown>) => { result: never }
  simplify: (s: never) => never
}
const boxAt = (cx: number) =>
  fromHandle(k.makeBoxFromCorners({ x: cx - 0.5, y: -0.5, z: -0.5 }, { x: cx + 0.5, y: 0.5, z: 0.5 }))
const vol = (s: unknown) => getBrepApi().getVolume(brepOf(s as never))
const solids = (s: unknown) => (getBrepApi().getSubShapes(brepOf(s as never), 'solid' as never) as unknown[]).length

const raw = k.booleanOp(0, [brepOf(boxAt(0))], [brepOf(boxAt(1 + EPS))], { fuzzyValue: EPS })
const rawShape = fromHandle(raw.result)
console.log('raw fuzzy fuse : vol', vol(rawShape), 'solids', solids(rawShape))
const cleaned = fromHandle(k.simplify(raw.result))
console.log('cleaned        : vol', vol(cleaned), 'solids', solids(cleaned))
console.log('target (cq)    : vol 2.001 solids 1')
