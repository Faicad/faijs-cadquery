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
import { getKernel } from '@faicad/faijs/occt-kernel/occtKernel'
import { brepOf } from '@faicad/faijs/shape'
import type { Shape } from '@faicad/faijs/mesh/types'
import { compareStepFiles } from '@faicad/cq-compat-compare'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cq from '@faicad/faijs-cadquery'
import { buildAssembly, buildAssemblyRoot, constraintEx } from './assembly/index'

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

describe('P4 树模式 root 几何求解语义（CQ Assembly(obj) 对齐）', () => {
  /** 复刻 test_constrain/simple_assy 结构：root b1 + 嵌套 subassy1(b2)。 */
  async function buildSimpleAssyTree(b2Target: 'Plane' | 'none') {
    const res = await runtime.execute([
      "import * as cq from '@faicad/faijs-cadquery'",
      `let b1 = cq.box(cq.Workplane("XY"), 1, 1, 1, { centered: false })`,
      `let b1s = cq.val(b1)`,
      `let b2 = cq.box(cq.Workplane("XY"), 1, 1, 2)`,
      `let b2s = cq.val(b2)`,
    ].join('\n'))
    expect(res.failedAt).toBeUndefined()
    const b1 = res.outputs.get(asPartName('b1s')) as Shape
    const b2 = res.outputs.get(asPartName('b2s')) as Shape
    const sub = buildAssembly('subassy1', [{ name: 'b2', shape: b2, loc: { translation: [1, 1, 0] } }], [])
    const cons =
      b2Target === 'Plane'
        ? await constraintEx('simple_assy', '<X', b1, 'subassy1.b2', '<Z', b2, 'Plane')
        : []
    return { b1, b2, asm: buildAssemblyRoot('simple_assy', [{ name: 'subassy1', shape: sub }], cons, b1, [2, -5, 0]) }
  }

  it('root 件是求解参考系：无约束引用时终态停在其 loc（ref 实证 (2,-5,0)）', async () => {
    const { asm } = await buildSimpleAssyTree('none')
    asm.solve()
    const t = asm.nodeTransforms['simple_assy']
    // root 被隐式 fixed 锚定 ⇒ 世界变换恒等（位姿已预烘焙到 loc）。
    if (t) {
      for (const v of t.translation) expect(v).toBeCloseTo(0, 6)
    }
    // compound 含根件（CQ toCompound 语义）。
    expect(asm.toCompound()?.children?.length).toBe(2)
  })

  it('约束引用装配名 = 引用根件几何；子件按约束求解（对齐 CQ 断言 loc (-1,0.5,0.5)）', async () => {
    const { asm } = await buildSimpleAssyTree('Plane')
    asm.solve()
    // nodeTransforms 是求解系（root 在原点）的 per-leaf 世界变换；
    // CQ test_constrain 断言 children[0] loc → (-1,0.5,0.5)（同一参考系）。
    const tLeaf = asm.nodeTransforms['subassy1.b2']
    expect(tLeaf).toBeDefined()
    expect(tLeaf!.translation[0]).toBeCloseTo(-1, 2)
    expect(tLeaf!.translation[1]).toBeCloseTo(0.5, 2)
    expect(tLeaf!.translation[2]).toBeCloseTo(0.5, 2)
  })

  it('变异：去掉 Plane 约束 ⇒ b2 停在初始 loc（不被求解器拖动）', async () => {
    const withC = await buildSimpleAssyTree('Plane')
    const noC = await buildSimpleAssyTree('none')
    withC.asm.solve()
    noC.asm.solve()
    const tWith = withC.asm.nodeTransforms['subassy1.b2']
    const tNo = noC.asm.nodeTransforms['subassy1.b2']
    // 有约束时 b2 被拖到 root <X 面；无约束时保持初始（恒等或无变换条目）。
    expect(JSON.stringify(tWith?.translation)).not.toBe(JSON.stringify(tNo?.translation ?? null))
  })
})

/**
 * P7/D4-4：规范通道判定的镜像级变异测试。
 *
 * unary 欠定集（Fixed+FixedPoint+FixedAxis）的终态 b2 位姿含一个绕 (0,1,1) 的
 * 自由扭转——同一约束集的任意扭转角都是合法解。判据：
 *   - 合法解 B（把 b2 绕自由轴再扭 40°）在 canonical-pose 通道下必须 PASS；
 *   - 扰动受约束 DOF（FixedPoint 目标从 (0,0,-3) 挪到 (0.5,0,-3)）必须 FAIL——
 *     规范通道只豁免欠定自由度，受约束自由度跑偏不允许被「扫掉」。
 * 若两条判据反了（合法解 FAIL / 扰动解 PASS），说明 canonical 通道把不该豁免的
 * 自由度也豁免了（R-f 滥用风险），镜像管线不可信。
 */
