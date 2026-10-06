# AGENTS.md

CadQuery 2.8.0 API-compatibility layer for faijs. Geometry runs on the `occt-wasm` kernel; this repo ports CadQuery's Workplane/assembly surface, not CadQuery itself.

## Repo shape

- Standalone single-package repo (split out of the faijs monorepo on 2026-10-05). **No npm workspaces** — all source is under `src/`, unit tests are colocated as `src/**/*.test.ts`.
- `dependencies` is empty; consumers supply the peers `@faicad/faijs`, `occt-wasm`, `@faicad/faijs-sketch`, `@faicad/faijs-extra`.
- Dev-only self-link `"@faicad/faijs-cadquery": "file:."` in `node_modules` resolves to `dist/`. The parity CLI subprocess depends on it; `npm install` recreates it.

## Commands (order matters)

- Local full CI on Windows: `pwsh scripts/ci.ps1` (add `all` to also write `ci.log`). It **must stay step-aligned** with `.github/workflows/ci.yml`: `lint → typecheck → build → test (watchdog + stderr zero tolerance) → pack`.
- `npm run lint` — eslint **`src` only**; `tests/` and `scripts/` are ignored.
- `npm run typecheck` — `tsc --noEmit` over `src` (includes tests).
- `npm run build` — `tsc -p tsconfig.build.json && node scripts/fix-import-extensions.mjs dist`.
- Single test: `npx vitest run -t <name>` (or `npm test -- -t <name>`). Prefer `npx vitest` directly to skip the automatic rebuild.
- `npm test` has a `pretest` that runs `npm run build` first. `dist/` is gitignored — a fresh checkout must build before any test that spawns the CLI.

## Build / ESM gotchas

- Source uses `moduleResolution: "bundler"` and omits `.js` extensions, but output is ESM. `scripts/fix-import-extensions.mjs` rewrites relative specifiers in `dist/` post-build (`./x` → `./x.js` or `./x/index.js`, and worker-URL `.ts` → `.js`). **Never hand-edit `dist/`** — edit `src/` and rebuild.
- `tsconfig.json` = typecheck (incremental off, all `*.test.ts` included). `tsconfig.build.json` = emit (excludes `*.test.ts`). Tests are not shipped.

## Entry points & API shape

- `package.json` exports: `.` (`src/index.ts`), `./browser`, `./assembly`, `./assembly/browser`, `./sketch`.
- `src/index.ts` = root/node entry. `src/browser.ts` = browser-safe entry (same workplane surface, no node-only helpers) so bundled `.fai.js` scripts keep `import * as cq from '@faicad/faijs-cadquery'`.
- `src/workplane.ts` is the core and the largest file. Its API is deliberately **standalone functions taking the Workplane as first arg** (`box(wp, …)`, `faces(wp, '>Z')`) — `src/transpile.ts` rewrites CadQuery method chains into this form for `.fai.js`.
- `src/transpile.ts` + `scripts/transpile-file.ts` = targeted CadQuery-Python → `.fai.js` transpiler (not general Python). Target scripts use the restricted `.fai.js` subset (no function literals).
- `src/assembly/` = assembly layer. Node entry `./assembly/index` includes `save()` (uses `node:fs`); browser entry is `./assembly/browser`. Consumers must use the CQ `solve()`/`toCompound()`/`save()` API, **never core solver internals** (`getSlot(...).behavior.solveDetailed`).
- Other modules: `shape-class.ts`, `object-selectors.ts` (TS has no `&`/`+`/`-` operator overloading — binary selectors are constructed explicitly), `plane.ts`, `sketch.ts`/`sketch-pkg.ts` (secondary exports prefixed `sketch*`), `text-solid.ts`, `geom-types.ts`.

## Testing

- `vitest.config.ts` aliases `@faicad/faijs-cadquery` → `src/`, so in-process unit tests exercise source. But `src/parity-smoke.test.ts` shells out to `npx tsx tests/faijs-cli.mjs`, which resolves the package through `node_modules` → `dist/`. Parity-smoke therefore needs a fresh build **and** the `file:.` self-link.
- Per-test timeout is 300s. `npm test` is wrapped by `scripts/run-tests-with-watchdog.mjs` with a hard 5-min process budget (`FAIJS_TEST_BUDGET_MS`) that task-kills the tree, because vitest's own timeout cannot break a synchronous native hang in the WASM OCCT call.
- **stderr zero tolerance**: CI fails on any test emitting a `stderr |` line. A test that intentionally triggers an error must spy on `console.warn`/`console.error` and assert the message was captured.
- Golden data: `fixtures/data/` (STEP files, fonts, step-metadata) for unit tests; `tests/fixtures/ref/` are frozen reference STEP baselines for the smoke suite.

## CadQuery parity harness (local-only, not in CI)

- `tests/manifest.json` is the single source of truth for the three-state registry (`ported` / `blocked` / `skipped`). `tests/baseline.json` pins CadQuery v2.8.0, OCP, and the env path — it is authoritative over the path quoted in `tests/README*.md`.
- Full pipeline needs a local CadQuery venv: `run-ref.py` → `analyze-coverage.py` (→ `coverage.json`) → `gen-manifest.ts` → `run-cand.ts` (after `npm run build`) → `compare.ts` (→ `out/report.*`). `npm run compat:report` runs only the last three TS steps.
- Red lines (see `tests/README.md`): `blocked` entries must carry `blockedBy`; never flip `blocked` → `ported`; never loosen tolerances to turn `FAIL` → `PASS` (tolerances live in `tests/compare.ts`); after adding any `tests/**/*.fai.js` mirror you **must** re-run `gen-manifest.ts`.
- Mirror naming: `tests/<module>/<Class>__<test>__<var>.fai.js`; last line must be `let result = cq.val(...)` with the variable aligned to the ref `__var__`.

## Naming convention

- Script artifacts use the `.fai.js` extension. The project standardizes container/archive naming on `.fai.zip` — do not introduce legacy `.faicad` naming.

## Stale references to ignore

- `src/browser.ts` and `src/parity-smoke.test.ts` comments mention `src/step-compare.ts` / `assembly-compare`; those files do not exist here — comparison comes from the `@faicad/cq-compat-compare` devDependency.
- `tests/README*.md` link `docs/handover/...` and use workspace syntax (`npm run build -w @faicad/faijs-cadquery`); `docs/` does not exist in the standalone repo and the build is now a single root `npm run build`.