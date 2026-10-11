/**
 * P7/D2: DOF diagnostic probe on CqAssembly.solve().
 *
 * Pins the `underdetermined` passthrough added in D2 (src/assembly/assembly.ts):
 * both flat and tree solve branches now forward the solver's underdetermined
 * DOF diagnostic. GOTCHA/TODO: the current peer @faicad/faijs 0.31.2 dist does
 * NOT yet emit `underdetermined` (D1 is merged in faijs source, unreleased) —
 * these probes therefore pin the CURRENT behavior (field undefined). After the
 * peer upgrade carries D1, flip the assertions to the documented values:
 *   - unary (Fixed + FixedPoint + FixedAxis on b2) → dof = 1 (twist about (0,1,1))
 *   - well-determined (FixedRotation + FixedPoint) → undefined
 * The "never lies positively" invariant is asserted in both cases: the field is
 * set ONLY if the solver reported a positive dof.
 *
 * Isolation: solve() bakes poses in place — fresh geometry per case via
 * runtime.execute (same pattern as assembly-n3.test.ts).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { asPartName } from '@faicad/faijs/identity'
import { buildAssembly, constraintEx } from './assembly/index'
import type { Shape } from './adapters/faijs'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>
let shapeSeq = 0

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
}, 120000)

async function freshShapes(): Promise<{ b1: Shape; b2: Shape }> {
  const s = shapeSeq++
  const res = await runtime.execute([
    "import * as cq from '@faicad/faijs-cadquery'",
    `let b1 = cq.box(cq.Workplane("XY"), 10, 10, 10)`,
    `let big${s} = cq.val(b1)`,
    `let b2 = cq.box(cq.Workplane("XY"), 2, 2, 2)`,
    `let small${s} = cq.val(b2)`,
  ].join('\n'))
  expect(res.failedAt).toBeUndefined()
  const b1 = res.outputs.get(asPartName(`big${s}`)) as Shape
  const b2 = res.outputs.get(asPartName(`small${s}`)) as Shape
  expect(b1).toBeDefined()
  expect(b2).toBeDefined()
  return { b1, b2 }
}

describe('P7/D2: CqAssembly.underdetermined passthrough', () => {
  it('unary (Fixed+FixedPoint+FixedAxis): solver reports underdetermined.dof = 1 (twist about (0,1,1))', async () => {
    const { b1, b2 } = await freshShapes()
    const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
    const cFP = await constraintEx('b2', '', b2, '', '', null, 'FixedPoint', [0, 0, -3])
    const cFA = await constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', [0, 1, 1])
    const asm = buildAssembly('dof-unary', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cFP, ...cFA])
    asm.solve()
    // D1 carried by the packed faijs dist: unary leaves exactly 1 free DOF
    // (the twist about the (0,1,1) axis). Never lies positively is implied:
    // dof === 1 > 0.
    expect(asm.underdetermined?.dof).toBe(1)
    expect(asm.converged).toBe(true)
  })

  it('well-determined (Fixed+FixedPoint+FixedRotation): diagnostic absent', async () => {
    const { b1, b2 } = await freshShapes()
    const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
    const cFP = await constraintEx('b2', '', b2, '', '', null, 'FixedPoint', [0, 0, -3])
    const cFR = await constraintEx('b2', '', b2, '', '', null, 'FixedRotation')
    const asm = buildAssembly('dof-det', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cFP, ...cFR])
    asm.solve()
    expect(asm.underdetermined ?? undefined).toBeUndefined()
    expect(asm.converged).toBe(true)
  })
})
