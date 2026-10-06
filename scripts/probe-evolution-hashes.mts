/**
 * One-shot probe (P3-1): what do EvolutionData's modified/generated/deleted
 * hashes refer to — input face hashes or result face hashes?
 *
 * Fuse two boxes; hash every face of both inputs AND every face of the result;
 * compare with the EvolutionData arrays.
 * Run: npx tsx scripts/probe-evolution-hashes.mts
 */
import { getKernel } from '@faicad/faijs'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { setupNativeKernel } from '../src/gear-test-harness'

await setupNativeKernel()
const BOUND = 2147483647
const k = getKernel() as never as Record<string, (...a: unknown[]) => any>

const box = (cx: number) => k.makeBoxFromCorners({ x: cx - 0.5, y: -0.5, z: -0.5 }, { x: cx + 0.5, y: 0.5, z: 0.5 })
const facesOf = (h: any) => k.getSubShapes(h, 'face') as any[]

const a = box(0)
const b = box(0.8) // overlapping fuse
const aFaces = facesOf(a)
const bFaces = facesOf(b)
const aHashes = aFaces.map((f: any) => k.hashCode(f, BOUND))
const bHashes = bFaces.map((f: any) => k.hashCode(f, BOUND))
console.log('input a face hashes:', aHashes)
console.log('input b face hashes:', bHashes)

const evo = k.booleanOp(0, [a], [b], { inputFaceHashes: [...aHashes, ...bHashes], hashUpperBound: BOUND })
const result = evo.result
const rFaces = facesOf(result)
const rHashes = rFaces.map((f: any) => k.hashCode(f, BOUND))
console.log('result faces:', rFaces.length, 'hashes:', rHashes)
console.log('evo.modified:', evo.modified)
console.log('evo.generated:', evo.generated)
console.log('evo.deleted:', evo.deleted)
console.log('intersection result∩inputs (by hash):', rHashes.filter((h: number) => [...aHashes, ...bHashes].includes(h)))
