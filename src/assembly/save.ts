/**
 * @faicad/cq-compat-assembly/save — Assembly.save()/importStep()/load()（Node 侧）。
 *
 * 独立模块：imports `node:fs`，因此只出现在包根入口（"."），不进入
 * "./browser" 入口（浏览器打包 node:fs 会失败）。浏览器消费方用
 * solve()/toCompound()；save()/importStep()/load() 仅在 Node（CLI / 测试）使用。
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { getBackends } from '@faicad/faijs/runtime-state'
import { brepOf, fromBrep } from '@faicad/faijs/shape'
import type { BrepHandle } from '@faicad/faijs/brep/engine/types'
import { solidToShape } from '@faicad/faijs/brep/brep-ops'
import type { XCAFDocument, ShapeHandle } from 'occt-wasm'
import {
  initOcctWasm,
  importAssemblyFromStep,
  collectLeafParts,
  releaseAssemblyTree,
} from '@faicad/faijs/occt-kernel/occtKernel'
import type { BrepEngineApi } from '@faicad/faijs/brep/engine/primitives'
import type { CqAssembly } from './assembly'
import { buildAssembly } from './assembly'

/**
 * save — CQ Assembly.save() 等价（STEP 导出）。
 * @param asm - 已 buildAssembly 的装配对象（建议先 solve() 再导出，得到求解位姿）。
 * @param path - 输出文件路径（.step）。
 * @param opts - optional: { exportType?: 'STEP' }（当前仅支持 STEP）。
 */
export async function save(
  asm: CqAssembly,
  path: string,
  opts?: { exportType?: 'STEP' },
): Promise<void> {
  if (opts?.exportType && opts.exportType !== 'STEP') {
    throw new Error(`[cq-compat-assembly] save(): unsupported exportType "${opts.exportType}" (only STEP)`)
  }
  const kernel = getBackends().kernel.brep as BrepEngineApi | null
  if (!kernel) throw new Error('[cq-compat-assembly] save(): BREP kernel unavailable')
  if (asm.members.length === 0) {
    throw new Error('[cq-compat-assembly] save(): cannot export an empty assembly (no members)')
  }
  // P5-2: emit a real XCAF assembly (component references carrying names +
  // colours) instead of the earlier flat solid list, so importStep recognises
  // the STEP as an assembly and round-trips names/colours/placements.
  //
  // The assemblyOp compound's top-level children ARE the members, in order;
  // after solve() their placements are baked into the child geometry. We export
  // that compound as the root and mark it `assembly: true` — occt-wasm then
  // creates one component per top-level child at an identity location, because
  // the placement already lives in the geometry (the form importStep reads back).
  const rawKernel = (await initOcctWasm()) as unknown as {
    createXCAFDocument(): XCAFDocument
    makeCompound(shapes: ShapeHandle[]): ShapeHandle
  }
  const doc = rawKernel.createXCAFDocument()
  try {
    // Build a real XCAF assembly: a compound of the member geometries as the
    // root, marked `assembly: true` so occt-wasm emits one component per member
    // (at an identity location — the placement already lives in the member's
    // baked geometry, which is exactly what importStep reads back). Name +
    // colour each component to match its member.
    const solids = asm.members.map((m) => {
      const h = brepOf(m.shape) as unknown as ShapeHandle | undefined
      if (!h) throw new Error(`[cq-compat-assembly] save(): member "${m.name}" has no BREP solid`)
      return h
    })
    const compound = rawKernel.makeCompound(solids)
    const root = doc.addShape(compound, { name: asm.name, assembly: true })
    // Component order mirrors makeCompound's input == member order; importStep
    // reads them back in the same order via collectLeafParts.
    const components = doc.getChildren(root)
    asm.members.forEach((m, i) => {
      const comp = components[i]
      if (!comp) return
      doc.setName(comp, m.name)
      if (m.color) doc.setColor(comp, m.color)
    })
    const stepText = doc.exportSTEP()
    writeFileSync(path, Buffer.from(stepText, 'utf8'))
  } finally {
    doc.close()
  }
}
/**
 * importStep — CQ Assembly.importStep() 等价（STEP 文件导入为装配）。
 *
 * 走 XCAF（`STEPCAFControl_Reader` 的 color/name 模式），因此**保留装配名、
 * 成员名与成员颜色**；成员形状的位姿已烘焙进句柄（XCAF 的 `GetShape` 语义），
 * 与 `Assembly.solve()` 之后的状态一致。
 *
 * GOTCHA: 上游 `Assembly.importStep` 对**不含装配结构**的 STEP **抛
 * `ValueError("Step file does not contain an assembly")`**，而不是退化成一个
 * 匿名单成员——这是本函数之前的行为（走 `loadBrep` 拍平成 `part_1`），也是
 * docs/plans/2026-10-02-cadquery-port-gap-audit.md §3.5 E3b 记的缺口之一。
 * 判据同上游：顶层 label 必须 `IsTopLevel && IsAssembly`
 * （core 侧的 `syntheticGroup` 是"多 solid compound 被拆成虚拟组"的标记，
 * 那种形状在上游 `IsAssembly_s` 为 false，同样算非装配）。
 *
 * GOTCHA: 嵌套子装配**不会**重建层级 —— `CqAssembly` 只有扁平成员表。成员
 * 取所有的叶子零件（名字与颜色保留，子装配本身不成为成员）。
 *
 * @param path - STEP 文件本地路径。
 * @param unit - 单位（当前忽略，faijs 统一 mm；对齐 CQ 签名保留）。
 * @returns Promise<CqAssembly> 含导入几何的装配对象。
 * @throws 当文件不含装配结构（对齐上游 ValueError）。
 */
export async function importStep(
  path: string,
  unit?: 'MM' | 'CM' | 'M' | 'IN',
): Promise<CqAssembly> {
  void unit
  const kernel = getBackends().kernel.brep as BrepEngineApi | null
  if (!kernel) throw new Error('[cq-compat-assembly] importStep(): BREP kernel unavailable')
  const buffer = readFileSync(path)
  const nodes = await importAssemblyFromStep(new Uint8Array(buffer))
  const root = nodes.length === 1 ? nodes[0] : undefined
  if (!root || !root.isAssembly || root.syntheticGroup) {
    releaseAssemblyTree(await initOcctWasm(), nodes.filter((n) => n.isAssembly))
    throw new Error(
      'E_STEP_NOT_AN_ASSEMBLY: Step file does not contain an assembly — ' +
      'Assembly.importStep() only accepts files that declare an assembly structure ' +
      '(a bare shape export has none; use the shape/wireframe import path for those)',
    )
  }
  const members = collectLeafParts([root]).map((leaf) => {
    const handle = leaf.shapeHandle as unknown as BrepHandle
    const shape = fromBrep(solidToShape(kernel, handle), { solid: handle })
    return { name: leaf.name, shape, color: leaf.color ?? undefined }
  })
  return buildAssembly(root.name, members, [])
}

/**
 * load — CQ Assembly.load() 等价。当前仅支持 STEP（别名 importStep）。
 *
 * @param path - 文件本地路径。
 * @param importType - 导入类型（当前仅 'STEP'，默认自动推断扩展名）。
 * @param unit - 单位。
 * @returns Promise<CqAssembly>
 */
export async function load(
  path: string,
  importType?: 'STEP' | 'STL' | 'BREP',
  unit?: 'MM' | 'CM' | 'M' | 'IN',
): Promise<CqAssembly> {
  void importType
  return importStep(path, unit)
}