describe('P7/D4-4 规范通道变异测试（canonical-pose 判定方向）', () => {
  const FREE_AXIS: [number, number, number] = [0, 1, 1]
  const PIVOT: [number, number, number] = [0, 0, -3]

  async function buildUnaryStep(fpWorld: [number, number, number], extraTwistDeg: number, tag: string): Promise<string> {
    const { b1, b2 } = await freshShapes()
    const cFixed = await constraintEx('b1', '', b1, '', '', null, 'Fixed')
    const cFP = await constraintEx('b2', '', b2, '', '', null, 'FixedPoint', fpWorld)
    const cFA = await constraintEx('b2', '>Z', b2, '', '', null, 'FixedAxis', [0, 1, 1])
    const asm = buildAssembly(`canon-${tag}`, [{ name: 'b1', shape: b1 }, { name: 'b2', shape: b2 }], [...cFixed, ...cFP, ...cFA])
    asm.solve()
    expect(asm.underdetermined?.dof).toBe(1)
    const kernel = getKernel() as unknown as {
      getSubShapes: (h: unknown, t: string) => unknown[]
      getCenterOfMass: (h: unknown) => { x: number; y: number; z: number }
      transform: (h: unknown, m: number[]) => unknown
      makeCompound: (a: unknown[]) => unknown
      exportStep: (h: unknown) => string
    }
    // solve() 就地烘焙成员几何（toCompound 返回 mesh 级 CompoundShape，brepOf
    // 不适用——见 probe）；BREP 句柄直接取烘焙后的成员 Shape。
    const solids = [brepOf(b1), brepOf(b2)] as unknown[]
    expect(solids.every((s) => s !== undefined)).toBe(true)
    let handle: unknown = kernel.makeCompound(solids)
    // 合法解 B：把 b2（索引 1 的 solid）绕自由轴、过其锚点再扭 extraTwistDeg ——
    // 该扭转恰是欠定自由度，约束残差不变。
    if (extraTwistDeg !== 0) {
      const a = (extraTwistDeg * Math.PI) / 180
      const len = Math.hypot(...FREE_AXIS)
      const [ax, ay, az] = FREE_AXIS.map((v) => v / len)
      const c = Math.cos(a)
      const s = Math.sin(a)
      const t = 1 - c
      const r00 = c + ax * ax * t, r01 = ax * ay * t - az * s, r02 = ax * az * t + ay * s
      const r10 = ay * ax * t + az * s, r11 = c + ay * ay * t, r12 = ay * az * t - ax * s
      const r20 = az * ax * t - ay * s, r21 = az * ay * t + ax * s, r22 = c + az * az * t
      const [px, py, pz] = PIVOT
      const tx = px - (r00 * px + r01 * py + r02 * pz)
      const ty = py - (r10 * px + r11 * py + r12 * pz)
      const tz = pz - (r20 * px + r21 * py + r22 * pz)
      const twisted = kernel.transform(solids[1], [r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz])
      handle = kernel.makeCompound([solids[0], twisted])
    }
    const dir = mkdtempSync(join(tmpdir(), 'p74-canon-'))
    const file = join(dir, `${tag}.step`)
    writeFileSync(file, kernel.exportStep(handle))
    return file
  }

  it('合法解 B（b2 多扭 40°）⇒ canonical-pose 通道 PASS；bitwise 通道 FAIL', async () => {
    const stepA = await buildUnaryStep([0, 0, -3], 0, 'legal-a')
    const stepB = await buildUnaryStep([0, 0, -3], 40, 'legal-b')
    // bitwise：自由扭转被判为缺陷（对照，钉住通道差异真实存在）
    const rb = await compareStepFiles(stepA, stepB, { strictTopology: false, linearTolerance: 1e-3, volumeRelativeTolerance: 1e-3 })
    expect(rb.equivalent).toBe(false)
    // canonical：扭转被豁免 → PASS
    const r = await compareStepFiles(stepA, stepB, {
      strictTopology: false, linearTolerance: 1e-3, volumeRelativeTolerance: 1e-3,
      poseMode: 'canonical-pose', canonicalFreeAxis: { x: FREE_AXIS[0], y: FREE_AXIS[1], z: FREE_AXIS[2] },
    })
    expect(r.equivalent).toBe(true)
    expect(r.canonicalPose).toBeDefined()
  }, 180000)

  it('扰动受约束 DOF（FixedPoint 挪 0.5mm）⇒ canonical-pose 通道也 FAIL（不得被扫掉）', async () => {
    const stepA = await buildUnaryStep([0, 0, -3], 0, 'pert-a')
    const stepP = await buildUnaryStep([0.5, 0, -3], 0, 'pert-b')
    const r = await compareStepFiles(stepA, stepP, {
      strictTopology: false, linearTolerance: 1e-3, volumeRelativeTolerance: 1e-3,
      poseMode: 'canonical-pose', canonicalFreeAxis: { x: FREE_AXIS[0], y: FREE_AXIS[1], z: FREE_AXIS[2] },
    })
    expect(r.equivalent).toBe(false)
  }, 180000)
})
