/**
 * faijs-cli.mjs — thin CLI wrapper for standalone repo.
 *
 * In the monorepo, this was `packages/core/src/node-host/cli.ts` cliMain.
 * The published @faicad/faijs tarball does not include the scripts/ dir,
 * so we inline the host wiring here and call cliRun/cliCheck from the
 * compiled dist via @faicad/faijs/node.
 *
 * WHY not cliMain: fonts are a HOST responsibility — core's NodeFontProvider
 * falls back to a bundled-in-dist font path that the published tarball does
 * not contain (`dist/assets/fonts/...` is not shipped). cliMain only forwards
 * `fontsDir`, never `defaultFontPath`, so text cases crash with
 * "[NodeFontProvider] font file not found". This wrapper calls cliRun directly
 * and injects `defaultFontPath` (FAIJS_DEFAULT_FONT env, resolved by run-cand.ts).
 */
import { cliCheck, cliRun, parseArgs } from '@faicad/faijs/node'
import { createApiNamespace } from '@faicad/faijs'

const { command, file, out, mode, assetsDir, fontsDir, projectRoot, includeHidden } = parseArgs(process.argv)

const defaultFontPath = process.env.FAIJS_DEFAULT_FONT

if (!command) {
  process.stderr.write('Usage: node faijs-cli.mjs <check|run> <file.fai.js> [--out <file>]\n')
  process.exit(1)
}
if (!file) {
  process.stderr.write(`Error: missing file argument for "${command}"\n`)
  process.exit(1)
}

const libs = { cad: createApiNamespace() }
const filePath = file
const outPath = out

if (command === 'check') {
  const result = cliCheck(filePath, { assetsDir, fontsDir })
  if (result.ok) {
    process.stdout.write(`OK ${filePath}\n`)
    process.exit(0)
  }
  process.stderr.write(`FAIL ${filePath}: ${result.errors.map((e) => e.message).join('; ')}\n`)
  process.exit(1)
}

if (command === 'run') {
  if (!outPath) {
    process.stderr.write('Error: --out is required for "run" command\n')
    process.exit(1)
  }
  const result = await cliRun(filePath, outPath, {
    mode,
    assetsDir,
    fontsDir,
    projectRoot,
    libs,
    includeHidden,
    defaultFontPath,
  })
  if (result.ok) {
    process.stdout.write(`OK ${filePath} -> ${outPath} (${result.outputFormat})\n`)
    process.exit(0)
  }
  process.stderr.write(`FAIL ${filePath}: ${result.error}\n`)
  process.exit(1)
}

process.stderr.write(`Error: unknown command "${command}"\n`)
process.exit(1)
