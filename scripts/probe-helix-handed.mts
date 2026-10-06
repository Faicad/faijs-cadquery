/**
 * One-shot kernel probe (P4-2): does occt-wasm 5.6 `makeHelixWireHanded` define
 * handedness the SAME way CadQuery 2.8.0's `Wire.makeHelix(..., lefthand)` does?
 *
 * Upstream capture (scripts/probe-helix-handed.py, pitch=1.5 h=10 r=1.2, axis +Z):
 *   lefthand=False: bbox z[0,10], start (1.2,0,0), quarter-turn y = -1.189 (CW)
 *   lefthand=True : bbox z[0,10], start (1.2,0,0), quarter-turn y = +1.189 (CCW)
 * Run: npx tsx scripts/probe-helix-handed.mts
 */
import { getKernel } from '@faicad/faijs'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { setupNativeKernel } from '../src/gear-test-harness'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'

await setupNativeKernel()
const k = getKernel() as unknown as {
  makeHelixWireHanded: (
    origin: { x: number; y: number; z: number },
    axis: { x: number; y: number; z: number },
    pitch: number,
    height: number,
    radius: number,
    leftHanded?: boolean,
  ) => BrepHandle
}
const api = getBrepApi()

for (const lh of [false, true]) {
  const w = k.makeHelixWireHanded({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1.5, 10, 1.2, lh)
  const e = (api.getSubShapes(w, 'edge' as never) as BrepHandle[])[0]!
  const p = api.curveParameters(e)
  const s = api.curvePointAtParam(e, p.first)
  const q = api.curvePointAtParam(e, p.first + 0.25 * (p.last - p.first))
  const t = api.curveTangent(e, p.first)
  const bb = api.getBoundingBox(w)
  console.log(
    `leftHanded=${lh} start=(${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)}) ` +
      `startTangent=(${t.x.toFixed(6)},${t.y.toFixed(6)},${t.z.toFixed(6)}) ` +
      `quarter=(${q.x.toFixed(6)},${q.y.toFixed(6)},${q.z.toFixed(6)}) ` +
      `bbox z[${bb.zmin.toFixed(6)},${bb.zmax.toFixed(6)}] len=${api.getLength(e).toFixed(9)}`,
  )
}
console.log('upstream: lh=False quarter y -1.189 (CW); lh=True quarter y +1.189 (CCW); both z[0,10]')