/**
 * One-shot kernel probe (P4-1): pick the occt-wasm channel that reproduces the
 * upstream asymmetric chamfer truth (testChamferAsymmetrical):
 *   cube = box(1,1,1).faces(">Z").chamfer(0.1, 0.2)
 *   => 10 faces, top edge 0.6, side edge 0.9, vol 0.9653333
 *
 * Channel A: per-edge chain `kernel.chamferAsymmetric(solid, edge, 0.1, 0.2)`
 * Channel B: batch `kernel.chamferDistAngle(solid, edges, dF, thetaDeg)`
 *            (theta from §3.5: atan2(dO*sinB, dF-dO*cosB), B=pi/2 => atan2(0.2,0.1)).
 * Run: npx tsx scripts/probe-chamfer-asym-kernel.mts
 */
import { createRuntime, registerOcctBrepEngine, getKernel } from '@faicad/faijs'
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
  "let w = cq.rect(cq.Workplane('XY'), 1, 1)",
  "let c0 = await cq.extrude(w, 1)",
  'let result = cq.val(c0)',
].join('\n')
const res = await rt.execute(code)
const shape = res.outputs.get(asPartName('result'))
if (!shape || res.failedAt) {
  console.log('failed:', res.failedAt?.message)
  process.exit(1)
}
const h = brepOf(shape) as BrepHandle
const api = getBrepApi()
const k = getKernel() as unknown as {
  chamferAsymmetric: (s: unknown, e: unknown, d1: number, d2: number) => unknown
}

function report(name: string, solid: unknown) {
  const hs = solid as BrepHandle
  const vol = api.getVolume(hs)
  const faces = (api.getSubShapes(hs, 'face' as never) as unknown[]).length
  const edges = api.getSubShapes(hs, 'edge' as never) as BrepHandle[]
  const lens = edges
    .map((e) => api.getLength(e))
    .sort((a, b) => a - b)
    .map((v) => v.toFixed(4))
  console.log(`${name}: vol ${vol.toFixed(7)} faces ${faces} edgeLens [${lens.join(', ')}]`)
}

// Top face = the only planar face whose bbox z spans exactly the top.
const faces = api.getSubShapes(h, 'face' as never) as BrepHandle[]
const topFace = faces.find((f) => {
  const bb = api.getBoundingBox(f)
  return Math.abs(bb.zmin - 1) < 1e-9 && Math.abs(bb.zmax - 1) < 1e-9
})!
const edges = api.getSubShapes(topFace, 'edge' as never) as unknown[]
console.log('selected top edges:', edges.length)
report('orig            ', h)

// Channel A: chained per-edge chamferAsymmetric (reusing the original handles).
try {
  let s: unknown = h
  for (const e of edges) s = k.chamferAsymmetric(s, e, 0.1, 0.2)
  report('A chamferAsym   ', s)
} catch (err) {
  console.log('A chamferAsym FAILED:', (err as Error).message)
}

// Channel B: batch chamferDistAngle with theta = atan2(0.2, 0.1) rad -> deg.
try {
  const theta = (Math.atan2(0.2, 0.1) * 180) / Math.PI
  const s = api.chamferDistAngle(h, edges as BrepHandle[], 0.1, theta)
  report(`B chamferDistAng`, s)
} catch (err) {
  console.log('B chamferDistAngle FAILED:', (err as Error).message)
}

console.log('target (cq2.8.0): vol 0.9653333 faces 10 top 0.6 side 0.9')