/**
 * One-shot probe (P1-2): does occt-wasm 5.6 sweepFull change the end-cap
 * behaviour for the test_sweep r5 case (two identical rect 1x1 sections on a
 * spline spine)? The blocking evidence says a single profile caps PERPENDICULAR
 * to the spine (bb z [-0.008, 1.400]) while the ref caps at the section planes
 * (bb z [0, 1]). Ref truth: vol 0.913416, bb z [0,1].
 * Run: npx tsx scripts/probe-sweep-full-r5.mts
 */
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { asPartName } from '@faicad/faijs/identity'
import { brepOf } from '@faicad/faijs/shape'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import * as cq from '../src/index.js'

await registerOcctBrepEngine()
const rt = createRuntime(createNodePorts(), 'brep')
rt.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery', autoLift: false } as never)

const code = [
  "import * as cq from '@faicad/faijs-cadquery'",
  "let w1 = cq.rect(cq.Workplane('XY'), 1, 1)",
  'let p2 = cq.splineWire3D([[0,0,0],[0,0,1]], [[-0.5,0,1],[0.5,0,1]])',
  'let r = await cq.sweep(w1, p2)',
  'let result = cq.val(r)',
].join('\n')
const res = await rt.execute(code)
const shape = res.outputs.get(asPartName('result'))
if (!shape || res.failedAt) {
  console.log('failed:', res.failedAt?.message)
  process.exit(1)
}
const h = brepOf(shape) as BrepHandle
const bb = getBrepApi().getBoundingBox(h)
console.log('single-profile sweep vol:', getBrepApi().getVolume(h))
console.log('bb z:', bb.zmin, '..', bb.zmax)
console.log('faces:', (getBrepApi().getSubShapes(h, 'face' as never) as unknown[]).length)
