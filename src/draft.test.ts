/**
 * `draft(ctx, base, faces, angle[, dir])` — free-function parity for upstream
 * `occ_impl/shapes.py:7794/7826` (CadQuery 2.8.0).
 *
 * Every geometric expectation is FROZEN from the ref capture
 * (`out/ref/tests.test_free_functions___test_draft__res{1,2}.step`, cross-checked
 * against a one-shot CadQuery 2.8.0 run — see
 * `tests/ref-harness/draft-ref-frame-probe.py`):
 *
 *   box_shape = box(1,1,1)   # occ_impl.shapes.box: xy-CENTRED, base on z=0
 *   res1 = draft(box_shape, face("<Z"), face("|X or |Y"), 5)          vol 1.0437443317629618
 *   res2 = draft(box_shape, face("<Z"), face("|X or |Y"), (0,0,1), 5) vol 0.956255668237038
 *
 * `face("|X or |Y")` returns ONE face (a single `Face`, not a compound); the
 * frozen capture used the +X face (ref bbox xmax = 0.587488664 = 0.5 + tan 5°),
 * so the mirror pins that face explicitly. Volume is face-invariant by symmetry,
 * but COM/bbox are not — which face is drafted is NOT observable from volume.
 *
 * The neutral plane is the KEY semantic: CadQuery hinges about the base face
 * plane (`base_pln`). The occt-wasm primitive has no neutral argument — it hinges
 * about the origin plane ⊥ pull — so only a base face on the origin plane is
 * representable. That coincidence is asserted, and the off-origin base is a
 * documented rejection (test below), NOT a silent wrong-plane draft.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { setupNativeKernel } from './gear-test-harness'
import { boundingBoxOf } from './shape-class'
import * as cq from './index'

beforeAll(async () => {
  await setupNativeKernel()
})

/** `box_shape = box(1,1,1)` (occ_impl.shapes.box: xy-centred, base z=0). */
async function boxShape() {
  return cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
}

function volOf(wp: { shape?: unknown }): number {
  return getBrepApi().getVolume(brepOf(wp.shape as never) as never)
}

describe('draft (free function)', () => {
  it('res1: direction inferred from the base normal — top grows, vol 1.0437443317629618', async () => {
    const b = await boxShape()
    const fbot = await cq.faces(b, '<Z')
    const fside = await cq.faces(b, '>X')
    const d = await cq.draft(b, fbot, fside, 5)
    // frozen from the ref capture
    expect(volOf(d)).toBeCloseTo(1.0437443317629618, 12)
    const bb = boundingBoxOf(brepOf(d.shape as never) as never)
    expect(bb.xmin).toBeCloseTo(-0.5, 12)
    expect(bb.xmax).toBeCloseTo(0.587488663525924, 12) // 0.5 + tan 5°
    expect(bb.zmin).toBeCloseTo(0, 12)
    expect(bb.zmax).toBeCloseTo(1, 12)
  })

  it('res2: explicit direction (0,0,1) — top shrinks, vol 0.956255668237038', async () => {
    const b = await boxShape()
    const fbot = await cq.faces(b, '<Z')
    const fside = await cq.faces(b, '>X')
    const d = await cq.draft(b, fbot, fside, { x: 0, y: 0, z: 1 }, 5)
    expect(volOf(d)).toBeCloseTo(0.956255668237038, 12)
    const bb = boundingBoxOf(brepOf(d.shape as never) as never)
    expect(bb.xmax).toBeCloseTo(0.5, 12) // shrinks inward, xmax unchanged
    expect(bb.xmin).toBeCloseTo(-0.5, 12)
  })

  it('the two draft directions are exact mirror volumes (sum = 2)', async () => {
    const b = await boxShape()
    const fbot = await cq.faces(b, '<Z')
    const fside = await cq.faces(b, '>X')
    const r1 = await cq.draft(b, fbot, fside, 5)
    const r2 = await cq.draft(b, fbot, fside, { x: 0, y: 0, z: 1 }, 5)
    expect(volOf(r1) + volOf(r2)).toBeCloseTo(2, 12)
  })

  it('rejects a base face OFF the origin plane (kernel has no neutral-plane arg)', async () => {
    // z-centred box => bottom face plane is z = -0.5, NOT the origin plane.
    const b = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, true] })
    const fbot = await cq.faces(b, '<Z')
    const fside = await cq.faces(b, '>X')
    await expect(cq.draft(b, fbot, fside, 5)).rejects.toThrow(/no neutral-plane argument/)
  })
})
