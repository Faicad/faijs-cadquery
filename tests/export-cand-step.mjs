/**
 * export-cand-step.mjs — self-hosted candidate STEP exporter (N2-4 / N4).
 *
 * The faijs host CLI's STEP writer (`exportStepFromSolids`) drops a floating
 * face that lives as a bare face child of a compound (e.g. test_sewing__res3:
 * 7 faces in memory, 6 written by the host). This exporter bypasses that writer:
 * it executes the .fai.js mirror through the faijs runtime, grabs the result
 * terminal's BREP handle, and writes STEP via the raw occt-wasm XCAF document
 * (`addShape`), which preserves every face.
 *
 * Usage: node tests/export-cand-step.mjs <mirror.fai.js> <out.step>
 */
import { registerOcctBrepEngine, createApiNamespace } from '@faicad/faijs'
import { createRuntime, createNodePorts } from '@faicad/faijs/node'
import { brepOf } from '@faicad/faijs/shape'
import { initOcctWasm } from '@faicad/faijs/occt-kernel/occtKernel'
import * as cq from '@faicad/faijs-cadquery'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

async function main() {
  const mirrorPath = resolve(process.argv[2])
  const outPath = resolve(process.argv[3])
  if (!mirrorPath || !outPath) {
    process.stderr.write('Usage: node export-cand-step.mjs <mirror.fai.js> <out.step>\n')
    process.exit(1)
  }
  await registerOcctBrepEngine()
  const ports = createNodePorts({ defaultFontPath: process.env.FAIJS_DEFAULT_FONT ?? '' })
  // Self-hosted lib loader: resolve the mirror's `import * as cq from
  // '@faicad/faijs-cadquery'` (and the bare short name) to the imported package.
  // Mirrors use the dual-op API (cq.box(...)), so autoLift stays false — matching
  // the upstream faijs-cli behaviour.
  ports.libLoader = {
    loadLib: async (name) => {
      if (name === '@faicad/faijs-cadquery' || name === 'faijs-cadquery') return cq
      throw new Error(`export-cand-step: package "${name}" is not loadable here`)
    },
    listLibs: () => ['@faicad/faijs-cadquery'],
    loadSource: async () => undefined,
    options: { autoLift: false, autoLiftFor: () => false },
  }
  const runtime = createRuntime(ports, 'brep')
  runtime.registerLib('cad', createApiNamespace(), { default: true, packageName: '@faicad/faijs' })
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`warmup failed: ${JSON.stringify(warm.failedAt)}`)
  const code = readFileSync(mirrorPath, 'utf-8')
  const entryKey = mirrorPath
  const execResult = await runtime.execute(code, { entryKey })
  if (execResult.failedAt) {
    throw new Error(`exec failed at stmt ${execResult.failedAt.index} (${execResult.failedAt.callee}): ${execResult.failedAt.message}`)
  }
  const terminals = execResult.terminals ?? []
  const term = terminals.find((t) => (t.meta?.name ?? '') === 'result') ?? terminals[0]
  if (!term) throw new Error('no terminal captured from mirror')
  const handle =
    execResult.brepSolids?.get(term.id)?.solid ?? brepOf(execResult.outputs.get(term.id))
  if (!handle) throw new Error('no BREP handle for result terminal')
  const raw = await initOcctWasm()
  const doc = raw.createXCAFDocument()
  try {
    doc.addShape(handle, { name: 'result' })
    const step = doc.exportSTEP()
    writeFileSync(outPath, Buffer.from(step, 'utf-8'))
  } finally {
    doc.close()
  }
  console.log(`OK ${mirrorPath} -> ${outPath}`)
}

main().catch((e) => {
  process.stderr.write(`FAIL ${e?.message ?? e}\n`)
  process.exit(1)
})
