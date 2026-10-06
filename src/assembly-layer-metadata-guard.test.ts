/**
 * P5-3 freeze guard — layer metadata is structurally unreadable in occt-wasm 5.6.
 *
 * Root cause (X-3): `XCAFDoc_LayerTool` has NO binding in occt-wasm 5.6, so there is
 * no API to read layer metadata off XCAF labels. This is a STRUCTURAL gap — unlike
 * P5-1 (subshape name/color, where the reader exists but maps nothing on STEP
 * round-trip), here the layer read channel does not exist at all.
 *
 * This guard freezes that absence: it MUST turn RED the moment occt-wasm exposes a
 * layer read channel (e.g. an `XCAFDoc_LayerTool` accessor or a `getLayers`-style
 * method on `XCAFDocument`), forcing a re-evaluation instead of silently treating
 * `op:assembly-subshape-import` as unblocked.
 *
 * See docs/plans/2026-10-05-cadquery-post-occt56-plan.md §3.1 P5-1 / §3.5 X-3 / §4 P5-3.
 */
import { describe, it, expect } from 'vitest'
import { initOcctWasm } from '@faicad/faijs/occt-kernel/occtKernel'

describe('P5-3 layer metadata gap (freeze guard)', () => {
  it('occt-wasm 5.6 exposes no XCAF layer read API', async () => {
    const rawKernel = (await initOcctWasm()) as unknown as Record<string, unknown>
    // No LayerTool accessor on the kernel (X-3).
    expect(rawKernel.XCAFDoc_LayerTool).toBeUndefined()

    const doc = (rawKernel.createXCAFDocument as () => { close(): void })()
    try {
      const proto = Object.getPrototypeOf(doc)
      const methods = Object.getOwnPropertyNames(proto) as string[]
      const layerMethod = methods.find((m) => /layer/i.test(m))
      expect(layerMethod).toBeUndefined()
    } finally {
      doc.close()
    }
  })
})
