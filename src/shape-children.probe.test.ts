/**
 * Probe (durable evidence): kernel `iterShapes` semantics + sub-shape handle
 * reuse in a NEW compound.
 *
 * These are the two facts `filterByPredicate` / `sortByKey` depend on, and
 * neither was verified before: faijs-cadquery had **no** prior `iterShapes` use
 * (grep count 0). Kept as a test because getting them wrong yields a silently
 * wrong compound instead of an error.
 *
 * Frozen reference behaviour — upstream CadQuery 2.8.0 `Compound.__iter__`
 * (`occ_impl/shapes.py:1732`) walks with `TopoDS_Iterator`, i.e. it yields the
 * **direct children**, NOT the recursively flattened leaves. `Shape.filter` /
 * `Shape.sort` are defined in terms of that iteration
 * (`compound(*filter(f, self))`, `occ_impl/shapes.py:1928/1932`), so the mirror
 * must reproduce direct-child semantics.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import type { OcctKernel, ShapeHandle } from 'occt-wasm'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { setupNativeKernel } from './gear-test-harness'
import { makeCompound, unwrapShape, volumeOf, wrapShape } from './shape-class'

beforeAll(async () => {
  await setupNativeKernel()
})

function k(): OcctKernel {
  return getKernel() as unknown as OcctKernel
}

/** Child handles of a compound, via the raw kernel `iterShapes`. */
function children(h: ShapeHandle): ShapeHandle[] {
  return k().iterShapes(h) as unknown as ShapeHandle[]
}

function box(sx: number, sy: number, sz: number): ShapeHandle {
  return k().makeBox(sx, sy, sz) as never
}

describe('probe: kernel iterShapes semantics', () => {
  it('yields the direct children of a flat compound', () => {
    const c = makeCompound([wrapShape('solid', box(1, 1, 1)), wrapShape('solid', box(2, 2, 2))])
    const kids = children(unwrapShape(c))
    expect(kids.length).toBe(2)
  })

  it('is DIRECT-only, not recursive (matches upstream TopoDS_Iterator)', () => {
    const inner = makeCompound([wrapShape('solid', box(1, 1, 1)), wrapShape('solid', box(2, 2, 2))])
    const outer = makeCompound([inner, wrapShape('solid', box(3, 3, 3))])
    const kids = children(unwrapShape(outer))
    // Direct children = the nested compound + the 3-box. If this ever returns 3,
    // iterShapes became recursive and `filterByPredicate` would over-count.
    expect(kids.length).toBe(2)
  })

  it('on a solid yields its SHELL — precisely TopoDS_Iterator, no special case', () => {
    // NOT zero, and NOT the solid itself: a `TopoDS_Iterator` over a solid walks
    // to its direct sub-shape, which is the shell. Verified by measurement
    // (`iterShapes(makeBox(1,1,1))` -> 1 child of type `shell`).
    //
    // This is why the op must NOT special-case non-compounds: upstream
    // `Shape.filter` on a solid would do `compound(*filter(f, <shell>))` too.
    const kids = children(box(1, 1, 1))
    expect(kids.length).toBe(1)
    expect(k().getShapeType(kids[0]!)).toBe('shell')
  })

  it('child kinds follow the container (compound -> solids, nested -> compound+solid)', () => {
    const flat = makeCompound([wrapShape('solid', box(1, 1, 1)), wrapShape('solid', box(2, 2, 2))])
    expect(children(unwrapShape(flat)).map((h) => k().getShapeType(h))).toEqual(['solid', 'solid'])
    const nested = makeCompound([wrapShape('solid', box(1, 1, 1)), wrapShape('solid', box(2, 2, 2))])
    const outer = makeCompound([nested, wrapShape('solid', box(3, 3, 3))])
    expect(children(unwrapShape(outer)).map((h) => k().getShapeType(h))).toEqual(['compound', 'solid'])
  })

  it('borrowed child handles can be re-aggregated into a new compound', () => {
    // The exact mechanism `filterByPredicate` uses: take a SUBSET of a
    // compound's children and build a new compound from them. The children are
    // borrowed (owned by the source compound, which stays alive), so no release
    // is needed here and no double-release can occur.
    const c = makeCompound([
      wrapShape('solid', box(1, 1, 1)),
      wrapShape('solid', box(2, 2, 2)),
      wrapShape('solid', box(3, 3, 3)),
    ])
    const kids = children(unwrapShape(c))
    expect(kids.length).toBe(3)
    const picked = makeCompound([kids[0]!, kids[2]!])
    expect(volumeOf(picked)).toBeCloseTo(1 + 27, 9)
  })
})
