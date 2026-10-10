/**
 * P5-2 — Assembly.save() 装配结构往返（审计 §3.5 E3b 闭环）。
 *
 * 把 `importStep` 读回的装配（E3b 真值夹具 cq-assembly-two-parts.step：
 * top_level / cube_1 绿 / cyl_1 蓝 @ (0,0,-10)）经 `save()` 导出 STEP，再
 * `importStep` 读回，断言装配名 + 成员名 + 颜色 + 烘焙位姿（volume + bbox）
 * 全部 round-trip —— 证明 save() 现在写的是真正的 XCAF 装配结构（component
 * 引用带 name/color），而非早先拍平 solids 的 L1 导出（那种会让 importStep
 * 判为非装配，即 E3b 记的缺口）。
 *
 * 真值冻结自一次性 CadQuery 2.8.0 捕获（见 assembly-import-step.test.ts）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { OcctKernel, ShapeHandle } from 'occt-wasm'
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { brepOf } from '@faicad/faijs/shape'
import type { Shape } from '@faicad/faijs/mesh/types'
import type { CqAssembly } from './assembly'
import { setupNativeKernel } from './gear-test-harness'
import { importStep, save } from './assembly/save'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): string =>
  resolve(here, '../fixtures/data/step-metadata', name)

beforeAll(async () => {
  await setupNativeKernel()
})

function k(): OcctKernel {
  return getKernel() as unknown as OcctKernel
}

/** BREP metrics of a member's shape (volume + axis-aligned bounds). */
/** metrics 只吃 Shape 叶子；装配成员类型面是 Shape | CqAssembly（嵌套），此处断言为叶子。 */
function metrics(s: Shape | CqAssembly): { volume: number; bbox: number[] } {
  if (typeof s !== 'object' || s === null || 'members' in s) {
    throw new Error('metrics(): expected a Shape leaf member, got a nested CqAssembly')
  }
  const kernel = k()
  const h = brepOf(s) as unknown as ShapeHandle
  const bb = kernel.getBoundingBox(h)
  return {
    volume: kernel.getVolume(h),
    bbox: [bb.xmin, bb.ymin, bb.zmin, bb.xmax, bb.ymax, bb.zmax],
  }
}

/** importStep → save → importStep 往返，落盘到临时 STEP（os.tmpdir 豁免 safe-delete）。 */
async function roundTrip(name: string): Promise<CqAssembly> {
  const src = await importStep(fixture(name))
  const out = join(
    tmpdir(),
    `p5-2-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.step`,
  )
  await save(src, out)
  return importStep(out)
}

describe('save → importStep: assembly structure round trip (P5-2)', () => {
  it('preserves assembly name and member names/colours', async () => {
    const back = await roundTrip('cq-assembly-two-parts.step')
    expect(back.name).toBe('top_level')
    expect(back.members.map((m) => m.name)).toEqual(['cube_1', 'cyl_1'])
    // green / blue (DRAUGHTING_PRE_DEFINED_COLOUR in the upstream file).
    expect(back.members[0].color).toEqual([0, 1, 0])
    expect(back.members[1].color).toEqual([0, 0, 1])
  })

  it('preserves baked placements (volume + bbox survive the round trip)', async () => {
    const back = await roundTrip('cq-assembly-two-parts.step')
    const cube = metrics(back.members[0].shape)
    expect(cube.volume).toBeCloseTo(1000, 7)
    expect(cube.bbox.map((v) => +v.toFixed(6))).toEqual([-5, -5, -5, 5, 5, 5])
    // cyl_1 carries Location((0,0,-10)); the placement must survive save→import.
    const cyl = metrics(back.members[1].shape)
    expect(cyl.volume).toBeCloseTo(196.3495408, 6)
    expect(cyl.bbox.map((v) => +v.toFixed(6))).toEqual([-2.5, -2.5, -15, 2.5, 2.5, -5])
  })
})
