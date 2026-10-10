/**
 * Probe (durable evidence): the cq-compat kernel boundary.
 *
 * `src/kernel/index.ts` claims to be the single place where `src/` touches the
 * raw occt-wasm kernel, and `CqKernel` claims to be the surface `cq.*` may
 * call. Both claims are load-bearing on a kernel bump — `occt-wasm` adds and
 * renames WASM bindings freely, and a renamed binding fails at RUNTIME with
 * `undefined is not a function` in the middle of a geometry op, not at build
 * time. This test turns that into a red suite.
 *
 * It pins three separate things:
 *
 *  1. **Runtime surface** — every raw binding `cq.*` (today) or the N2 batch
 *     (next) reaches for exists as a function on the live instance. The list is
 *     curated, not the whole 211-method platform surface: asserting 211 names
 *     would go red on every unrelated kernel addition, which trains people to
 *     ignore the failure.
 *  2. **Semantics that already bit us** — `curveParameters` returns
 *     `{ first, last }` (NOT an array, the shape the name suggests), and a
 *     rigid `rotate` keeps an analytic curve analytic. Both were discovered the
 *     expensive way (see `ellipse-axis.probe.test.ts`).
 *  3. **The boundary itself** — statically, no module under `src/` outside the
 *     two boundary files names a host or engine specifier. This is what stops
 *     the funnel from rotting back into 18 scattered deep imports.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupNativeKernel } from './gear-test-harness'
import { getCqKernel } from './kernel'
import type { CqKernel } from './kernel'

let k: CqKernel
beforeAll(async () => {
  await setupNativeKernel()
  k = getCqKernel()
})

/**
 * Raw bindings `cq.*` calls today, plus the ones the N2 batch needs
 * (`makeSphere`/`halfSpace` for the angle-domain sphere, `sectionPlane` +
 * `common`/`cut` for the boolean-combination route, `projectEdges` +
 * `makeFaceOnSurface` + `liftCurve2dToPlane` for `op:project`/`op:faceOn`).
 */
const CONSUMED_SURFACE = [
  // construction
  'makeBox', 'makeSphere', 'makeFace', 'makeWire', 'makeLineEdge', 'makeArcEdge',
  'makeTangentArc', 'makeBezierEdge', 'makeEllipseEdge', 'makeVertex', 'makeSolid',
  'makeCompound', 'makeFaceOnSurface', 'bsplineSurface', 'approximatePoints',
  'interpolatePoints', 'interpolatePointsWithTangents',
  // modelling
  'extrude', 'draftPrism', 'loft', 'loftWithVertices', 'revolve', 'rotate', 'translate',
  'sweep', 'sweepOriented', 'sweepPipeShell', 'thicken', 'shell', 'offset', 'sew',
  'sewAndSolidify', 'healWire', 'fixFaceOrientations', 'simplify', 'outerWire',
  // booleans / planes
  'booleanOp', 'fuse', 'common', 'cut', 'halfSpace', 'sectionPlane', 'split',
  // queries
  'getBoundingBox', 'getShapeType', 'getSubShapes', 'getSurfaceArea', 'isValid',
  'isFace', 'isSolid', 'isShell', 'isSame', 'vertexPosition', 'curveLength',
  'curveParameters', 'curvePointAtParam', 'curveType', 'uvBounds', 'pointOnSurface',
  'surfaceNormal', 'offsetWire2D', 'projectEdges', 'liftCurve2dToPlane',
  // lifecycle / escape hatches
  'release', 'copy', 'fromBREP', 'toBREP', 'fromBREPBinary', 'toBREPBinary', 'getRawModule',
] as const

describe('probe: raw kernel surface (CqKernel)', () => {
  it('every binding cq.* reaches for exists on the live instance', () => {
    const missing = CONSUMED_SURFACE.filter((m) => typeof k[m] !== 'function')
    expect(missing, `missing raw-kernel bindings: ${missing.join(', ')}`).toEqual([])
  })

  it('is the same singleton the host hands out (getCqKernel === initOcctWasm)', async () => {
    const { initOcctWasm } = await import('./kernel')
    expect(k).toBe(await initOcctWasm())
  })

  it('curveParameters returns { first, last }, not a tuple', () => {
    const edge = k.makeLineEdge({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })
    const p = k.curveParameters(edge as never) as unknown as { first: number; last: number }
    expect(p).not.toBeInstanceOf(Array)
    expect(p.first).toBeCloseTo(0, 12)
    expect(p.last).toBeCloseTo(2, 12)
  })

  it('a rigid rotate keeps an analytic ellipse analytic (matrix path does not)', () => {
    const e = k.makeEllipseEdge({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 3, 1)
    const r = k.rotate(e as never, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } }, Math.PI / 2)
    expect(k.curveType(r as never)).toBe('ellipse')
  })
})

/**
 * Static boundary guard.
 *
 * `src/kernel/index.ts` owns `occt-wasm` + `@faicad/faijs/occt-kernel/occtKernel`;
 * `src/adapters/faijs.ts` owns every other `@faicad/faijs` specifier. Any other
 * module under `src/` that names one of them has bypassed the funnel and will
 * silently miss the next host re-layout.
 */
describe('boundary: src/ funnels host + engine imports', () => {
  const SRC = fileURLToPath(new URL('.', import.meta.url))

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) out.push(...sourceFiles(p))
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p)
    }
    return out
  }

  /** The two files allowed to name a host/engine specifier, and which ones. */
  const BOUNDARY: Record<string, RegExp> = {
    'src/kernel/index.ts': /^(occt-wasm|@faicad\/faijs\/occt-kernel\/occtKernel)$/,
    'src/adapters/faijs.ts': /^@faicad\/faijs(\/|$)/,
  }

  const IMPORT_RE = /(?:from|import\s*\()\s*['"]([^'"]+)['"]/g

  it('no module outside the two boundary files imports the host or the engine', () => {
    const offenders: string[] = []
    const root = join(SRC, '..')
    for (const abs of sourceFiles(SRC)) {
      const rel = abs.slice(root.length + 1).replace(/\\/g, '/')
      const text = readFileSync(abs, 'utf-8')
      const allowed = BOUNDARY[rel]
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1]!
        // Only the faijs FAMILY and the engine are gated; `@faicad/faijs-sketch`,
        // `-extra`, `-compare` and self-imports are independent packages.
        const gated =
          spec === 'occt-wasm' ||
          spec === '@faicad/faijs' ||
          spec.startsWith('@faicad/faijs/')
        if (!gated) continue
        if (!allowed || !allowed.test(spec)) offenders.push(`${rel} → ${spec}`)
      }
    }
    expect(offenders, `boundary leaks:\n${offenders.join('\n')}`).toEqual([])
  })
})
