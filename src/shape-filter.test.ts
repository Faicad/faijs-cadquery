/**
 * `filterByPredicate` / `sortByKey` — SHAPE-receiver parity for upstream
 * `Shape.filter(f)` / `Shape.sort(key)` (`occ_impl/shapes.py:1928/1932`).
 *
 * EVERY geometric expectation here is FROZEN from a ONE-SHOT CadQuery 2.8.0
 * capture (baseline venv, values inlined — not re-derived from the source text):
 *
 *   c  = compound(box(1,1,1), box(2,2,2), box(3,3,3))     # shapes.box: xy-centred, base z=0
 *   c.Volume() = 36   f18/e36/v24   child volumes [1, 8, 27]
 *   cf = c.filter(lambda x: x.Volume() <= 1)   -> 1 child, vol 1,  f6/e12/v8, bb x[-0.5,0.5] z[0,1]
 *        c.filter(lambda x: x.Volume() >  5)   -> 2 children, vol 35
 *        c.filter(lambda x: x.Volume() > 99)   -> size 0, vol 0, Compound (NOT None)
 *   cs = c.sort(lambda x: -x.Volume())         -> child volumes [27, 8, 1]
 *        c.sort(lambda x:  x.Volume())         -> child volumes [1, 8, 27]
 *
 * WHY the ORDER assertions exist: `tests/compare.ts:117-129` compares volume,
 * centre of mass, bbox, boolean-difference and topology counts — not one of
 * which is order-sensitive. The STEP for `cs` is byte-identical to `c`, so
 * parity can never tell a working `sort` from a broken one. The order truth is
 * pinned HERE or it is not pinned at all (the §5.1 "one-shot capture frozen
 * into an assertion" doctrine; same reason the kind selectors live in
 * `kind-selectors.test.ts`).
 *
 * Two DSL traps are pinned as regressions below — an arrow body cannot see the
 * `cq` namespace, and a DSL `function` is always async. Read them before
 * writing a mirror.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { OcctKernel, ShapeHandle } from 'occt-wasm'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import { fromHandle } from '@faicad/faijs/sdk'
import { asPartName } from '@faicad/faijs/identity'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import type { Shape } from '@faicad/faijs/mesh/types'
import { setupNativeKernel } from './gear-test-harness'
import { boundingBoxOf, childrenOf, volumeOf } from './shape-class'
import { filterByPredicate, sortByKey } from './workplane'
import * as cq from './index'

beforeAll(async () => {
  await setupNativeKernel()
})

function k(): OcctKernel {
  return getKernel() as unknown as OcctKernel
}

/**
 * Upstream `occ_impl.shapes.box(sx, sy, sz)` — **xy-centred, base on z = 0**
 * (`Solid.makeBox` with a shifted origin), whereas the raw kernel `makeBox` is
 * corner-at-origin. Building the fixture this way keeps the bboxes below equal
 * to the capture instead of manufacturing a second, different convention.
 */
function upBox(sx: number, sy: number, sz: number): ShapeHandle {
  return k().translate(k().makeBox(sx, sy, sz), -sx / 2, -sy / 2, 0) as never
}

/** `c = compound(box(1,1,1), box(2,2,2), box(3,3,3))` as a mesh Shape. */
function threeBoxes(): Shape {
  return fromHandle(
    k().makeCompound([upBox(1, 1, 1), upBox(2, 2, 2), upBox(3, 3, 3)] as never) as never,
  ) as Shape
}

/** Child volumes in kernel order — the value the STEP comparator cannot see. */
function childVolumes(shape: Shape): number[] {
  return childrenOf(brepOf(shape) as never).map((c) => Number(volumeOf(c).toFixed(6)))
}

/** Topology counts + bbox of a mesh Shape. */
function metrics(shape: Shape) {
  const h = brepOf(shape) as BrepHandle
  const api = getBrepApi()
  const n = (kind: string) => (api.getSubShapes(h, kind as never) as unknown[]).length
  const bb = boundingBoxOf(brepOf(shape) as never)
  return { vol: api.getVolume(h), faces: n('face'), edges: n('edge'), vertices: n('vertex'), bb }
}

