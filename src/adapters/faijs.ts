/**
 * faijs host adapter — the ONLY module in `src/` that names a `@faicad/faijs`
 * specifier, with one deliberate exception: `../kernel/` owns the
 * `@faicad/faijs/occt-kernel/occtKernel` module and the `occt-wasm` types
 * (see that file's header for why the geometry engine gets its own boundary).
 *
 * ## Why this file exists
 *
 * `@faicad/faijs` resolves its deep subpaths through wildcard `exports` maps
 * (`./api/*`, `./brep/*`, `./occt-kernel/*`, …). That is great for the host
 * (it can reorganise freely) and bad for us: every reorganisation is a
 * repo-wide import rewrite here. Funnelling them through one re-export module
 * means a host re-layout touches exactly this file — the same discipline the
 * faijs-gears template applies (`src/kernel/gears.ts`).
 *
 * This module is a **pure re-export**. It deliberately contains no logic, so
 * that it can never become a place where bugs hide and so that bundlers can
 * fully tree-shake it (`export … from` is a live binding, not a copy).
 *
 * ## Scope
 *
 * Only `@faicad/faijs`. The sibling packages (`@faicad/faijs-sketch`,
 * `@faicad/faijs-extra`) version independently and are NOT re-exported here.
 *
 * `occt-wasm` is likewise out of scope — the raw geometry engine lives in
 * `../kernel/` (see that module's header for the split rationale).
 *
 * ## How to add an import
 *
 * Add the re-export here, then import it from `'../adapters/faijs'` at the call
 * site. Under `isolatedModules` a type-only re-export MUST use `export type`,
 * otherwise the declaration emit fails.
 */

// ── root entry ─────────────────────────────────────────────────────────────
export {
  CONTRACT_VERSION,
  OCCT_BREP_ENGINE_ID,
  configureBackends,
  getBrepEngine,
  nameOf,
  registerOcctBrepEngine,
  setName,
} from '@faicad/faijs'

// ── shape / topology carriers ──────────────────────────────────────────────
export { brepOf, ensureSlot, fromBrep, getSlot, isShape } from '@faicad/faijs/shape'
export type { CompoundShape } from '@faicad/faijs/shape'
export { fromHandle } from '@faicad/faijs/sdk'
export type { BrepBoundingBox, BrepHandle } from '@faicad/faijs/brep/engine/types'
export { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
export type { BrepEngineApi } from '@faicad/faijs/brep/engine/primitives'
export { applyTransformBrep, rotateBrep, solidToShape, translateBrep } from '@faicad/faijs/brep/brep-ops'
export type { Shape } from '@faicad/faijs/mesh/types'
export { applyTransform } from '@faicad/faijs/mesh/rigid-transform'

// ── backend registry / runtime state ───────────────────────────────────────
export { getBackends } from '@faicad/faijs/runtime-state'
export type { AssemblyTransform } from '@faicad/faijs/runtime-state'

// ── api surface ────────────────────────────────────────────────────────────
export { createApiNamespace } from '@faicad/faijs/api/api-namespace'
export type { AssemblyConstraint, EntityRef } from '@faicad/faijs/api/assembly/types'
export { applyMatrixBrep } from '@faicad/faijs/api/brep-operations/topologyFns'
export {
  resolveEdgeSelection,
  resolveFaceEdgeSelection,
  resolveFaceSelector,
  resolveSelection,
} from '@faicad/faijs/api/cadquery-selectors'
export type { SelStep } from '@faicad/faijs/api/cadquery-selectors'
export { angleBetweenNormals, chamferAngleFromDistances, materialDihedralFromNormalAngle } from '@faicad/faijs/api/chamfer-math'

// ── text ───────────────────────────────────────────────────────────────────
export { ensureFont } from '@faicad/faijs/brep/text/fontRegistry'
export { textBlueprints } from '@faicad/faijs/brep/text/text-to-solid'
