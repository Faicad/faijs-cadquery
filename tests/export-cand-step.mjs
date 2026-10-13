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
import * as cqa from '@faicad/faijs-cadquery/assembly'
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
      // X-5: the host strips subpaths from import specifiers, so subpath
      // imports (`@faicad/faijs-cadquery/assembly`) arrive here as the bare
      // package name — serve cqa for both forms.
      if (name === '@faicad/faijs-cadquery' || name === 'faijs-cadquery') return cq
      if (name === '@faicad/faijs-cadquery/assembly') return cqa
      throw new Error(`export-cand-step: package "${name}" is not loadable here`)
    },
    listLibs: () => ['@faicad/faijs-cadquery', '@faicad/faijs-cadquery/assembly'],
    loadSource: async () => undefined,
    options: { autoLift: false, autoLiftFor: () => false },
  }
  const runtime = createRuntime(ports, 'brep')
  runtime.registerLib('cad', createApiNamespace(), { default: true, packageName: '@faicad/faijs' })
  // X-5: the host strips subpaths from import specifiers, so auto-load would
  // bind `cqa` to the cq ROOT package (no assembly exports). Pre-register the
  // real subpath namespace under its mirror binding name — autoLoad skips
  // bindings that already exist.
  runtime.registerLib('cqa', cqa, { autoLift: false, packageName: '@faicad/faijs-cadquery/assembly' })
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  if (warm.failedAt) throw new Error(`warmup failed: ${JSON.stringify(warm.failedAt)}`)
  const code = readFileSync(mirrorPath, 'utf-8')
  const entryKey = mirrorPath
  const execResult = await runtime.execute(code, { entryKey })
  if (execResult.failedAt) {
    throw new Error(`exec failed at stmt ${execResult.failedAt.index} (${execResult.failedAt.callee}): ${execResult.failedAt.message}`)
  }
  const terminals = execResult.terminals ?? []
  // Prefer the mirror's `result` terminal explicitly; fall back to the LAST
  // terminal (the final statement), never terminals[0] — intermediate
  // unconsumed compounds (e.g. `let b3 = cq.compound(...)` feeding an assembly
  // member) are live terminals too, and picking one exports the PRE-solve
  // geometry (observed on the N3 constrain mirrors).
  const term =
    terminals.find((t) => (t.meta?.name ?? '') === 'result' || String(t.id).endsWith('result')) ??
    terminals[terminals.length - 1]
  if (!term) throw new Error('no terminal captured from mirror')
  // Prefer the LIVE shape slot (brepOf reads ensureSlot(...).solid, which
  // asm.solve() bakes in place) over the runtime's captured brepSolids record:
  // the record can hold the PRE-bake handle when the value was brep-converted
  // before solve() ran (observed on subassy2: exported STEP stayed in the
  // local frame at (0,0,0) while ref sits in the solved frame at x[-5,-2]).
  let handle
  try {
    handle = brepOf(execResult.outputs.get(term.id))
  } catch {
    // not a shape wrapper (plain record) — fall through to the captured handle
  }
  handle = handle ?? execResult.brepSolids?.get(term.id)?.solid
  const raw = await initOcctWasm()
  const doc = raw.createXCAFDocument()
  try {
    const comp = execResult.outputs.get(term.id)
    const children = comp?.children ?? []
    if (!handle || children.length > 0) {
      // Compound path (solved assembly or mixed solid+point compound): walk the
      // children and add each baked member's handle individually. Feeding the
      // aggregated compound to XCAF wholesale drops members (observed: a
      // solid+vertex compound exports only the vertex — N3 PointInPlane case).
      let added = 0
      for (let i = 0; i < children.length; i++) {
        const h = brepOf(children[i])
        if (h) {
          doc.addShape(h, { name: `member_${i}` })
          added++
        }
      }
      if (added === 0) {
        if (!handle) throw new Error('no BREP handle for result terminal (compound children empty)')
        doc.addShape(handle, { name: 'result' })
      }
    } else {
      doc.addShape(handle, { name: 'result' })
    }
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
