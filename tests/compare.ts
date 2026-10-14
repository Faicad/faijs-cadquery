/**
 * compare.ts — batch STEP equivalence comparison (ref vs cand).
 *
 * Pairs `out/ref/<case>.step` with `out/cand/<case>.step` by identical file
 * name, runs `compareStepFiles` on each pair, and writes:
 *
 *   out/report.json — machine-readable: per-case metrics + counters + parity
 *   out/report.md   — human-readable summary
 *
 * Judgment (docs/plans/2026-09-08-cq-compat-cadquery-parity.md §7.2):
 *   PASS    — volume/centroid/bbox within tolerance and boolean diff small
 *   PASS-NT — numeric metrics pass but topology differs (recorded, not gated)
 *   FAIL    — any numeric metric out of tolerance
 * Cases present in ref but with no candidate STEP count as BLOCKED (they are
 * listed from ref/manifest.json so the parity denominator stays honest).
 *
 * Usage: npx tsx packages/faijs-cadquery/tests/compare.ts [--only <substring>]
 *
 * `--only` filters the ref STEP files by name so a freshly written mirror can
 * be graded without re-running the whole ~700-case suite. It does NOT change
 * the reported parity denominator (still every ref case), so the per-run
 * counters stay honest — read the per-case statuses, not the parity line.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareStepFiles, type StepCompareResult } from '@faicad/cq-compat-compare'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')
const OUT = join(PKG, 'out')
const REF = join(OUT, 'ref')
const CAND = join(OUT, 'cand')

interface CaseVerdict {
  status: 'PASS' | 'PASS-NT' | 'FAIL' | 'ERROR'
  volumeDiffPct?: number
  centroidDiff?: number
  bboxDiff?: number
  booleanDiff?: [number, number]
  topology?: string
  error?: string
}

function mainRefCases(): Map<string, string> {
  // ref manifest.json maps case_id -> entries; flatten to step file basenames
  const mpath = join(REF, 'manifest.json')
  const map = new Map<string, string>()
  if (!existsSync(mpath)) return map
  const manifest = JSON.parse(readFileSync(mpath, 'utf-8')) as Record<
    string,
    Array<{ var: string; file?: string; error?: string }>
  >
  for (const [caseId, entries] of Object.entries(manifest)) {
    for (const e of entries) {
      if (e.file) {
        const base = basename(e.file).replace(/\.step$/, '')
        map.set(base, caseId)
      }
    }
  }
  return map
}

/** P7/D4: pose-mode annotations from the parity manifest, keyed by cand base name. */
interface PoseAnnotation {
  poseMode: string
  poseFreeAxis?: number[]
  poseFreePivot?: number[]
  poseMemberPivots?: Array<number[] | null>
  poseRigidGroups?: number[][]
}

