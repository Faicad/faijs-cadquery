/**
 * Guard: `sweep(auxSpine=…)` must keep rejecting loudly.
 *
 * Why this test exists (global rule: verified-but-negative API findings are
 * frozen as tests): occt-wasm 5.6 ADDED `curvilinearEquivalence` to
 * SweepAdvancedOptions (types.d.ts:275), which reads as if the kernel gap
 * `kernel:sweep-aux-spine-mode` were closed. It is NOT — at runtime the option
 * is ignored and sweepAdvanced(mode: Auxiliary, auxSpine, curvilinearEquivalence:
 * true) returns the same 12.2%-wrong volume as the raw sweepOriented mode 3
 * (captured 2026-10-06: cand 17759.157466286128 vs CadQuery 20218.347254736764,
 * scripts/probe-aux-spine.py / probe-aux-spine-steps.py). This test freezes the
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

  it('error message documents that 5.6 sweepAdvanced ignores the flag', async () => {
    const code = [
      "import * as cq from '@faicad/faijs-cadquery'",
      'let p = cq.rect(cq.Workplane("XY"), 10, 20)',
      'let path = cq.splineWire3D([[0,0,0],[0,20,100]], [[0,0,1],[0,0,1]])',
      'let aux = cq.splineWire3D([[0,20,0],[20,0,100]], [[0,0,1],[0,0,1]])',
      'let r = await cq.sweep(p, path, { auxSpine: aux })',
      'let result = cq.val(r)',
    ].join('\n')
    const { failedAt } = await run(code)
    expect(failedAt?.message).toMatch(/accepts curvilinearEquivalence but ignores it/)
  })
})
