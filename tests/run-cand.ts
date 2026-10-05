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

import { readdirSync, mkdirSync, statSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..') // repo root
const OUT_CAND = join(ROOT, 'out', 'cand')

// Windows spawnSync cannot resolve the extension-less `npx` shim — route through
// the shell there (same command line, just resolved via cmd/bash).
const IS_WIN = process.platform === 'win32'

const args = process.argv.slice(2)
function argValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const moduleFilter = argValue('--module')
const onlyFilter = argValue('--only')

// Resolve faijs CLI from installed @faicad/faijs (registry dependency).
// The CLI entry is not exported as a bin, so we locate the source via the
// package root and run it with tsx — same approach as the monorepo.
const require = createRequire(import.meta.url)
const faijsPkgPath = require.resolve('@faicad/faijs/package.json')
const faijsRoot = dirname(faijsPkgPath)
// faijs-cli.ts is in the package scripts/ dir; it is not in the published tarball,
// so we fall back to a thin inline wrapper that calls cliMain from the dist.
const CLI = join(HERE, 'faijs-cli.mjs')

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
      execFileSync(
        'npx',
        ['tsx', CLI, 'run', f, '--out', outStep, '--mode', 'brep'],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', shell: IS_WIN },
      )
      pass++
      console.log(`\u2713 ${name}`)
    } catch (e) {
      fail++
      const msg = e instanceof Error ? e.message.split('\n').slice(-3).join('\n') : String(e)
      console.error(`\u2717 ${name}\n${msg}`)
    }
  }
  console.log(`\nrun-cand: ${pass} exported, ${fail} failed -> ${OUT_CAND}`)
  if (fail > 0) process.exitCode = 1
}

main()
