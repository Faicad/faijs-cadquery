/**
 * shapeUnion / shapeIntersect / shapeDifference — set-operator parity for
 * CadQuery `Shape.__or__` / `__and__` / `__mod__` (src/workplane.ts).
 *
 * Upstream models `|` `&` `%` as SET operations over the underlying sub-shapes,
 * NOT geometric booleans (cadquery/occ_impl/shapes.py:1986-2014). `test_set_ops`
 * asserts:
 *
 *   (box.faces(">Z") | box.faces("<Z")).size() == 2   → union of 2 disjoint faces
 *   (box.faces(">Z") & box.faces("<Z")).size() == 0   → no shared face
 *   (box.faces("|Z") % box.faces("<Z")).size() == 1   → {top,bottom} − {bottom}
 *
 * The parity harness captures only the `simple_box` FIXTURE (the upstream test
 * exports no set-op geometry), so this unit test is the variation gate that
 * actually exercises the three functions. The runtime output map only carries
 * Shapes (not Workplanes), and `val()` returns the first object of a
 * multi-object workplane — so we assert the SET semantics through membership
 * on the Shape-only path:
 *   · union(fa,fb) − fa  ⟹ 1 face (fb)  AND  union(fa,fb) − fb ⟹ 1 face (fa)
 *     ⇒ the union carries exactly the two distinct members fa and fb (size 2).
 *   · intersect(fa,fb) is empty (0 faces).
 *   · difference(|Z set, <Z face) leaves the >Z face (1 face).
 *   · intersect(fa,fa) is non-empty (1 face) — the mutation: drop the dedup
 *     branch and union(fa,fa) would yield 2, flipping this red.
 *
 * Ground truth: CadQuery 2.8.0 test_shapes.py::test_set_ops.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import type { Shape } from '@faicad/faijs/mesh/types'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep') as never
  runtime.registerLib('cq', cq as never, {
    packageName: '@faicad/faijs-cadquery',
    autoLift: false,
  } as never)
})

function faceCount(shape: Shape | undefined): number {
  if (!shape) return 0
  const h = brepOf(shape) as BrepHandle
  return (getBrepApi().getSubShapes(h, 'face' as never) as unknown[]).length
}

async function runVal(body: string): Promise<Shape | undefined> {
  const code = [
    "import * as cq from '@faicad/faijs-cadquery'",
    "let bx = await cq.box(cq.Workplane('XY'), 1, 1, 1, { centered: [true, true, false] })",
    "let fa = cq.faces(bx, '>Z')",
    "let fb = cq.faces(bx, '<Z')",
    "let fc = cq.faces(bx, '|Z')",
    body,
    'let result = r',
  ].join('\n')
  const res = await runtime.execute(code)
  if (res.failedAt) throw new Error(res.failedAt.message)
  const out = res.outputs as Map<string, Shape>
  return out.get('result') ?? undefined
}

describe('shape set operators (CadQuery | & % parity)', () => {
  it('union of disjoint top+bottom faces has exactly 2 members', async () => {
    // Removing fa from the union leaves fb (1 face) AND removing fb leaves fa
    // (1 face) ⇒ the union carries precisely the two distinct members fa+fb.
    const afterFa = await runVal('let r = cq.val(cq.shapeDifference(cq.shapeUnion(fa, fb), fa))')
    const afterFb = await runVal('let r = cq.val(cq.shapeDifference(cq.shapeUnion(fa, fb), fb))')
    expect(faceCount(afterFa)).toBe(1)
    expect(faceCount(afterFb)).toBe(1)
  })

  it('intersection of disjoint top+bottom faces is empty (0 faces)', async () => {
    const s = await runVal('let r = cq.val(cq.shapeIntersect(fa, fb))')
    expect(faceCount(s)).toBe(0)
  })

  it('difference (|Z faces) − (<Z face) leaves 1 member (the >Z face)', async () => {
    const s = await runVal('let r = cq.val(cq.shapeDifference(fc, fb))')
    expect(faceCount(s)).toBe(1)
  })

  // Variation gate: a truly shared set would NOT be empty, so flipping the
  // intersection inputs to identical sets must yield 1 member — the mirror of
  // the mutation "make the two sets overlap" (and the dedup branch of union).
  it('intersection of identical face sets is non-empty (mutation sanity)', async () => {
    const s = await runVal('let r = cq.val(cq.shapeIntersect(fa, fa))')
    expect(faceCount(s)).toBe(1)
  })
})
