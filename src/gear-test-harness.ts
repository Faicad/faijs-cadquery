/**
 * Shared harness for the E1–E4 gear-extension ops.
 *
 * These ops call the occt-wasm kernel directly via `getCqKernel()` (the native
 * singleton that `registerOcctBrepEngine()` initializes) and wrap results with
 * `fromHandle`. `fromHandle` needs `getBackends().kernel.brep` to be a MESHABLE
 * kernel. Since the 2026-09-24 narrowing (D12), `kernel.brep` must be the **L1
 * adapter** (`BrepEngineApi`) — the L1 normalized method names
 * (`surfaceCenterOfMass` / `subShapeHashes` / `uvBounds` …) exist only on the
 * adapter, not on the raw `OcctKernel`. So we wire `occtEngine.primitives`
 * (the L1 adapter over the SAME kernel singleton) into `configureBackends`;
 * `createOcctPrimitives()` internally uses the same `initOcctWasm()` singleton,
 * so handle spaces stay consistent across ops and fixtures.
 *
 * This file is NOT a test (no `*.test.ts`); it is imported by the E1–E4 specs.
 */

import {
  CONTRACT_VERSION,
  OCCT_BREP_ENGINE_ID,
  brepOf,
  configureBackends,
  getBrepEngine,
  registerOcctBrepEngine,
} from './adapters/faijs'
export { brepOf }
import type { Shape } from './adapters/faijs'
import { getCqKernel } from './kernel'
import type { OcctKernel, ShapeHandle } from './kernel'
import type { Workplane } from './workplane'

/**
 * Initialise the native occt-wasm kernel for the E1–E4 specs.
 *
 * Calls `registerOcctBrepEngine()` (which boots the kernel singleton and
 * registers the OCCT engine) and then wires that SAME instance into the
 * backend registry via `configureBackends`, so `fromHandle` can resolve a
 * meshable kernel. Must be awaited in `beforeAll` before any op is invoked.
 *
 * @returns a promise that resolves once the kernel and backends are ready
 */
export async function setupNativeKernel(): Promise<void> {
  await registerOcctBrepEngine()
  // 0.31.2 起 core 彻底移除了能力声明面（BrepEngine 不再有 `capabilities`、
  // configureBackends 的 config 也不再收 `brepCapabilities`）：引擎能做什么由
  // 其 `primitives` 契约本身决定，无独立能力列表可搬运。故此处只注入 `primitives`。
  const occtEngine = await getBrepEngine(OCCT_BREP_ENGINE_ID)
  // 收窄后（2026-09-24）注入 L1 适配器而非裸 occt-wasm：L1 归一化方法名只在
  // 适配器上（occt-primitives.ts）。句柄空间同一（适配器内部 = initOcctWasm 单例）。
  configureBackends({
    contractVersion: CONTRACT_VERSION,
    config: {
      mode: 'brep',
      brepEngineId: 'occt',
    },
    kernel: { brep: occtEngine.primitives, csg: undefined, sdf: undefined },
    fonts: undefined,
    texture: undefined,
    assets: undefined,
    events: undefined,
  })
}

/**
 * Return the shared native occt-wasm kernel singleton.
 *
 * The same instance the E1–E4 ops obtain internally via `getCqKernel()`, so
 * fixtures built here and op outputs share one handle space.
 *
 * @returns the live `OcctKernel` instance (valid after {@link setupNativeKernel})
 */
export function kernel(): OcctKernel {
  return getCqKernel() as unknown as OcctKernel
}

/**
 * Build a minimal valid root `Workplane` without touching the `cad.*` backend.
 *
 * Defaults to the XY plane at the origin (normal +Z, xDir +X, yDir +Y) with an
 * empty object stack and no pending wires; pass `over` to override any field
 * (e.g. `{ objects: [shape] }` or `{ normal, origin }`).
 *
 * P3: this fixture builds the carrier as a literal rather than through
 * `workplane.ts`'s private `clone()`, so it upholds the `shape === objects[0]`
 * invariant itself — accepting an `over` that sets only one of the two would
 * break it, and `shape` (being derived) is dropped from `over` unless `objects`
 * is given too.
 *
 * @param over - partial overrides merged onto the default workplane
 * @returns a `Workplane` literal suitable as the first argument of an op
 */
export function mkWP(over: Partial<Workplane> = {}): Workplane {
  // `shape` is DERIVED from `objects` (P3). Tolerate a caller that still passes
  // the legacy `over.shape` by folding it into the stack, so existing fixtures
  // keep working; an explicit `over.objects` always wins.
  const { shape: overShape, objects: overObjects, ...rest } = over
  const objects = overObjects ?? (overShape ? [overShape] : [])
  return {
    __cq: true,
    plane: 'XY',
    origin: [0, 0, 0],
    normal: [0, 0, 1],
    xDir: [1, 0, 0],
    yDir: [0, 1, 0],
    faceSel: null,
    edgeSel: null,
    vertexSel: null,
    pts: [],
    forConstruction: false,
    ...rest,
    objects,
    shape: objects[0] ?? null,
  }
}

/**
 * Axis-aligned bounding box of a shape, in the kernel's field naming.
 *
 * Mirrors the `BoundingBox` record returned by the native
 * `getBoundingBox` call (all six min/max fields, no `minX`-style aliases).
 */
export type BBox = {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  zmin: number
  zmax: number
}

/**
 * Compute the axis-aligned bounding box of a shape through the native kernel.
 *
 * @param shape - a faijs `Shape` carrying a BREP handle (see `brepOf`)
 * @returns the six-field bounding box
 */
export function bbox(shape: Shape): BBox {
  return kernel().getBoundingBox(brepOf(shape) as unknown as ShapeHandle) as BBox
}

/**
 * Surface area of a face (or total area of a shell/solid), via the native
 * kernel's `getSurfaceArea`.
 *
 * @param shape - a faijs `Shape` carrying a BREP handle (see `brepOf`)
 * @returns the area in model units squared
 */
export function area(shape: Shape): number {
  return kernel().getSurfaceArea(brepOf(shape) as unknown as ShapeHandle)
}
