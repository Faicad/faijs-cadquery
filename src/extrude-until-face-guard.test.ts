/**
 * P6-a freeze guard — until-face ("next" / "last" / Face) is unimplementable in
 * faijs 5.6 because the ray-face intersection primitive it depends on is absent.
 *
 * Upstream semantics (cadquery cq.py `Workplane._extrude` / `extrude` / `cutBlind`):
 *   - `until = "next"` → extrude to the FIRST face orthogonal to the wire normal
 *   - `until = "last"`  → extrude to the LAST face orthogonal to the wire normal
 *   - `until = Face`    → extrude to that specific face
 * All three delegate to `facesIntersectedByLine(face.Center(), eDir, direction)`,
 * which casts a ray along the wire normal and returns the ordered list of faces it
 * crosses; "next" takes index 0, "last" takes index -1. This is a RAY-FACE
 * intersection primitive.
 *
 * faijs 5.6 brep engine (BrepEngineApi, the L1 contract surface) exposes only:
 *   - `intersect(a, b)`      — boolean solid/solid intersection
 *   - `sectionByPlane(...)`  — intersection of a solid with an INFINITE plane
 * Neither can replace ray-face intersection: `intersect` takes two solids (no line,
 * no ordered face list), and `sectionByPlane` only cuts with a plane (no ray, no
 * per-face ordering, no curved-face support). So until-face cannot even be composed
 * from existing primitives — it is a STRUCTURAL gap, like P5-1 (subshape name/color)
 * and X-3 (layer), NOT a "write a mirror" task.
 *
 * This guard freezes that absence. It MUST turn RED the moment faijs adds a
 * ray-face intersection primitive to BrepEngineApi (e.g. `facesIntersectedByLine` or
 * any line/face-intersection method), forcing a re-evaluation of op:extrude-until-face
 * and op:cutBlind.until-face instead of silently treating them as unblocked.
 *
 * See docs/plans/2026-10-05-cadquery-post-occt56-plan.md §3.3 / §4 P6-a.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { getBackends } from '@faicad/faijs/runtime-state'
import { setupNativeKernel } from './gear-test-harness'

describe('P6-a until-face primitive gap (freeze guard)', () => {
  beforeAll(async () => {
    // Bootstrap the faijs backend (registers kernel.brep) the same way the assembly
    // tests do, so getBackends().kernel.brep is populated and inspectable.
    await setupNativeKernel()
  })

  it('faijs brep engine has no ray-face intersection primitive for until-face', async () => {
    const brep = (getBackends() as { kernel?: { brep?: Record<string, unknown> } }).kernel?.brep
    expect(brep).toBeDefined()

    const engine = brep as Record<string, unknown>
    // CadQuery's exact dependency name.
    expect(engine.facesIntersectedByLine).toBeUndefined()

    // Cover both object-literal (brepkit adapter) and class-instance (occt adapter) shapes.
    const ownNames = Object.keys(engine)
    const protoNames = Object.getOwnPropertyNames(Object.getPrototypeOf(engine))
    const allNames = [...ownNames, ...protoNames]
    const rayFace = allNames.find((m) =>
      /facesIntersectedByLine|rayFace|lineFaceIntersect|faceIntersectByLine|intersectWithLine/i.test(m),
    )
    expect(rayFace).toBeUndefined()
  })
})
