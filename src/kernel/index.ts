/**
 * cq-compat kernel boundary — the ONLY module in `src/` that talks to the raw
 * occt-wasm kernel or names an `occt-wasm` type.
 *
 * ## Why a separate boundary from `../adapters/faijs`
 *
 * `../adapters/faijs.ts` funnels the faijs **host** surface (L1 ops, carriers,
 * the api namespace). The raw engine is a different kind of dependency: it is
 * the thing that actually produces geometry, it is versioned by `occt-wasm`
 * (not by faijs), and every entry in `CqKernel`'s surface is a WASM binding
 * that can silently vanish or change signature on a kernel bump.
 *
 * Keeping it separate means two greps answer two questions:
 *   - `grep -rn "@faicad/faijs" src/`   → what host surface do we depend on?
 *   - `grep -rn "src/kernel\|from 'occt-wasm'" src/` → what engine surface?
 *
 * ## The two accessors are NOT interchangeable
 *
 * - `getCqKernel()` → the **raw** `OcctKernel`. Every method is an unfiltered
 *   WASM binding: no name normalisation, no value coercion, no fallbacks. This
 *   is what `cq.*` uses when it needs a primitive faijs' L1 layer does not
 *   expose (`draftPrism`, `loftWithVertices`, `offsetWire2D`, …).
 * - `getBrepApi()` (from `../adapters/faijs`) → the **L1** `BrepEngineApi`.
 *   Normalised handles/values, safe defaults. Prefer this when it covers the
 *   call; reach for `getCqKernel()` only when it does not.
 *
 * ## Runtime gotcha (do not "simplify" the shape-class import away)
 *
 * Calling `getCqKernel().getSubShapes(...)` from a module that has NOT imported
 * `../shape-class` throws `Cannot read properties of undefined (reading
 * 'OcctKernel')`. The occt-wasm glue resolves that symbol through a closure
 * that `shape-class.ts`'s import side effect pins; importing this module alone
 * is not enough. Use `shape-class`'s `solids/wiresOf/shells/compounds/facesOf/
 * edgesOf` wrappers instead — see the long note in `workplane.ts` above its
 * `shape-class` import.
 */
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import type { OcctKernel } from 'occt-wasm'

// The `occt-kernel/occtKernel` module is one `exports` entry, so its symbols
// share this boundary with the raw kernel rather than living in the adapters
// funnel — splitting one module across two funnels would be worse than either.
export {
  collectLeafParts,
  importAssemblyFromStep,
  initOcctWasm,
  releaseAssemblyTree,
} from '@faicad/faijs/occt-kernel/occtKernel'

// `occt-wasm` value/type surface consumed by `src/`. Re-exported so that no
// other module needs a direct `occt-wasm` dependency edge.
export type { OcctKernel, ShapeHandle, Vec3, XCAFDocument } from 'occt-wasm'

/**
 * The raw kernel surface `cq.*` is allowed to call.
 *
 * Declared as an alias (not a hand-written interface) on purpose: the WASM
 * platform surface is `occt-wasm`'s to define, and a hand-copied interface
 * drifts silently on every kernel bump. What actually guards us is the
 * *runtime* probe in `src/kernel.probe.test.ts`, which asserts every method
 * `cq.*` reaches for exists on the live instance — a kernel bump that renames
 * a binding turns that test red instead of failing at runtime with
 * `undefined is not a function`.
 */
export type CqKernel = OcctKernel

/**
 * The raw occt-wasm kernel (process-wide singleton — same instance the host
 * hands out through `initOcctWasm()`).
 *
 * @returns the live raw kernel
 */
export function getCqKernel(): CqKernel {
  return getKernel()
}