describe('filterByPredicate (Shape.filter)', () => {
  it('the fixture matches the capture: vol 36, f18/e36/v24, children [1, 8, 27]', () => {
    const m = metrics(threeBoxes())
    expect(m.vol).toBeCloseTo(36, 9)
    expect([m.faces, m.edges, m.vertices]).toEqual([18, 36, 24])
    expect(childVolumes(threeBoxes())).toEqual([1, 8, 27])
  })

  it('keeps only the matching child — vol 1, f6/e12/v8, bb x[-0.5,0.5] z[0,1]', async () => {
    const cf = await filterByPredicate(threeBoxes(), (x) => volumeOf(x) <= 1)
    const m = metrics(cf)
    expect(m.vol).toBeCloseTo(1, 9)
    expect([m.faces, m.edges, m.vertices]).toEqual([6, 12, 8])
    expect(m.bb.xmin).toBeCloseTo(-0.5, 9)
    expect(m.bb.xmax).toBeCloseTo(0.5, 9)
    expect(m.bb.zmin).toBeCloseTo(0, 9)
    expect(m.bb.zmax).toBeCloseTo(1, 9)
  })

  it('keeps several children — `Volume() > 5` leaves 2 children, vol 35', async () => {
    const cf = await filterByPredicate(threeBoxes(), (x) => volumeOf(x) > 5)
    expect(childVolumes(cf)).toEqual([8, 27])
    expect(metrics(cf).vol).toBeCloseTo(35, 9)
  })

  it('an empty selection yields an EMPTY compound (vol 0), not null — upstream `compound(*[])`', async () => {
    const none = await filterByPredicate(threeBoxes(), () => false)
    expect(none).not.toBeNull()
    expect(k().getShapeType(brepOf(none) as never)).toBe('compound')
    expect(childrenOf(brepOf(none) as never).length).toBe(0)
    // GOTCHA: an empty compound carries NO geometry, so the kernel's
    // `getBoundingBox` (and therefore `boundingBoxOf`) THROWS
    // `OcctError: getBoundingBox: shape has no geometry`. Volume is still
    // well-defined (0) — that is what upstream's empty `compound()` reports too.
    expect(getBrepApi().getVolume(brepOf(none) as BrepHandle)).toBeCloseTo(0, 9)
  })

  it('awaits an async predicate — a DSL `function` is ALWAYS async (promise-truthiness trap)', async () => {
    // A `.fai.js` `function` declaration compiles to an `async function`
    // (core/src/cad-runtime/direct-executor.ts:1012), so the predicate hands back
    // a Promise. A Promise is truthy, so a naive `Array.prototype.filter` would
    // keep EVERY child: without the await this assertion reads vol 36, not 1.
    const cf = await filterByPredicate(threeBoxes(), async (x) => volumeOf(x) <= 1)
    expect(childVolumes(cf)).toEqual([1])
    expect(metrics(cf).vol).toBeCloseTo(1, 9)
  })

  it('the predicate receives a sub-shape the class model can measure', async () => {
    const seen: Array<{ type: string; vol: number }> = []
    await filterByPredicate(threeBoxes(), (x) => {
      seen.push({ type: k().getShapeType(x.handle), vol: volumeOf(x) })
      return false
    })
    expect(seen.map((s) => s.type)).toEqual(['solid', 'solid', 'solid'])
    // Volumes arrive with the kernel's usual float noise (1 -> 0.9999999999999998),
    // the same figure the ref manifests carry, so compare rounded values.
    expect(seen.map((s) => Number(s.vol.toFixed(6)))).toEqual([1, 8, 27])
  })

  it('fails loudly on a null shape instead of returning a bogus compound', async () => {
    await expect(filterByPredicate(null, () => true)).rejects.toThrow(/no shape to operate on/)
  })
})

