import { compareStepFiles } from '@faicad/cq-compat-compare'

const pairs = process.argv.slice(2)
for (const arg of pairs) {
  const [refBase, candBase] = arg.split('|')
  const REF = `packages/faijs-cadquery/out/ref/${refBase}.step`
  const CAND = `packages/faijs-cadquery/out/cand/${candBase}.step`
  const r = await compareStepFiles(REF, CAND, {
    strictTopology: false,
    linearTolerance: 1e-3,
    volumeRelativeTolerance: 1e-3,
  })
  const numericOk =
    r.volume.diffPct <= 0.1 && r.centerOfMass.maxDiff <= 1e-3 && r.bbox.maxDiff <= 1e-3
  const boolOk = r.booleanDiff.aMinusB.volume <= 0.1 && r.booleanDiff.bMinusA.volume <= 0.1
  const topoMatch =
    r.topology.a.faces === r.topology.b.faces &&
    r.topology.a.edges === r.topology.b.edges &&
    r.topology.a.vertices === r.topology.b.vertices
  const status = !numericOk ? 'FAIL' : !boolOk ? 'FAIL' : topoMatch ? 'PASS' : 'PASS-NT'
  console.log(
    `${status} ${refBase} | volΔ%=${r.volume.diffPct?.toExponential(2)} comΔ=${r.centerOfMass.maxDiff?.toExponential(2)} bboxΔ=${r.bbox.maxDiff?.toExponential(2)} | ref f${r.topology.a.faces}/e${r.topology.a.edges}/v${r.topology.a.vertices} vs cand f${r.topology.b.faces}/e${r.topology.b.edges}/v${r.topology.b.vertices}`,
  )
}
