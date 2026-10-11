/**
 * N3 变异测试（承重验证，对齐 §6-2「翻 ported 三条件」之 ③）。
 *
 * 判据：扰动任一约束参数 ⇒ 终态位姿必须偏离原解。变异不翻红 = 断言没钉住约束语义
 * （假绿），镜像/求解通路即不可信。
 *
 * 覆盖 N3 已判等的 5 个用例簇：
 *   - PointOnLine（test_point_on_line：FixedAxis(0,2,1) + PointOnLine 边约束）
 *   - FixedPoint / FixedAxis（test_unary_constraints）
 *   - PointInPlane（test_PointInPlane_constraint：3× PointInPlane 钉到角落 (0.5,1,1.5)）
 *   - 未求解装配的初始位姿链（test_constrain_with_tags / expression_grammar）
 *
 * 隔离说明：solve() 就地烘焙成员几何，每个用例构建全新几何（同 assembly-n3.test.ts）。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { registerOcctBrepEngine, createRuntime } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { asPartName } from '@faicad/faijs/identity'
import type { Shape } from '@faicad/faijs/mesh/types'
import * as cq from '@faicad/faijs-cadquery'
import { buildAssembly, constraintEx } from './assembly/index'

let runtime: ReturnType<typeof createRuntime>

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
}, 120000)

/** 每个用例经 runtime.execute 构建全新几何（backends 由 runtime 认领），避免 solve() 就地烘焙污染。 */
let shapeSeq = 0
async function freshShapes(): Promise<{ b1: Shape; b2: Shape }> {
  const s = shapeSeq++
  const res = await runtime.execute([
    "import * as cq from '@faicad/faijs-cadquery'",
    `let b1 = cq.box(cq.Workplane("XY"), 1, 1, 1)`,
    `let b1s${s} = cq.val(b1)`,
    `let b2 = cq.box(cq.Workplane("XY"), 2, 1, 1)`,
    `let b2s${s} = cq.val(b2)`,
  ].join('\n'))
  expect(res.failedAt).toBeUndefined()
  const b1 = res.outputs.get(asPartName(`b1s${s}`)) as Shape
  const b2 = res.outputs.get(asPartName(`b2s${s}`)) as Shape
  expect(b1).toBeDefined()
  expect(b2).toBeDefined()
  return { b1, b2 }
}

describe('N3 变异测试（扰动约束 ⇒ 位姿偏离）', () => {
  it('PointOnLine：扰动 FixedAxis (0,2,1)→(0,2,2) ⇒ b2 终态 bbox 变化', async () => {
    const run = async (axis: [number, number, number]) => {
      const { b1, b2 } = await freshShapes()
      const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
      const cFA1 = await constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', axis)
      const cFA2 = await constraintEx('b2', '>X', b2, '', '', null, 'FixedAxis', [1, 0, 0])
      const cPOL = await constraintEx('b2', '>X', b2, 'b1', '>>Z and >>Y', b1, 'PointOnLine')
      const asm = buildAssembly('mut', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [
        ...cFixed, ...cFA1, ...cFA2, ...cPOL,
      ])
      asm.solve()
      const comp = asm.toCompound()
      const t2 = asm.nodeTransforms['b2'] ?? asm.transforms.find((t) => t.index === 1)
      return { comp, t2 }
    }
    const base = await run([0, 2, 1])
    const mut = await run([0, 2, 2])
    expect(base.t2).toBeDefined()
    expect(mut.t2).toBeDefined()
    // 变异后 b2 的旋转矩阵必须不同（轴向改变 ⇒ 终态朝向偏离）
    expect(JSON.stringify(mut.t2!.rotationMatrix)).not.toBe(JSON.stringify(base.t2!.rotationMatrix))
  })

  it('FixedPoint：扰动 (0,0,-3)→(0,0,-5) ⇒ b2 中心偏离', async () => {
    const run = async (world: [number, number, number]) => {
      const { b1, b2 } = await freshShapes()
      const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
      const cFP = await constraintEx('b2', '', b2, '', '', null, 'FixedPoint', world)
      const asm = buildAssembly('mut-fp', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cFP])
      asm.solve()
      return asm.nodeTransforms['b2'] ?? asm.transforms.find((t) => t.index === 1)
    }
    const base = await run([0, 0, -3])
    const mut = await run([0, 0, -5])
    expect(base?.translation[2]).toBeCloseTo(-3, 3)
    expect(mut?.translation[2]).toBeCloseTo(-5, 3)
  })

  it('FixedAxis：扰动 (0,1,1)→(1,1,1) ⇒ b2 朝向偏离', async () => {
    const run = async (dir: [number, number, number]) => {
      const { b1, b2 } = await freshShapes()
      const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
      const cFA = await constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', dir)
      const cFP = await constraintEx('b2', '', b2, '', '', null, 'FixedPoint', [0, 0, 0])
      const asm = buildAssembly('mut-fa', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cFA, ...cFP])
      asm.solve()
      return asm.nodeTransforms['b2'] ?? asm.transforms.find((t) => t.index === 1)
    }
    const base = await run([0, 1, 1])
    const mut = await run([1, 1, 1])
    expect(JSON.stringify(mut!.rotationMatrix)).not.toBe(JSON.stringify(base!.rotationMatrix))
  })

  it('PointInPlane：扰动目标面 >X→<X ⇒ 顶点钉到 x=∓0.5 偏离', async () => {
    const run = async (faceSel: string) => {
      const res = await runtime.execute([
        "import * as cq from '@faicad/faijs-cadquery'",
        `let box = cq.box(cq.Workplane("XY"), 1, 2, 3)`,
        `let boxs = cq.val(box)`,
        `let vtx = cq.vertex(0, 0, 0)`,
      ].join('\n'))
      expect(res.failedAt).toBeUndefined()
      const box = res.outputs.get(asPartName('boxs')) as Shape
      const vtx = res.outputs.get(asPartName('vtx')) as Shape
      expect(box).toBeDefined()
      expect(vtx).toBeDefined()
      const cBox = await constraintEx('box', '', box, '', '', null, 'Fixed')
      const cX = await constraintEx('vertex', '', vtx, 'box', faceSel, box, 'PointInPlane')
      const asm = buildAssembly('mut-pip', [{ name: 'box', shape: box }, { name: 'vertex', shape: vtx }], [...cBox, ...cX])
      asm.solve()
      return asm.nodeTransforms['vertex'] ?? asm.transforms.find((t) => t.index === 1)
    }
    const base = await run('>X')
    const mut = await run('<X')
    expect(base?.translation[0]).toBeCloseTo(0.5, 3)
    expect(mut?.translation[0]).toBeCloseTo(-0.5, 3)
  })

  it('Point 约束：扰动目标点 ⇒ b2 平移偏离（test_constrain 语义）', async () => {
    const run = async (target: string) => {
      const { b1, b2 } = await freshShapes()
      const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
      const cPoint = await constraintEx('b2', '', b2, 'b1', target, b1, 'Point')
      const asm = buildAssembly('mut-point', [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cPoint])
      asm.solve()
      return asm.nodeTransforms['b2'] ?? asm.transforms.find((t) => t.index === 1)
    }
    const base = await run('>Z')
    const mut = await run('<Z')
    expect(base?.translation[2]).toBeCloseTo(0.5, 3)
    expect(mut?.translation[2]).toBeCloseTo(-0.5, 3)
  })
})
