/**
 * @faicad/cq-compat-assembly N3 验证（对齐 N3 cq-compat 集成计划 §P1/P2/P3）。
 *
 * 验证 assembly.ts 新增的 5 类 CQ 2.8.0 约束种类**透传 + global 求解器端到端**可用，
 * 位姿断言对齐 c:\git\CADQ\cadquery\tests\test_assembly.py 的 CQ 参考基线：
 *   - FixedPoint  → B2 中心钉到世界字面坐标（test_unary_constraints 断言 b2 z == -3）
 *   - FixedAxis   → B2 面法向对齐世界方向（test_unary_constraints FixedAxis (0,1,1)）
 *   - PointInPlane→ 点落到 B1 某面所在平面（test_PointInPlane_constraint 断言顶点在 >X 面 x=0.5 → 本测试 x=5）
 *   - PointOnLine → 点落到 B1 某条棱线（test_point_on_line 断言 b2 中心落到棱线）
 *
 * core 0.31.2 求解器已原生支持这些语义（global-solver.js：fixedPoint/fixedAxis/
 * fixedRotation unary 分支 + pushCoincident 把 coincident(point,plane)→point_in_plane、
 * coincident(point,axis)→point_on_line），故 N3 仅需 cq-compat DSL 透传 + 几何解析。
 *
 * 不依赖 Python/OCP：纯 Node + occt-wasm 内核，断言用 CQ 基线的位姿不变量。
 *
 * 隔离说明：asm.solve() 会就地烘焙成员几何（产品设计），故每个用例各自构建全新几何，
 * 避免前一个用例的 solve 把共享 shape 的 BREP 槽位移/旋转后污染后续用例的参考点解析。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createRuntime, registerOcctBrepEngine } from '@faicad/faijs'
import { createNodePorts } from '@faicad/faijs/node'
import { asPartName } from '@faicad/faijs/identity'
import type { Shape } from '@faicad/faijs/mesh/types'
import type { AssemblyConstraint } from '@faicad/faijs/api/assembly/types'
import type { AssemblyTransform } from '@faicad/faijs/runtime-state'
import * as cq from '@faicad/faijs-cadquery'
import { buildAssembly, constraintEx } from './assembly/index'

let runtime: ReturnType<typeof createRuntime>

beforeAll(async () => {
  await registerOcctBrepEngine()
  runtime = createRuntime(createNodePorts(), 'brep')
  runtime.registerLib('cq', cq as never, { packageName: '@faicad/faijs-cadquery' } as never)
}, 120000)

/** 每个用例构建全新几何（10×10×10 居中原点 + 2×2×2 居中原点），避免 solve() 就地烘焙污染。 */
let shapeSeq = 0
async function freshShapes(): Promise<{ boxBig: Shape; boxSmall: Shape }> {
  const s = shapeSeq++
  const res = await runtime.execute([
    "import * as cq from '@faicad/faijs-cadquery'",
    `let b1 = cq.box(cq.Workplane("XY"), 10, 10, 10)`,
    `let boxBig${s} = cq.val(b1)`,
    `let b2 = cq.box(cq.Workplane("XY"), 2, 2, 2)`,
    `let boxSmall${s} = cq.val(b2)`,
  ].join('\n'))
  expect(res.failedAt).toBeUndefined()
  const boxBig = res.outputs.get(asPartName(`boxBig${s}`)) as Shape
  const boxSmall = res.outputs.get(asPartName(`boxSmall${s}`)) as Shape
  expect(boxBig).toBeDefined()
  expect(boxSmall).toBeDefined()
  return { boxBig, boxSmall }
}

/** 把局部点 p 经部件变换 t 映射到世界（对齐 e2e 的 applyAt）。 */
function applyAt(t: AssemblyTransform, p: [number, number, number]): [number, number, number] {
  const m = t.rotationMatrix
  const d: [number, number, number] = [p[0] - t.pivot[0], p[1] - t.pivot[1], p[2] - t.pivot[2]]
  const r: [number, number, number] = [
    m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
    m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
    m[6] * d[0] + m[7] * d[1] + m[8] * d[2],
  ]
  return [r[0] + t.pivot[0] + t.translation[0], r[1] + t.pivot[1] + t.translation[1], r[2] + t.pivot[2] + t.translation[2]]
}