function poseAnnotations(): Map<string, PoseAnnotation> {
  const mpath = join(HERE, 'manifest.json')
  const map = new Map<string, PoseAnnotation>()
  if (!existsSync(mpath)) return map
  const manifest = JSON.parse(readFileSync(mpath, 'utf-8')) as Record<
    string,
    { status?: string; poseMode?: string; poseFreeAxis?: number[]; poseFreeTranslation?: number[]; poseFreePivot?: number[]; poseMemberPivots?: Array<number[] | null>; poseRigidGroups?: number[][] }
  >
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.poseMode !== 'canonical-pose') continue
    // manifest key = "tests.<module>:::<test>__<var>" — the cand STEP base name
    // is everything after the ":::" separator.
    const idx = key.indexOf(':::')
    if (idx < 0) continue
    map.set(key.slice(idx + 3), {
      poseMode: entry.poseMode,
      poseFreeAxis: entry.poseFreeAxis,
      poseFreeTranslation: entry.poseFreeTranslation,
      poseFreePivot: entry.poseFreePivot,
      poseMemberPivots: entry.poseMemberPivots,
      poseRigidGroups: entry.poseRigidGroups,
    })
  }
  return map
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] ?? '') : ''
  const refFiles = (existsSync(REF) ? readdirSync(REF).filter((f) => f.endsWith('.step')) : []).filter(
    (f) => !only || f.toLowerCase().includes(only.toLowerCase()),
  )
  const candFiles = existsSync(CAND)
    ? readdirSync(CAND).filter((f) => f.endsWith('.step'))
    : []
  const candSet = new Set(candFiles)

  // ref STEP names carry the module prefix ("tests.<module>__<Class>__<test>__<var>.step")
  // while candidate files live in tests/<module>/<Class>__<test>__<var>.fai.js →
  // "<Class>__<test>__<var>.step". Build ref→cand base-name mapping via ref manifest.
  const caseIdByRefBase = mainRefCases()
  const candBaseByRef = new Map<string, string>()
  for (const rf of refFiles) {
    const refBase = rf.replace(/\.step$/, '')
    const caseId = caseIdByRefBase.get(refBase)
    if (!caseId) continue
    const module = caseId.split('::')[0].replace(/^tests\./, '')
    // Module-level pytest functions have an empty class slot, so the ref name is
    // "tests.<module>___<test>__<var>" (three underscores) instead of
    // "tests.<module>__<Class>__<test>__<var>"; drop the extra leading '_' so
    // both layouts resolve to the mirror file name "<test>__<var>".
    candBaseByRef.set(
      refBase,
      refBase.replace(new RegExp(`^tests\\.${module}__`), '').replace(/^_+/, ''),
    )
  }

  const report: Record<string, CaseVerdict> = {}
  let pass = 0
  let passNt = 0
  let fail = 0
  let error = 0

  const poseByBase = poseAnnotations()

  for (const rf of refFiles) {
    const caseName = rf.replace(/\.step$/, '')
    const candBase = candBaseByRef.get(caseName)
    if (!candBase) continue // not a paired case (defensive; manifest-driven below)
    const cf = `${candBase}.step`
    if (!candSet.has(cf)) continue // counted as BLOCKED below
    const refStep = join(REF, rf)
    const candStep = join(CAND, cf)
    // P7/D4: route underdetermined cases (manifest poseMode annotation backed by
    // the solver DOF diagnostic) to the canonical-pose channel. An old
    // cq-compat-compare without the option would silently ignore it and fall
    // back to bitwise — detect via the audit field and fail loudly instead.
    const pose = poseByBase.get(candBase)
    const poseOpts: Record<string, unknown> = {}
    if (pose) {
      if (pose.poseFreeTranslation) {
        // P8: sliding DOF — translate-scan mode; no twist axis required.
        if (pose.poseFreeTranslation.length !== 3) {
          throw new Error(`[compare] ${candBase}: poseFreeTranslation must be a 3-component direction`)
        }
        poseOpts.poseMode = 'canonical-pose'
        poseOpts.canonicalFreeTranslation = { x: pose.poseFreeTranslation[0], y: pose.poseFreeTranslation[1], z: pose.poseFreeTranslation[2] }
      } else {
        if (!pose.poseFreeAxis || pose.poseFreeAxis.length !== 3) {
          throw new Error(`[compare] ${candBase}: poseMode 'canonical-pose' requires a 3-component poseFreeAxis (or poseFreeTranslation) in tests/manifest.json`)
        }
        poseOpts.poseMode = 'canonical-pose'
        poseOpts.canonicalFreeAxis = { x: pose.poseFreeAxis[0], y: pose.poseFreeAxis[1], z: pose.poseFreeAxis[2] }
      }
      if (pose.poseFreePivot) {
        if (pose.poseFreePivot.length !== 3) {
          throw new Error(`[compare] ${candBase}: poseFreePivot must be a 3-component point on the free twist axis`)
        }
        poseOpts.canonicalPivot = { x: pose.poseFreePivot[0], y: pose.poseFreePivot[1], z: pose.poseFreePivot[2] }
      }
      if (pose.poseMemberPivots) {
        // Per-solid pivots (null = fall back to that solid's COM).
        poseOpts.canonicalMemberPivots = pose.poseMemberPivots.map((p) =>
          p ? { x: p[0], y: p[1], z: p[2] } : null,
        )
      }
      if (pose.poseRigidGroups) {
        poseOpts.canonicalRigidGroups = pose.poseRigidGroups
      }
    }
    try {
      const r: StepCompareResult = await compareStepFiles(
        refStep,
        candStep,
        { strictTopology: false, linearTolerance: 1e-3, volumeRelativeTolerance: 1e-3, ...poseOpts },
      )
      if (pose && r.canonicalPose === undefined) {
        throw new Error(
          `[compare] ${candBase}: manifest routes this case to poseMode 'canonical-pose', ` +
            'but the installed @faicad/cq-compat-compare returned no canonicalPose audit field — ' +
            'the comparator predates P7/D3 and silently fell back to bitwise. Upgrade the comparator.',
        )
      }
      const numericOk =
        r.volume.diffPct <= 0.1 && r.centerOfMass.maxDiff <= 1e-3 && r.bbox.maxDiff <= 1e-3
      const boolOk =
        r.booleanDiff.aMinusB.volume <= 0.1 && r.booleanDiff.bMinusA.volume <= 0.1
      const topoMatch =
        r.topology.a.faces === r.topology.b.faces &&
        r.topology.a.edges === r.topology.b.edges &&
        r.topology.a.vertices === r.topology.b.vertices
      const status: CaseVerdict['status'] = !numericOk
        ? 'FAIL'
        : !boolOk
          ? 'FAIL'
          : topoMatch
            ? 'PASS'
            : 'PASS-NT'
      if (status === 'PASS') pass++
      else if (status === 'PASS-NT') passNt++
      else fail++
      report[caseName] = {
        status,
        volumeDiffPct: r.volume.diffPct,
        centroidDiff: r.centerOfMass.maxDiff,
        bboxDiff: r.bbox.maxDiff,
        booleanDiff: [r.booleanDiff.aMinusB.volume, r.booleanDiff.bMinusA.volume],
        topology: `ref f${r.topology.a.faces}/e${r.topology.a.edges}/v${r.topology.a.vertices} vs cand f${r.topology.b.faces}/e${r.topology.b.edges}/v${r.topology.b.vertices}`,
      }
    } catch (e) {
      error++
      report[caseName] = {
        status: 'ERROR',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  const refCaseCount = mainRefCases().size
  const compared = pass + passNt + fail
  const blocked = refCaseCount - compared
  const parity = refCaseCount > 0 ? (pass + passNt) / refCaseCount : 0

  const jsonOut = {
    counts: { pass, passNt, fail, error, blocked, refCases: refCaseCount, refSteps: refFiles.length },
    parity: Number(parity.toFixed(4)),
    cases: report,
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(jsonOut, null, 2))

  const lines: string[] = [
    '# cq-compat ⇄ CadQuery parity report',
    '',
    `| metric | value |`,
    `|---|---|`,
    `| ref cases | ${refCaseCount} |`,
    `| ref STEP files | ${refFiles.length} |`,
    `| cand STEP files | ${candFiles.length} |`,
    `| PASS | ${pass} |`,
    `| PASS-NT | ${passNt} |`,
    `| FAIL | ${fail} |`,
    `| ERROR | ${error} |`,
    `| BLOCKED (no candidate) | ${blocked} |`,
    `| parity | ${(parity * 100).toFixed(2)}% |`,
    '',
  ]
  const fails = Object.entries(report).filter(([, v]) => v.status !== 'PASS')
  if (fails.length > 0) {
    lines.push('| case | status | vol Δ% | centroid Δ | bbox Δ | boolean Δ |')
    lines.push('|---|---|---|---|---|---|')
    for (const [name, v] of fails.slice(0, 100)) {
      lines.push(
        `| ${name} | ${v.status} | ${v.volumeDiffPct?.toExponential(2) ?? '-'} | ${
          v.centroidDiff?.toExponential(2) ?? '-'
        } | ${v.bboxDiff?.toExponential(2) ?? '-'} | ${v.booleanDiff?.map((x) => x.toFixed(3)).join(' / ') ?? '-'} |`,
      )
    }
  }
  writeFileSync(join(OUT, 'report.md'), lines.join('\n'))

  console.log(
    `compare: PASS=${pass} PASS-NT=${passNt} FAIL=${fail} ERROR=${error} BLOCKED=${blocked} parity=${(parity * 100).toFixed(2)}%`,
  )
  console.log(`report -> ${join(OUT, 'report.md')}`)
}

main()
