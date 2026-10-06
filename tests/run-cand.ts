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

import { readdirSync, mkdirSync, statSync, rmSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..') // repo root
const OUT_CAND = join(ROOT, 'out', 'cand')

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
    try {
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
      execFileSync(
        process.execPath,
        [CLI, 'run', f, '--out', outStep, '--mode', 'brep'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', timeout: CASE_TIMEOUT_MS },
      )
      pass++
      console.log(`\u2713 ${name}`)
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