/** 把向量 v 经旋转矩阵 m（行主序 9 元）旋转。 */
function rotVec(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

describe('N3 结构映射（constraintEx，无求解）', () => {
  it('FixedRotation → { type: "fixedRotation", part }（无几何，纯透传）', async () => {
    const out = await constraintEx('B2', '', null, '', '', null, 'FixedRotation')
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ type: 'fixedRotation', part: 'B2' })
  })

  it('FixedPoint → { type: "fixedPoint", a: 点引用, world }（a 解析为 B2 中心）', async () => {
    const { boxSmall } = await freshShapes()
    const out = await constraintEx('B2', '', boxSmall, '', '', null, 'FixedPoint', [0, 0, -3])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('fixedPoint')
    const fp = out[0] as Extract<AssemblyConstraint, { type: 'fixedPoint' }>
    expect(fp.world).toEqual([0, 0, -3])
    expect('point' in fp.a).toBe(true)
  })

  it('FixedAxis → { type: "fixedAxis", a: 面引用, worldDir }（a 解析为 B2 >Z 面法向）', async () => {
    const { boxSmall } = await freshShapes()
    const out = await constraintEx('B2', '>Z', boxSmall, '', '', null, 'FixedAxis', [0, 1, 1])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('fixedAxis')
    const fa = out[0] as Extract<AssemblyConstraint, { type: 'fixedAxis' }>
    expect(fa.worldDir).toEqual([0, 1, 1])
    expect('face' in fa.a).toBe(true)
  })

  it('PointInPlane → coincident(点, 面)（a=B2 中心，b=B1 >X 面）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const out = await constraintEx('B2', '', boxSmall, 'B1', '>X', boxBig, 'PointInPlane')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('coincident')
    const coin = out[0] as Extract<AssemblyConstraint, { type: 'coincident' }>
    expect('point' in coin.a).toBe(true)
    expect('face' in coin.b).toBe(true)
  })

  it('PointOnLine → coincident(点, 边轴)（a=B2 中心，b=B1 |Z 棱线）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const out = await constraintEx('B2', '', boxSmall, 'B1', '|Z', boxBig, 'PointOnLine')
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('coincident')
    const coin = out[0] as Extract<AssemblyConstraint, { type: 'coincident' }>
    expect('point' in coin.a).toBe(true)
    expect('edge' in coin.b).toBe(true)
  })
})