describe('sortByKey (Shape.sort)', () => {
  it('descending volume via `-Volume` — children [27, 8, 1] (capture)', async () => {
    expect(childVolumes(await sortByKey(threeBoxes(), async (x) => -volumeOf(x)))).toEqual([27, 8, 1])
  })

  it('ascending by default, matching Python `sorted(key=…)` — children [1, 8, 27]', async () => {
    expect(childVolumes(await sortByKey(threeBoxes(), (x) => volumeOf(x)))).toEqual([1, 8, 27])
  })

  it('is a stable sort (Python `sorted` parity) — equal keys keep source order', async () => {
    // Every key is 0, so a stable sort must leave [1, 8, 27] untouched.
    expect(childVolumes(await sortByKey(threeBoxes(), () => 0))).toEqual([1, 8, 27])
  })

  it('reordering is invisible to the STEP comparator — geometry stays vol 36, f18/e36/v24', async () => {
    const m = metrics(await sortByKey(threeBoxes(), async (x) => -volumeOf(x)))
    expect(m.vol).toBeCloseTo(36, 9)
    expect([m.faces, m.edges, m.vertices]).toEqual([18, 36, 24])
  })
})

describe('mirror source under the CLI loader settings (autoLift:false)', () => {
  // The CLI loads @faicad/faijs-cadquery with `faijs.autoLift:false`
  // (packages/faijs-cadquery/package.json -> node-host/cli.ts autoLiftFor). A
  // default-registered library lifts `cq.*` into ops instead, which is a
  // DIFFERENT call path — so this case is the only one that proves the mirror
  // really runs in the CLI (see `wedge-shell.test.ts` for the same discipline).
  const HEAD = [
    "import * as cq from '@faicad/faijs-cadquery'",
    'let b1 = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })',
    'let b2 = await cq.box(cq.Workplane(), 2, 2, 2, { centered: [true, true, false] })',
    'let b3 = await cq.box(cq.Workplane(), 3, 3, 3, { centered: [true, true, false] })',
    'let c = cq.compound(cq.val(b1), cq.val(b2), cq.val(b3))',
  ]

  /** Run DSL source on the CLI's loader settings and return the `result` output. */
  async function runCli(body: string[]): Promise<{ shape?: Shape; failedAt?: { message: string } }> {
    const runtime = createRuntime(createNodePorts(), 'brep')
    runtime.registerLib('cq', cq as never, {
      packageName: '@faicad/faijs-cadquery',
      autoLift: false,
    } as never)
    await registerOcctBrepEngine()
    const res = await runtime.execute([...HEAD, ...body].join('\n'))
    return {
      shape: res.outputs.get(asPartName('result')) as Shape | undefined,
      failedAt: res.failedAt as { message: string } | undefined,
    }
  }

  it('test_special__cf: a function-declaration λ gives vol 1 / f6/e12/v8, bb z[0,1]', async () => {
    const { shape, failedAt } = await runCli([
      'function isSmall(x) { return cq.volumeOf(x) <= 1 }',
      'let result = await cq.filterByPredicate(c, isSmall)',
    ])
    expect(failedAt).toBeUndefined()
    expect(shape).toBeDefined()
    const m = metrics(shape!)
    expect(m.vol).toBeCloseTo(1, 9)
    expect([m.faces, m.edges, m.vertices]).toEqual([6, 12, 8])
    expect(m.bb.xmin).toBeCloseTo(-0.5, 9)
    expect(m.bb.zmin).toBeCloseTo(0, 9)
    expect(m.bb.zmax).toBeCloseTo(1, 9)
  })

  it('GOTCHA: an ARROW body cannot reference the `cq` namespace — declare a `function`', async () => {
    // Wrong: `let pick = (x) => cq.volumeOf(x) <= 1`.
    // `transformVariable` lifts only ctx/declared names (`hoistText`,
    // core/src/cad-runtime/direct-executor.ts:1287) and does NOT rewrite the
    // namespace, so the arrow body keeps a free `cq` that is not in scope.
    const arrow = await runCli([
      'let pick = (x) => cq.volumeOf(x) <= 1',
      'let result = await cq.filterByPredicate(c, pick)',
    ])
    expect(arrow.failedAt?.message).toMatch(/cq is not defined/)

    // Right: a `function` DECLARATION body gets `const cq = __ns.cq` injected
    // (same file, :1010) — which is why this form works and the arrow does not.
    // If the language layer ever lifts namespace references inside arrows too,
    // the first assertion above should start failing and this note can go.
    const declared = await runCli([
      'function pick(x) { return cq.volumeOf(x) <= 1 }',
      'let result = await cq.filterByPredicate(c, pick)',
    ])
    expect(declared.failedAt).toBeUndefined()
    expect(metrics(declared.shape!).vol).toBeCloseTo(1, 9)
  })
})
