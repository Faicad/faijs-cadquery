/**
 * faijs-cli.mjs — thin CLI wrapper for standalone repo.
 *
 * In the monorepo, this was `packages/core/scripts/faijs-cli.ts`.
 * The published @faicad/faijs tarball does not include the scripts/ dir,
 * so we inline the same 2-line wrapper here and call cliMain from the
 * compiled dist via @faicad/faijs/node.
 */
import { cliMain } from '@faicad/faijs/node'
import { createApiNamespace } from '@faicad/faijs'

const code = await cliMain(process.argv, { cad: createApiNamespace() })
process.exit(code)
