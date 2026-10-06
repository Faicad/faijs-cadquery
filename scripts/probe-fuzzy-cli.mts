/**
 * One-shot probe: why does cq.intersect(..., {tol:1e-3}) return the PLAIN
 * intersect volume (0.999) under the CLI runtime while booleanOpBase with
 * fuzzyValue gives 1.0? Reproduce under autoLift:false.
 * Run: npx tsx scripts/probe-fuzzy-cli.mts
 */
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { asPartName } from '@faicad/faijs/identity'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import * as cq from '../src/index.js'

await registerOcctBrepEngine()
const rt = createRuntime(createNodePorts(), 'brep')
rt.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery', autoLift: false } as never)

const code = [
  "import * as cq from '@faicad/faijs-cadquery'",
  'let box1 = await cq.box(cq.Workplane("XY"), 1, 1, 1)',
  'let b4 = await cq.box(cq.Workplane("XY"), 1, 1, 1)',
  'let box4 = await cq.translate(b4, [1e-3, 0, 0])',
  'let r = await cq.intersect(box1, box4, { tol: 1e-3 })',
  'let result = cq.val(r)',
].join('\n')
const res = await rt.execute(code)
const shape = res.outputs.get(asPartName('result'))
console.log('intersect tol=1e-3 vol:', getBrepApi().getVolume(brepOf(shape as never)), '(ref 1.0, plain 0.999)')
