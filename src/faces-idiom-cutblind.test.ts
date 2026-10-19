/**
 * faces()-direct idiom probe (regression hunt, 2026-10-19) — does
 * `faces(sel).profile.cutBlind(numeric)` still apply the face plane?
 *
 * Batch-1 refactor (b53ffc1) moved `applyPendingFacePlane` OUT of the shared
 * top of `cutBlind` and INTO the until=face branch only. `applyPendingFacePlane`
 * fires exactly when `wp.faceSel` is set — i.e. on the CQ idiom
 * `Workplane().box(1,1,1).faces(">Z").rect(1,.5).cutBlind(-0.2)` (no explicit
 * workplane() call). If the numeric path lost it, that idiom builds the
 * profile on the UN-LIFTED workplane and the feature lands half a body away.
 *
 * Expected values are the ones frozen in applyPendingFacePlane's own
 * docstring (workplane.ts):
 *   - faces(">Z").rect(1,.5).cutBlind(-0.2) -> CoM z = -0.044444
 *     (slot at z in [0.3, 0.5] of a 1³ box centred on the origin)
 *   - faces(">Z").rect(1,.5).cutBlind(+0.2) -> volume unchanged (1.0):
 *     the cut starts at z=0.5 and misses the solid entirely.
 * The explicit `workplane(faces(...))` idiom is the control — workplane()
 * clears faceSel in its result, so it never depends on this call.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  Workplane, box, faces, workplane, rect, cutBlind, val,
} from './workplane'
import { volumeOf, centerOfMassOf } from './shape-class'
import { setupNativeKernel } from './gear-test-harness'

beforeAll(async () => {
  await setupNativeKernel()
})

const vol = (s: Workplane): number => volumeOf(val(s) as never)
const com = (s: Workplane) => centerOfMassOf(val(s) as never)

describe('faces()-direct idiom vs applyPendingFacePlane (cutBlind numeric path)', () => {
  it('direct: faces(">Z").rect(1,.5).cutBlind(-0.2) cuts INTO the box', async () => {
    const base = await box(Workplane(), 1, 1, 1)
    const f = await faces(base, '>Z')
    const r = rect(f, 1, 0.5)
    const res = await cutBlind(r, -0.2)
    // removed: 1 x 0.5 x 0.2 = 0.1 at z-centre 0.4 -> vol 0.9, CoM z -0.044444
    expect(vol(res)).toBeCloseTo(0.9, 9)
    expect(com(res).z).toBeCloseTo(-0.044444, 4)
  })

  it('direct: faces(">Z").rect(1,.5).cutBlind(+0.2) misses the solid', async () => {
    const base = await box(Workplane(), 1, 1, 1)
    const f = await faces(base, '>Z')
    const r = rect(f, 1, 0.5)
    const res = await cutBlind(r, 0.2)
    expect(vol(res)).toBeCloseTo(1.0, 9)
  })

  it('control: workplane(faces(">Z")).rect(1,.5).cutBlind(-0.2)', async () => {
    const base = await box(Workplane(), 1, 1, 1)
    const f = await faces(base, '>Z')
    const w = await workplane(f)
    const r = rect(w, 1, 0.5)
    const res = await cutBlind(r, -0.2)
    expect(vol(res)).toBeCloseTo(0.9, 9)
    expect(com(res).z).toBeCloseTo(-0.044444, 4)
  })
})
