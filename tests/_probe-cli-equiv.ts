/**
 * _probe-cli-equiv.ts — verify that running the faijs CLI with plain `node`
 * produces geometry equivalent to the documented `npx tsx` path.
 *
 * Background: `tests/run-cand.ts` invoked every case through `npx tsx
 * tests/faijs-cli.mjs`, which costs ~17s/case (~2.6h for the full suite). The
 * wrapper is plain .mjs with no TS in it, so `node` can run it directly at
 * ~7s/case. Before switching the runner, this probe proves the two paths agree
 * on every metric the comparer uses (volume / center-of-mass / bbox / boolean /
 * topology), because the STEP bytes are NOT identical: the STEP header embeds
 * the export temp path and a timestamp.
 *
 * Usage: npx tsx tests/_probe-cli-equiv.ts
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, basename, join } from 'node:path'
import { compareStepFiles } from '@faicad/cq-compat-compare'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const TMP = join(ROOT, 'out', '_probe-cli-equiv')
const IS_WIN = process.platform === 'win32'

const SAMPLES = [
  'tests/test_cadquery/TestCadQuery__testAngledHoles__s.fai.js',
  'tests/test_cadquery/TestCadQuery__testBoxCombine__s.fai.js',
  'tests/test_cadquery/TestCadQuery__testTwistedLoft__s.fai.js',
  'tests/test_free_functions/test_box__s.fai.js',
  'tests/test_shapes/test_addCavity__b1.fai.js',
]

async function grade(ref: string, cand: string) {
  const r = await compareStepFiles(ref, cand, {
    strictTopology: false,
    linearTolerance: 1e-3,
    volumeRelativeTolerance: 1e-3,
  })
  return {
    vol: r.volume.diffPct,
    com: r.centerOfMass.maxDiff,
    bbox: r.bbox.maxDiff,
    bmA: r.booleanDiff.aMinusB.volume,
    amb: r.booleanDiff.bMinusA.volume,
    topo: `${r.topology.a.faces}/${r.topology.a.edges}/${r.topology.a.vertices} vs ${r.topology.b.faces}/${r.topology.b.edges}/${r.topology.b.vertices}`,
  }
}

async function main() {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })

  // pick ref files by mirror stem
  const refDir = join(ROOT, 'out', 'ref')
  const refFiles = readdirSync(refDir).filter((f) => f.endsWith('.step'))

  let ok = 0
  let mismatched = 0
  for (const src of SAMPLES) {
    const full = join(ROOT, src)
    if (!existsSync(full)) {
      console.log(`SKIP (missing mirror) ${src}`)
      continue
    }
    const stem = basename(full, '.fai.js')
    const tsxOut = join(TMP, `${stem}.tsx.step`)
    const nodeOut = join(TMP, `${stem}.node.step`)

    execFileSync('npx', ['tsx', 'tests/faijs-cli.mjs', 'run', full, '--out', tsxOut, '--mode', 'brep'], {
      cwd: ROOT,
      stdio: 'ignore',
      shell: IS_WIN,
    })
    execFileSync(process.execPath, [join('tests', 'faijs-cli.mjs'), 'run', full, '--out', nodeOut, '--mode', 'brep'], {
      cwd: ROOT,
      stdio: 'ignore',
    })

    const refFile = refFiles.find((f) => f.endsWith(`${stem}.step`))
    if (!refFile) {
      console.log(`SKIP (no ref pair) ${stem}`)
      continue
    }
    const refPath = join(refDir, refFile)
    const a = await grade(refPath, tsxOut)
    const b = await grade(refPath, nodeOut)
    const same =
      a.vol === b.vol && a.com === b.com && a.bbox === b.bbox && a.bmA === b.bmA && a.amb === b.amb && a.topo === b.topo
    same ? ok++ : mismatched++
    console.log(`${same ? 'SAME' : 'DIFF'} ${stem}`)
    if (!same) {
      console.log(`   tsx : ${JSON.stringify(a)}`)
      console.log(`   node: ${JSON.stringify(b)}`)
    }
  }
  console.log(`\nprobe: ${ok} equivalent, ${mismatched} differing`)
  if (mismatched > 0) process.exitCode = 1
}

main()
