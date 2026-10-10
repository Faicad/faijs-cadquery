/**
 * Parity-fix regression tests — selector indexing, pushPoints cut repetition,
 * single-solid union, and cboreHole point propagation.
 *
 * Each test mirrors a bug found by the real-world project ⇄ CadQuery comparison
 * (docs/analysis/2026-09-08-cq-compat-union-compound-bug.md and
 * docs/plans/2026-09-08-cq-compat-cadquery-parity.md §2.3).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { getBrepApi } from '@faicad/faijs/brep/handle-bridge'
import { brepOf } from '@faicad/faijs/shape'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import { asPartName } from '@faicad/faijs/identity'
import type { Shape } from '@faicad/faijs/mesh/types'
import * as cq from './index'

let runtime: ReturnType<typeof createRuntime>

async function runShape(lines: string[]): Promise<Shape> {
  const code = ["import * as cq from '@faicad/faijs-cadquery'", ...lines, 'let result = cq.val(wp_out)'].join('\n')
  const res = await runtime.execute(code)
  expect(res.failedAt).toBeUndefined()
  const shape = res.outputs.get(asPartName('result')) as Shape | undefined
  expect(shape).toBeDefined()
  return shape!
}

function solidCount(shape: Shape): number {
  return (getBrepApi().getSubShapes(brepOf(shape) as BrepHandle, 'solid') as unknown[]).length
}

function volume(shape: Shape): number {
  return getBrepApi().getVolume(brepOf(shape) as BrepHandle)
}

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
  const warm = await runtime.execute('let a = cad.box(1, 1, 1, { centered: true })')
  expect(warm.failedAt).toBeUndefined()
}, 120000)

describe('cq-compat parity fixes', () => {
  it('indexed face selector: >Z lists faces ASCENDING ([0] lowest, [-1] highest) — verified vs cadquery 2.8.0', async () => {
    // Stepped plate: 100×40×10 with a 12×12×3 slot cut from the top face.
    // faces('>Z') lists Z-normal faces ASCENDING by z: bottom(0), slot
    // floor(7), top annulus(10). Verified against the installed cadquery 2.8.0:
    // '>Z[0]' picks the LOWEST face, '>Z[-1]' the HIGHEST.
    const full = 100 * 40 * 10 - 12 * 12 * 3 // 39568
    // '>Z[-1]' → top annulus; the 2mm hole falls inside the slot cavity → removes 0.
    const topProbe = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 100, 40, 10)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.rect(wp3, 12, 12)',
      'let wp5 = cq.cutBlind(wp4, -3)',
      "let wp6 = cq.faces(wp5, '>Z[-1]')",
      'let wp7 = cq.workplane(wp6)',
      'let wp8 = cq.hole(wp7, 6, 2)',
      'let wp_out = wp8',
    ])
    expect(solidCount(topProbe)).toBe(1)
    expect(volume(topProbe)).toBeCloseTo(full, 0)
    // '>Z[0]' → bottom face; the hole cuts INTO the material (CadQuery hole()
    // always cuts opposite the workplane normal), removing π·3²·2.
    const bottomProbe = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 100, 40, 10)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.rect(wp3, 12, 12)',
      'let wp5 = cq.cutBlind(wp4, -3)',
      "let wp6 = cq.faces(wp5, '>Z[0]')",
      'let wp7 = cq.workplane(wp6)',
      'let wp8 = cq.hole(wp7, 6, 2)',
      'let wp_out = wp8',
    ])
    expect(solidCount(bottomProbe)).toBe(1)
    expect(volume(bottomProbe)).toBeCloseTo(full - Math.PI * 9 * 2, 0)
  }, 60000)

  it('cutBlind repeats the profile at every pushPoints location', async () => {
    // Two 10x10 slots, depth 3, in a 60x40x8 plate.
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 60, 40, 8)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.pushPoints(wp3, [[-15, 0], [15, 0]])',
      'let wp5 = cq.rect(wp4, 10, 10)',
      'let wp6 = cq.cutBlind(wp5, -3)',
      'let wp_out = wp6',
    ])
    expect(solidCount(shape)).toBe(1)
    const expected = 60 * 40 * 8 - 2 * (10 * 10 * 3)
    expect(volume(shape)).toBeCloseTo(expected, 0)
  }, 60000)

  it('union of overlapping solids yields ONE solid (not a compound)', async () => {
    // Boss extrude on an existing shape: box + raised pad.
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 110, 120, 8)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.rect(wp3, 20, 10)',
      'let wp5 = cq.extrude(wp4, 5)',
      'let wp_out = wp5',
    ])
    expect(solidCount(shape)).toBe(1)
    expect(volume(shape)).toBeCloseTo(110 * 120 * 8 + 20 * 10 * 5, 0)
  }, 60000)

  it('disjoint-then-touching union stays one solid and keeps exact volume', async () => {
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 30, 30, 10)',
      'let wp2 = cq.box(wp, 15, 15, 10)',
      'let wp3 = cq.translate(wp2, [20, 0, 0])',
      'let wp4 = cq.union(wp1, wp3)',
      'let wp_out = wp4',
    ])
    expect(solidCount(shape)).toBe(1)
    // box1 x -15..15; box2 (15 wide, centered) translated +20 → x 12.5..27.5.
    // Overlap = 2.5 × 15 × 10 = 375.
    const expected = 30 * 30 * 10 + 15 * 15 * 10 - 2.5 * 15 * 10
    expect(volume(shape)).toBeCloseTo(expected, 0)
  }, 60000)

  it('|Z edge selector fillets exactly the vertical edges', async () => {
    // 4 vertical edges of a 30x30x8 plate, r=2:
    // removed volume = 4 · (r² − πr²/4) · h = 4·(4−π)·8 ≈ 27.47
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 30, 30, 8)',
      'let wp2 = cq.edges(wp1, "|Z")',
      'let wp3 = cq.fillet(wp2, 2)',
      'let wp_out = wp3',
    ])
    expect(solidCount(shape)).toBe(1)
    const removed = 30 * 30 * 8 - volume(shape)
    expect(removed).toBeGreaterThan(26)
    expect(removed).toBeLessThan(29)
  }, 60000)

  it('polygon cutBlind cuts a real hexagonal prism (not a cylinder)', async () => {
    // Hexagon inscribed in d=9.24 circle: area = (3√3/2)·R², R=4.62 → 55.44 mm².
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 40, 20, 12)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.polygon(wp3, 6, 9.24)',
      'let wp5 = cq.cutBlind(wp4, -4)',
      'let wp_out = wp5',
    ])
    expect(solidCount(shape)).toBe(1)
    const hexArea = (3 * Math.sqrt(3)) / 2 * 4.62 * 4.62
    const expected = 40 * 20 * 12 - hexArea * 4
    // A cylinder approximation would remove π·4.62²·4 ≈ 268 (vs hex 221.8) —
    // tolerance 2 excludes that failure mode.
    expect(volume(shape)).toBeCloseTo(expected, 1)
  }, 60000)

  it('cutBlind({ dir }) cuts an OBLIQUE (sheared) prism — translation, not rotation', async () => {
    // Upstream `prism(ctx, base, profile, t, dir, additive=False)` builds a
    // `BRepFeat_MakePrism`: the profile is swept as a TRANSLATION prism, so the
    // cross-section is sheared and the removed volume stays πr²·h whatever the
    // tilt. Anchors are the one-shot capture of test_prism res3
    // (box 1×1×1 z∈[0,1], circle r=0.2 on >Z, dir=(0, 0.1, 1)):
    //   vol 0.874336359635, com.y 0.00718622774873.
    // com.y = −(removed vol · removed com.y)/(box − removed) =
    //   −(0.1256637·(−0.05))/0.8743363 = +0.0071862 ✓ — the tool runs from the
    // profile plane straight to the target plane along (0, −0.1, −1).
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp0 = cq.box(wp, 1, 1, 1, { centered: [true, true, false] })',
      "let wp1 = cq.faces(wp0, '>Z')",
      'let wp2 = cq.workplane(wp1)',
      'let wp3 = cq.circle(wp2, 0.2)',
      'let wp_out = cq.cutBlind(wp3, -1.1, { dir: [0, -0.1, -1] })',
    ])
    expect(solidCount(shape)).toBe(1)
    expect(volume(shape)).toBeCloseTo(0.874336359635, 7)
    const com = getBrepApi().getCenterOfMass(brepOf(shape) as BrepHandle) as {
      x: number
      y: number
      z: number
    }
    expect(com.y).toBeCloseTo(0.00718622774873, 6)
    // A rotated cylinder (makeCylinderAt-style) instead of a translation prism
    // would remove πr²·|dir| = π·0.04·1.00499 — 0.5 % MORE volume — and leave
    // com.y at exactly ±0.05. The tolerances above (5e-8 / 5e-7) reject both
    // failure modes by four orders of magnitude; the measured kernel scatter is
    // ~1e-8 in volume, which is why the precision is not tighter.
    expect(Math.abs(com.y)).toBeLessThan(0.01)
  }, 60000)

  it('cutBlind({ dir }) mutation: flipping the tilt sign moves the removed mass', async () => {
    // Negative control for the guard above — same volume, mirrored centroid.
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp0 = cq.box(wp, 1, 1, 1, { centered: [true, true, false] })',
      "let wp1 = cq.faces(wp0, '>Z')",
      'let wp2 = cq.workplane(wp1)',
      'let wp3 = cq.circle(wp2, 0.2)',
      'let wp_out = cq.cutBlind(wp3, -1.1, { dir: [0, 0.1, -1] })',
    ])
    expect(volume(shape)).toBeCloseTo(0.874336359635, 7)
    const com = getBrepApi().getCenterOfMass(brepOf(shape) as BrepHandle) as { y: number }
    expect(com.y).toBeCloseTo(-0.00718622774873, 6)
  }, 60000)

  it('cskHole cuts a conical countersink', async () => {
    // Through hole φ4 + 90° countersink to φ8: cone depth = 4/tan(45°) = 4.
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 60, 40, 8)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.cskHole(wp3, 4, 8, 90)',
      'let wp_out = wp4',
    ])
    expect(solidCount(shape)).toBe(1)
    const through = Math.PI * 2 * 2 * 8
    // Net cone removal beyond the through hole (cone radius ≥ hole radius for
    // z ∈ [0,2], where r_cone(z) = 4(1−z/4)):
    // ∫₀² π(r_cone² − r_hole²) dz = π(12z − 4z² + z³/3)|₀² = π·32/3
    const coneNet = (Math.PI * 32) / 3
    const expected = 60 * 40 * 8 - through - coneNet
    expect(volume(shape)).toBeCloseTo(expected, 0)
  }, 60000)

  it('cboreHole lands the counterbore on every pushed point', async () => {
    const shape = await runShape([
      "let wp = cq.Workplane('XY')",
      'let wp1 = cq.box(wp, 60, 40, 8)',
      "let wp2 = cq.faces(wp1, '>Z')",
      'let wp3 = cq.workplane(wp2)',
      'let wp4 = cq.pushPoints(wp3, [[-15, 0], [15, 0]])',
      'let wp5 = cq.cboreHole(wp4, 4, 7, 2)',
      'let wp_out = wp5',
    ])
    expect(solidCount(shape)).toBe(1)
    // Per point: through-hole π·2²·8 (cyl spans z -4..8, 8 inside the plate)
    // + cbore π·3.5²·2 (spans z 6..8, EXACTLY cboreDepth after the +1 fix)
    // − π·2²·2 already removed by the hole.
    const perPoint = Math.PI * 4 * 8 + Math.PI * 12.25 * 2 - Math.PI * 4 * 2
    const expected = 60 * 40 * 8 - 2 * perPoint
    expect(volume(shape)).toBeCloseTo(expected, -1)
  }, 60000)
})
