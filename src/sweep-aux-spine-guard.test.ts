/**
 * Guard: `sweep(auxSpine=…)` must keep rejecting loudly.
 *
 * Why this test exists (global rule: verified-but-negative API findings are
 * frozen as tests): occt-wasm 5.6 ADDED `curvilinearEquivalence` to
 * SweepAdvancedOptions (types.d.ts:275), which reads as if the kernel gap
 * `kernel:sweep-aux-spine-mode` were closed. It is NOT — sweepAdvanced(mode:
 * Auxiliary, auxSpine, curvilinearEquivalence: true) returns a 12.163%-wrong
 * volume (captured 2026-10-06: cand 17759.157466286128 vs CadQuery
 * 20218.347254736764, scripts/probe-aux-spine.py / probe-aux-spine-steps.py).
 * Re-checked 2026-10-07 against `sweepFull` too (the other 5.6 entry point,
 * which forwards the MakePipeShell knobs sweepAdvanced cannot reach): it
 * reproduces sweepAdvanced to the digit, and CE=false/Fixed — the modes
 * CadQuery does NOT default to — are bit-exact. See
 * src/sweep-aux-spine-sweepfull.probe.test.ts. This test freezes the
 * loud rejection so a future "the type has the field, just wire it up" change
 * cannot silently ship 12%-wrong geometry again. If the kernel ever really
 * implements CurvilinearEquivalence, this test MUST fail first — then re-run
 * the capture and only then lift the mirrors.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import * as cq from './index'

/** Run mirror-style source under the CLI loader settings (autoLift:false). */
async function run(code: string): Promise<{ failedAt?: { message: string } }> {
  const cliRuntime = createRuntime(createNodePorts(), 'brep')
  cliRuntime.registerLib('cq', cq as never, {
    packageName: '@faicad/faijs-cadquery',
    autoLift: false,
  } as never)
  const res = await cliRuntime.execute(code)
  return { failedAt: res.failedAt as { message: string } | undefined }
}

beforeAll(async () => {
  await registerOcctBrepEngine()
})

describe('sweep auxSpine rejection guard (kernel:sweep-aux-spine-mode)', () => {
  it('rejects auxSpine loudly even though 5.6 types curvilinearEquivalence', async () => {
    const code = [
      "import * as cq from '@faicad/faijs-cadquery'",
      'let p = cq.rect(cq.Workplane("XY"), 1, 1)',
      'let spine = cq.splineWire3D([[0,0,0],[0,0,1]])',
      'let aux = cq.splineWire3D([[1,0,0],[1,0,1]], [[0,1,0],[0,-1,0]])',
      'let r = await cq.sweep(p, spine, { auxSpine: aux })',
      'let result = cq.val(r)',
    ].join('\n')
    const { failedAt } = await run(code)
    expect(failedAt?.message).toMatch(/auxSpine is not supported.*kernel:sweep-aux-spine-mode/s)
  })

  // Wording corrected 2026-10-07: the 2026-10-06 message claimed the kernel
  // "ignores" curvilinearEquivalence. The real-geometry probe
  // (sweep-aux-spine-sweepfull.probe.test.ts) refutes that — the flag IS
  // honoured (CE=true and CE=false give different solids); what is wrong is the
  // CE=true construction itself, 12.16% under CadQuery, while CE=false/Fixed
  // are bit-exact. The message must state the measured fact, so this assertion
  // follows the corrected wording.
  it('error message documents the measured CE behaviour, not "ignored"', async () => {
    const code = [
      "import * as cq from '@faicad/faijs-cadquery'",
      'let p = cq.rect(cq.Workplane("XY"), 10, 20)',
      'let path = cq.splineWire3D([[0,0,0],[0,20,100]], [[0,0,1],[0,0,1]])',
      'let aux = cq.splineWire3D([[0,20,0],[20,0,100]], [[0,0,1],[0,0,1]])',
      'let r = await cq.sweep(p, path, { auxSpine: aux })',
      'let result = cq.val(r)',
    ].join('\n')
    const { failedAt } = await run(code)
    expect(failedAt?.message).toMatch(/honour the flag but their CE=true solid is 12\.16% off/)
  })
})
