import { compareStepFiles } from '@faicad/cq-compat-compare'

const files = process.argv.slice(2)
for (const f of files) {
  const r = await compareStepFiles(f, f, { strictTopology: false })
  const b = r.bbox.a
  const c = r.centerOfMass.a
  console.log(
    `${f.split('/').pop()}\n  bbox x[${b.xmin.toFixed(4)},${b.xmax.toFixed(4)}] y[${b.ymin.toFixed(4)},${b.ymax.toFixed(4)}] z[${b.zmin.toFixed(4)},${b.zmax.toFixed(4)}]\n  vol=${r.volume.a.toFixed(6)} com=(${c.x.toFixed(4)},${c.y.toFixed(4)},${c.z.toFixed(4)}) topo f${r.topology.a.faces}/e${r.topology.a.edges}/v${r.topology.a.vertices}/s${r.topology.a.solids}`,
  )
}