describe('N3 端到端求解（global 求解器，对齐 CQ 参考基线位姿）', () => {
  it('FixedPoint：B2 中心被钉到世界 (0,0,-3)（对齐 test_unary_constraints）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const fp = await constraintEx('B2', '', boxSmall, '', '', null, 'FixedPoint', [0, 0, -3])
    const asm = buildAssembly('n3-fp', [
      { name: 'B1', shape: boxBig },
      { name: 'B2', shape: boxSmall },
    ], [
      { type: 'fixed', part: 'B1' } as AssemblyConstraint,
      ...fp,
    ])
    asm.solve()
    expect(asm.residuals).toBeDefined()
    const tB = asm.transforms.find((t) => t.index === 1)
    expect(tB).toBeDefined()
    // B2 中心局部 (0,0,0) 被钉到世界 (0,0,-3) → 世界中心 == (0,0,-3)
    const worldB = applyAt(tB!, [0, 0, 0])
    for (let i = 0; i < 3; i++) expect(worldB[i]).toBeCloseTo([0, 0, -3][i], 3)
  })

  it('FixedAxis：B2 +Z 法向对齐世界 (0,1,1)（FixedPoint 锁平移，对齐 test_unary_constraints）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const fa = await constraintEx('B2', '>Z', boxSmall, '', '', null, 'FixedAxis', [0, 1, 1])
    const fp = await constraintEx('B2', '', boxSmall, '', '', null, 'FixedPoint', [0, 0, 0])
    const asm = buildAssembly('n3-fa', [
      { name: 'B1', shape: boxBig },
      { name: 'B2', shape: boxSmall },
    ], [
      { type: 'fixed', part: 'B1' } as AssemblyConstraint,
      ...fa,
      ...fp,
    ])
    asm.solve()
    expect(asm.residuals).toBeDefined()
    const tB = asm.transforms.find((t) => t.index === 1)
    expect(tB).toBeDefined()
    // 平移被 FixedPoint(0,0,0) 锁住（中心初始即原点）
    const worldB = applyAt(tB!, [0, 0, 0])
    for (let i = 0; i < 3; i++) expect(worldB[i]).toBeCloseTo(0, 3)
    // +Z 法向经旋转 → 归一化 (0,1,1)
    const n = rotVec(tB!.rotationMatrix, [0, 0, 1])
    const inv = 1 / Math.sqrt(2)
    for (let i = 0; i < 3; i++) expect(n[i]).toBeCloseTo([0, inv, inv][i], 2)
  })

  it('PointInPlane：B2 中心落到 B1 >X 面所在平面 x=5（对齐 test_PointInPlane_constraint）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const cons = await constraintEx('B2', '', boxSmall, 'B1', '>X', boxBig, 'PointInPlane')
    const asm = buildAssembly('n3-pip', [
      { name: 'B1', shape: boxBig },
      { name: 'B2', shape: boxSmall },
    ], [
      { type: 'fixed', part: 'B1' } as AssemblyConstraint,
      ...cons,
    ])
    asm.solve()
    expect(asm.residuals).toBeDefined()
    const tB = asm.transforms.find((t) => t.index === 1)
    expect(tB).toBeDefined()
    const worldB = applyAt(tB!, [0, 0, 0])
    // B1 >X 面在 x=5；point_in_plane 把 B2 中心驱动到该平面（y/z 自由，x 必≈5）
    expect(Math.abs(worldB[0] - 5)).toBeLessThan(0.1)
  })

  it('PointOnLine：B2 中心落到 B1 的 |Z 棱线（点到线垂距≈0，对齐 test_point_on_line）', async () => {
    const { boxBig, boxSmall } = await freshShapes()
    const cons = await constraintEx('B2', '', boxSmall, 'B1', '|Z', boxBig, 'PointOnLine')
    // 解析出的线必须是 B1 的 Z 平行棱（方向≈(0,0,1)，且过角点 |x|=|y|=5）
    const axis = ((cons[0] as Extract<AssemblyConstraint, { type: 'coincident' }>).b as unknown as {
      edge: { axis: { origin: number[]; direction: number[] } }
    }).edge.axis
    for (let i = 0; i < 3; i++) expect(Math.abs(axis.direction[i] - [0, 0, 1][i])).toBeLessThan(0.01)
    expect(Math.abs(Math.abs(axis.origin[0]) - 5)).toBeLessThan(0.1)
    expect(Math.abs(Math.abs(axis.origin[1]) - 5)).toBeLessThan(0.1)

    const asm = buildAssembly('n3-pol', [
      { name: 'B1', shape: boxBig },
      { name: 'B2', shape: boxSmall },
    ], [
      { type: 'fixed', part: 'B1' } as AssemblyConstraint,
      ...cons,
    ])
    asm.solve()
    expect(asm.residuals).toBeDefined()
    const tB = asm.transforms.find((t) => t.index === 1)
    expect(tB).toBeDefined()
    const worldB = applyAt(tB!, [0, 0, 0])
    // 点到线垂距：perp = (worldB - O) - D·((worldB-O)·D)，应≈0（B2 中心必落到该棱线上）
    const O = axis.origin
    const D = axis.direction
    const d: [number, number, number] = [worldB[0] - O[0], worldB[1] - O[1], worldB[2] - O[2]]
    const proj = d[0] * D[0] + d[1] * D[1] + d[2] * D[2]
    const perp: [number, number, number] = [d[0] - D[0] * proj, d[1] - D[1] * proj, d[2] - D[2] * proj]
    const perpLen = Math.hypot(perp[0], perp[1], perp[2])
    expect(perpLen).toBeLessThan(0.1)
  })
})
