/**
 * One-shot probe (P1-2, second half): does sweepFull (occt-wasm 5.6) change the
 * end-cap behaviour for test_sweep r5? The law channel scales ONE profile along
 * the spine — it cannot add a second section, but confirm the caps stay
 * perpendicular to the spine either way. Ref truth: vol 0.913416, bb z [0, 1].
 * Run: npx tsx scripts/probe-sweep-full-r5.mts
 */
import { getKernel, initOcctWasm } from '@faicad/faijs'

await initOcctWasm()
const k = getKernel() as never as {
  makeLineEdge: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => never
  makeWire: (edges: never[]) => never
  interpolatePointsWithTangents: (
    pts: { x: number; y: number; z: number }[],
    startTangent: { x: number; y: number; z: number },
    endTangent: { x: number; y: number; z: number },
  ) => never
  makeWire: (edges: never[]) => never
  sweepFull: (profile: never, spine: never, options?: Record<string, unknown>) => never
  getVolume: (s: never) => number
  getBoundingBox: (s: never) => { zmin: number; zmax: number }
  getSubShapes: (s: never, kind: string) => unknown[]
}

// sweepFull's BRepFill_Section requires a WIRE (a face profile is rejected)
const v = (x: number, y: number, z: number) => ({ x, y, z })
const profile = k.makeWire([
  k.makeLineEdge(v(-0.5, -0.5, 0), v(0.5, -0.5, 0)),
  k.makeLineEdge(v(0.5, -0.5, 0), v(0.5, 0.5, 0)),
  k.makeLineEdge(v(0.5, 0.5, 0), v(-0.5, 0.5, 0)),
  k.makeLineEdge(v(-0.5, 0.5, 0), v(-0.5, -0.5, 0)),
])
const spineEdge = k.interpolatePointsWithTangents(
  [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ],
  { x: -0.5, y: 0, z: 1 },
  { x: 0.5, y: 0, z: 1 },
)
const spine = k.makeWire([spineEdge])

for (const opts of [
  { law: 1, lawLength: 1 }, // Linear
  { law: 2, lawLength: 1 }, // SCurve
]) {
  const s = k.sweepFull(profile, spine, opts)
  console.log('sweepFull', JSON.stringify(opts), 'vol:', k.getVolume(s), 'bb z:', k.getBoundingBox(s).zmin, '..', k.getBoundingBox(s).zmax, 'faces:', k.getSubShapes(s, 'face').length)
}
