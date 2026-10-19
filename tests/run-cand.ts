/**
 * run-cand.ts — export candidate STEP files for mirrored cq-compat test cases.
 *
 * Walks `tests/<module>/<Case>__<test>__<var>.fai.js` files
 * (case IDs mirror the reference STEP naming from ref-harness/cq_step_plugin)
 * and runs each through the faijs CLI in brep mode, writing
 * `out/cand/<same-name>.step`.
 *
 * A case that fails to run keeps its `blocked` status in tests/manifest.json —
 * never silently dropped (stderr-zero / honesty rules apply).
 *
 * Usage: npx tsx tests/run-cand.ts [--module test_cadquery] [--only <substring>]
 */

import { readdirSync, mkdirSync, statSync, rmSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..') // repo root
const OUT_CAND = join(ROOT, 'out', 'cand')

// Fonts are a HOST responsibility (core only dependency-injects; the published
// @faicad/faijs tarball ships no bundled font). The host default here points at
// the monorepo core's source font when it exists locally; override with the
// FAIJS_DEFAULT_FONT env var.
const HOST_DEFAULT_FONT = join(ROOT, '..', 'faijs', 'packages', 'core', 'src', 'assets', 'fonts', 'OpenSans-Regular.ttf')
const defaultFontPath = process.env.FAIJS_DEFAULT_FONT ?? (existsSync(HOST_DEFAULT_FONT) ? HOST_DEFAULT_FONT : '')

// A healthy case costs ~6s; 20x that is a generous ceiling that still stops a
// wedged kernel from freezing the whole sweep.
const CASE_TIMEOUT_MS = 120_000

const args = process.argv.slice(2)
function argValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const moduleFilter = argValue('--module')
const onlyFilter = argValue('--only')

const CLI = join(HERE, 'faijs-cli.mjs')

// Cases whose candidate STEP must be produced by the self-hosted XCAF exporter
// (tests/export-cand-step.mjs) instead of the host CLI, because the host CLI's
// STEP writer drops a floating face that lives as a bare face child of a
// compound (N2-4 / `export:free-face-in-compound` — e.g. test_sewing__res3: 7
// faces in memory, 6 written by the host). This set is the durable route: it is
// keyed by mirror basename and is independent of manifest status, so a case
// that is already `ported` (because the self-hosted exporter makes it pass)
// still routes here on the next sweep. Add the mirror basename whenever a new
// floating-face case is mirrored.
const SELF_HOSTED_EXPORT_CASES = new Set([
  'test_sewing__res3',
  // N3 solved-assembly mirrors: asm.toCompound() carries no BREP slot of its own
  // (members are baked in place by solve()), and the 0.31.2 host CLI's
  // writeAssemblyStep gate rejects the slotless compound — self-hosted XCAF
  // export walks the baked children instead.
  'test_unary_constraints__simple_assy2',
  'test_unary_constraints__assy',
  'test_unary_constraints__w',
  'test_point_on_line__simple_assy2',
  'test_point_on_line__assy',
  'test_point_on_line__w',
  'test_PointInPlane_constraint__box_and_vertex',
  // P4 constrain series: tree-mode compound is aggregated post-solve via
  // compoundOp and carries no assembly behavior metadata, so the host CLI's
  // writeAssemblyStep can't resolve members — self-hosted XCAF export walks
  // the baked children instead.
  'test_constrain__simple_assy',
  'test_constrain__nested_assy',
  'test_constrain__subassy1',
  'test_constrain__subassy2',
])
const EXPORT_CAND_STEP = join(HERE, 'export-cand-step.mjs')

// Cases whose only live terminals are 2D (section faces, text glyphs, sibling
// faces, …). Since the host CLI's G0-D 2D-terminal filter (0.30.9+), the
// default export skips them ("All N live terminal(s) are 2D (no solid) —
// nothing to export as a 3D part"), so these mirrors produced no candidate
// STEP and dropped out of grading (33 cases vs the 10-07 baseline; re-verified
// 2026-10-18 under faijs 0.35.8). `--include-2d` (host parseArgs → cliRun
// include2D) writes 2D-only terminals as STEP, restoring the pre-0.30.9
// coverage. Keyed by mirror basename, independent of manifest status (same
// rationale as SELF_HOSTED_EXPORT_CASES). Do NOT enable globally: for cases
// mixing 2D and 3D terminals it would change the exported geometry and
// disturb the currently-graded PASS set.
const INCLUDE2D_CASES = new Set([
  'TestCadQuery__testSection__s1',
  'TestCadQuery__testSection__s2',
  'TestCadQuery__testExtrudeUntilFace__part_section',
  'TestCadQuery__testTextAlignment__centers',
  'TestCadQuery__testTextAlignment__left_bottom',
  'TestCadQuery__testTextAlignment__right_top',
  'TestCadQuery__test_compound_faces_center__compound',
  'TestCadQuery__test_extrude_face__c',
  'TestCadQuery__test_iterators__fs',
  'TestCadQuery__test_loft_face__c',
  'test_constructors__c1',
  'test_constructors__c2',
  'test_history_offset__sides',
  'test_sewing__sh',
  'test_text__r1',
  'test_text__r2',
  'test_text__r3',
  'test_text__r4',
  'test_text__r5',
  'test_text__r7',
  'test_text__r8',
  'TestCQSelectors__testShape__res4',
  // No ref STEP (ungradeable), kept so its export is consistent with the rest:
  'TestCQSelectors__test_single_ent_selector__fs',
  'test_replace__f_top_split',
  'test_siblings__level_1',
  'test_siblings__level_123',
  'test_siblings__level_2',
  'test_siblings__level_3',
  'test_siblings__siblings_1',
  'test_siblings__siblings_12',
  'test_siblings__siblings_2',
  'test_siblings__siblings_cmp_12',
  'test_siblings__siblings_cmp_2',
  'test_siblings__siblings_cmp_edges_12',
  'test_single_ent_selector__fs',
])

// NOTE: do not resolve the faijs package root here. @faicad/faijs publishes a
// strict "exports" map with no "./package.json" subpath, so
// `require.resolve('@faicad/faijs/package.json')` throws ERR_PACKAGE_PATH_NOT_EXPORTED
// and takes the whole runner down before a single case executes (hit after the
// standalone split, when the package started resolving from the registry tarball
// instead of the monorepo workspace). The CLI wrapper lives in this repo, so the
// package root was never needed.

function listCaseFiles(): string[] {
  const testsDir = HERE
  const out: string[] = []
  for (const entry of readdirSync(testsDir)) {
    const p = join(testsDir, entry)
    if (!statSync(p).isDirectory()) continue
    if (entry === 'ref-harness' || entry === 'out') continue
    if (moduleFilter && entry !== moduleFilter) continue
    for (const f of readdirSync(p)) {
      if (f.endsWith('.fai.js')) out.push(join(p, f))
    }
  }
  return out.sort()
}

async function main() {
  const files = listCaseFiles().filter(
    (f) => !onlyFilter || basename(f).includes(onlyFilter!),
  )
  if (files.length === 0) {
    console.log('run-cand: no mirrored case files found (nothing to do)')
    return
  }
  mkdirSync(OUT_CAND, { recursive: true })

  let pass = 0
  let fail = 0
  for (const f of files) {
    const name = basename(f, '.fai.js')
    const outStep = join(OUT_CAND, `${name}.step`)
    const selfHosted = SELF_HOSTED_EXPORT_CASES.has(name)
    try {
      if (selfHosted) {
        // Self-hosted XCAF exporter: bypasses the host CLI's STEP writer, which
        // drops a floating face that is a bare child of a compound. Writes every
        // face via raw occt-wasm XCAF addShape (N2-4). Plain ESM, runs directly
        // under node (same rationale as faijs-cli.mjs — no tsx loader per case).
        execFileSync(process.execPath, [EXPORT_CAND_STEP, f, outStep], {
          cwd: ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf-8',
          timeout: CASE_TIMEOUT_MS,
          env: { ...process.env, FAIJS_DEFAULT_FONT: defaultFontPath },
        })
      } else {
        // tests/faijs-cli.mjs is plain ESM with no TypeScript in it, so it runs
        // directly under node -- no tsx transform/register step. Measured: ~7s per
        // case instead of ~17s (tsx costs another TS-loader + npx resolution per
        // spawned process), i.e. the full suite drops from ~2.6h to ~1.1h. The STEP
        // bytes are not identical between the two paths (the STEP header carries the
        // export temp path and a timestamp), so "are they interchangeable?" is a
        // measurement question, not a byte question -- tests/_probe-cli-equiv.ts
        // grades both against the same ref with compareStepFiles and reports them
        // equal on volume / centroid / bbox / boolean / topology.
        // timeout: the observed healthy case costs ~6s, and a hung kernel call has
        // historically wedged whole overnight sweeps. Without a per-case ceiling a
        // single stuck case freezes the entire run with no output to diagnose from.
        const cliArgs = [CLI, 'run', f, '--out', outStep, '--mode', 'brep']
        if (INCLUDE2D_CASES.has(name)) cliArgs.push('--include-2d')
        execFileSync(
          process.execPath,
          cliArgs,
          {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf-8',
            timeout: CASE_TIMEOUT_MS,
            // Fonts are a HOST responsibility (core only dependency-injects):
            // point the CLI's defaultFontPath at the host-provided font via
            // FAIJS_DEFAULT_FONT (see tests/faijs-cli.mjs).
            env: { ...process.env, FAIJS_DEFAULT_FONT: defaultFontPath },
          },
        )
      }
      pass++
      console.log(`\u2713 ${name}${selfHosted ? ' (self-hosted XCAF)' : ''}`)
    } catch (e) {
      fail++
      const timedOut = e instanceof Error && (e as NodeJS.ErrnoException).code === 'ETIMEDOUT'
      // Remove the partial output: for a timeout the child may be killed with a
      // half-written file, and a stale/absent candidate must not be graded as if
      // the mirror produced something.
      rmSync(outStep, { force: true })
      const msg = e instanceof Error ? e.message.split('\n').slice(-3).join('\n') : String(e)
      console.error(`\u2717 ${name}${timedOut ? ' (TIMEOUT)' : ''}\n${msg}`)
    }
  }
  console.log(`\nrun-cand: ${pass} exported, ${fail} failed -> ${OUT_CAND}`)
  if (fail > 0) process.exitCode = 1
}

main()
