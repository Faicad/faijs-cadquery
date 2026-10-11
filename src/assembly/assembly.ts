/**
 * @faicad/faijs-cadquery/assembly �?CadQuery-compatible assembly layer for faijs.
 *
 * Maps CadQuery Assembly.constrain DSL ("part@faces@>Z[-2]", "Plane"/"Axis") to
 * faijs AssemblyConstraint objects with EntityRef geometry snapshots, and wraps
 * the faijs core solver behind the CadQuery grammar:
 *
 *   let asm = cq.buildAssembly('name', members, constraints)
 *   let solved = asm.solve()          // CQ Assembly.solve()：封装底层求解器
 *   let result = solved.toCompound()  // CQ Assembly.toCompound()
 *   cq.save(asm, 'out.step')          // CQ Assembly.save()（Node 侧，�?save.ts�? *
 * Consumers MUST use the CadQuery solve-related API (solve()/toCompound()/save())
 * and MUST NOT probe core internals (e.g. getSlot(compound).behavior.solveDetailed)
 * �?the point of this package is to encapsulate the solver behind the CQ grammar.
 *
 * Constraint mapping (verified against faijs api/assembly/lower.ts):
 * - "Plane" �?mate (face-to-face: normal reversed + center coincident)
 * - "Axis"  �?angle:180 (pure-direction anti-parallel, CQ 2.8.0 solver.py semantics)
 * - "Point" �?coincident (selector is literal "x,y,z")
 * - "Cylinder" �?[concentric, coincident] (circular-edge axis resolution)
 * - "Distance" �?distance(value) (point-point or plane-plane)
 * - "Fixed" �?fixed
 * - "Revolute" �?fixed (placeholder until joints mechanism lands)
 */

import type { AssemblyConstraint, AssemblyTransform, BrepEngineApi, BrepHandle, CompoundShape, EntityRef, Shape } from '../adapters/faijs'
// D1 (2026-09-24) moved the `assembly` op out of core's platform namespace into
// the extension library �?import it directly instead of probing `cad.assembly`
// (which no longer exists on `createApiNamespace()`).
import { assembly as assemblyOp } from '@faicad/faijs/extra/editor-ops'
import { solveAssemblyTree } from '../adapters/faijs'
import type { AssemblyNode } from '../adapters/faijs'
import { compound as compoundOp } from '../adapters/faijs'
import { applyTransform, applyTransformBrep, brepOf, ensureSlot, getBackends, getSlot } from '../adapters/faijs'
import type { RGB } from '../workplane'
import { resolveFaceSelector, asBrepShape } from '../workplane'

/**
 * 装配输入归一：Workplane 载体（{ shape }，cq.box 等产物）�?内部 Shape�? * 再经 asBrepShape 处理借用视图。CadQuery 上游装配 API 接受 Workplane �?Shape
 * 两种形态（�?face(选择�?」模式），此处对齐——否则传 Workplane �? * asBrepShape 原样透传，faceRef �?brepOf(shape) �?undefined 崩溃�? */
function resolveAssemblyShape(v: unknown): Shape {
  const s =
    v !== null && typeof v === 'object' && 'shape' in v
      ? (v as { shape?: unknown }).shape
      : v
  return asBrepShape(s) as Shape
}

/**
 * faceRef
 * @param partName - string
 * @param selector - string
 * @param shape - Shape
 * @returns Promise<EntityRef>
 */
export async function faceRef(
  partName: string,
  selector: string,
  shape: Shape,
): Promise<EntityRef> {
  // Resolve via the same face enumeration as the Workplane API �?this is
  // required for CadQuery-style indexed selectors like "bp@faces@>Z[-2]"
  // (second-highest Z face, e.g. a recess floor instead of the top annulus).
  // The returned center is the face's area centroid (CadQuery face Center)
  // and the normal is the outward direction.
  const { center: faceCenter, normal } = await resolveFaceSelector(shape, selector)
  return {
    part: partName,
    face: {
      surfaceType: 'plane',
      center: faceCenter,
      normal,
    },
  } as EntityRef
}

/**
 * constraint
 * @param aPart - string
 * @param aSelector - string
 * @param aShape - Shape
 * @param bPart - string
 * @param bSelector - string
 * @param bShape - Shape
 * @param type - 'Plane' | 'Axis'
 * @returns Promise<AssemblyConstraint>
 */
export async function constraint(
  aPart: string,
  aSelector: string,
  aShape: Shape,
  bPart: string,
  bSelector: string,
  bShape: Shape,
  type: 'Plane' | 'Axis',
): Promise<AssemblyConstraint> {
  const out = await constraintEx(aPart, aSelector, aShape, bPart, bSelector, bShape, type)
  return out[0]
}

/**
 * pointRef �?字面坐标点引用（无需几何解析）�? * @param part - 部件�? * @param coords - [x,y,z]（本地系 mm�? * @returns EntityRef（point�? */
export function pointRef(part: string, coords: [number, number, number]): EntityRef {
  return { part, point: [coords[0], coords[1], coords[2]] } as EntityRef
}

/**
 * axisRef �?字面轴引用（无需几何解析）�? * @param part - 部件�? * @param origin - 轴上一�?[x,y,z]（本地系 mm�? * @param direction - 单位方向 [x,y,z]
 * @returns EntityRef（edge.axis�? */
export function axisRef(
  part: string,
  origin: [number, number, number],
  direction: [number, number, number],
): EntityRef {
  return { part, edge: { axis: { origin: [origin[0], origin[1], origin[2]], direction } } } as EntityRef
}

/**
 * CQ 方向选择�?token �?轴索引与语义�? * `|Z`=ParallelDir（子形状方向与轴平行）；`>>Z`/`<<Z` �?`>Z`/`<Z`=CenterNth/DirectionMinMax
 * （取子形状中�?方向沿轴的极值簇，`and` 在下方按交集组合）�? */
function parseAxisToken(
  tok: string,
): { axis: 0 | 1 | 2; mode: 'parallel' | 'extreme'; sign: 1 | -1 } | null {
  const AX: Record<string, 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 }
  const par = /^([|])([XYZ])$/.exec(tok)
  if (par) return { axis: AX[par[2]]!, mode: 'parallel', sign: 1 }
  const ext = /^([>]|>>|[<]|<<)([XYZ])$/.exec(tok)
  if (ext) return { axis: AX[ext[2]]!, mode: 'extreme', sign: ext[1][0] === '<' ? -1 : 1 }
  return null
}

/** 收集形状全部直边的折线（origin=首末中点、direction=归一�?�?�?、center=中点）�?*/
function collectEdges(
  part: string,
  handle: never,
  kernel: BrepEngineApi,
): Array<{ origin: [number, number, number]; direction: [number, number, number]; center: [number, number, number] }> {
  const wf = kernel.wireframe(handle, 0.01)
  const groups = wf.edgeGroups
  if (!groups || groups.length < 3) {
    throw new Error(`[cq-compat/assembly] collectEdges: no edge groups for part "${part}"`)
  }
  const edgeCount = groups.length / 3
  const out: Array<{ origin: [number, number, number]; direction: [number, number, number]; center: [number, number, number] }> = []
  for (let ei = 0; ei < edgeCount; ei++) {
    const start = groups[ei * 3]
    const count = groups[ei * 3 + 1]
    const numPts = Math.floor(count / 3)
    if (numPts < 2) continue
    const a: [number, number, number] = [wf.points[start], wf.points[start + 1], wf.points[start + 2]]
    const b: [number, number, number] = [
      wf.points[start + (numPts - 1) * 3],
      wf.points[start + (numPts - 1) * 3 + 1],
      wf.points[start + (numPts - 1) * 3 + 2],
    ]
    const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const len = Math.hypot(d[0], d[1], d[2])
    if (!(len > 1e-9)) continue
    const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    out.push({ origin: mid, direction: [d[0] / len, d[1] / len, d[2] / len], center: mid })
  }
  if (out.length === 0) {
    throw new Error(`[cq-compat/assembly] collectEdges: no resolvable straight edges for part "${part}"`)
  }
  return out
}

/**
 * resolvePointRef �?把「点」侧引用解析�?EntityRef（point）�? * 来源：字面坐�?"x,y,z"、面选择器（面心，复�?resolveFaceSelector）、顶�?整件（bbox 中心）�? * 顶点=单点，bbox 中心即该点；整件 bbox 中心对齐 CQ `Shape.Center()`�? BoundingBox().center）�? */
async function resolvePointRef(part: string, selector: string, shape: Shape | null): Promise<EntityRef> {
  const coords = parseCoords(selector)
  if (coords) return pointRef(part, coords)
  if (!shape) throw new Error(`[cq-compat/assembly] resolvePointRef: shape required for part "${part}"`)
  const s = resolveAssemblyShape(shape)
  const handle = brepOf(s)
  const kernel = getBackends().kernel.brep as BrepEngineApi | null
  if (!handle || !kernel) throw new Error(`[cq-compat/assembly] resolvePointRef: BREP unavailable for part "${part}"`)
  // 面选择器（�?@faces 或方向符）→ 面心
  if (selector && /@faces|>[XYZ]|<[XYZ]/.test(selector)) {
    const { center } = await resolveFaceSelector(s, selector)
    return pointRef(part, center)
  }
  // 顶点 / 整件 �?bbox 中心
  const bb = kernel.getBoundingBox(handle as never)
  const center: [number, number, number] = [(bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, (bb.zmin + bb.zmax) / 2]
  return pointRef(part, center)
}

/**
 * resolveAxisRefFromEdge �?把「线」侧引用（直�?圆边）解析为 EntityRef（edge.axis）�? * 直边：取折线首末 �?origin=中点、direction=归一�?�?�?。支�?CQ 方向文法
 *（`|Z` 平行 / `>Z` `>>Z` 极值；`and` 取交集）�? */
async function resolveAxisRefFromEdge(part: string, selector: string, shape: Shape | null): Promise<EntityRef> {
  if (!shape) throw new Error(`[cq-compat/assembly] resolveAxisRefFromEdge: shape required for part "${part}"`)
  const s = resolveAssemblyShape(shape)
  const handle = brepOf(s)
  const kernel = getBackends().kernel.brep as BrepEngineApi | null
  if (!handle || !kernel) {
    throw new Error(`[cq-compat/assembly] resolveAxisRefFromEdge: BREP unavailable for part "${part}"`)
  }
  const edges = collectEdges(part, handle as never, kernel)
  const tokens = selector.split(/\s+and\s+/i).map((t) => t.trim()).filter(Boolean)
  let cands = edges
  for (const tok of tokens) {
    const a = parseAxisToken(tok)
    if (!a) continue
    if (a.mode === 'parallel') {
      cands = cands.filter((e) => Math.abs(e.direction[a.axis]) > 0.99)
    } else {
      if (cands.length === 0) break
      const vals = cands.map((e) => e.center[a.axis])
      const ext = a.sign > 0 ? Math.max(...vals) : Math.min(...vals)
      cands = cands.filter((e) => Math.abs(e.center[a.axis] - ext) <= 1e-6)
    }
  }
  const pick = cands[0] ?? edges[0]
  return { part, edge: { axis: { origin: pick.origin, direction: pick.direction } } } as EntityRef
}

type AssemblyKind =
  | 'Plane'
  | 'Axis'
  | 'Point'
  | 'Cylinder'
  | 'Distance'
  | 'Fixed'
  | 'Revolute'
  // ── N3 新增：CQ 2.8.0 约束种类透传（core 0.31.2 求解器已原生支持这些世界锚定/�?�?�?线语义）──
  | 'PointInPlane'
  | 'PointOnLine'
  | 'FixedPoint'
  | 'FixedAxis'
  | 'FixedRotation'

function parseCoords(sel: string): [number, number, number] | null {
  const m = sel.replace(/[[\]()]/g, '').trim().split(/[\s,]+/).filter(Boolean)
  if (m.length !== 3) return null
  const x = Number(m[0])
  const y = Number(m[1])
  const z = Number(m[2])
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return [x, y, z]
}

/**
 * resolveAxisRef �?从形状里解析出一条轴（用�?Cylinder 配合）�? * �?wireframe 取边折线，对闭合边做圆拟合（PCA 平面 + 2D 最小二乘圆），
 * 返回第一条足够圆的边的轴。无内核/无圆边时抛错�? */
async function resolveAxisRef(part: string, shape: Shape): Promise<EntityRef> {
  shape = asBrepShape(shape) // 提升边界：实参可能是借用视图
  const handle = brepOf(shape)
  const kernel = getBackends().kernel.brep as BrepEngineApi | null
  if (!handle || !kernel) throw new Error(`[cq-compat/assembly] axisRef: BREP unavailable for part "${part}"`)
  // 整形状一�?wireframe，按 edgeGroups 逐边取折线区间�?  // 依据 topologyExt.ts：wireframe() �?getSubShapes 同用 TopExp::MapShapes +
  // IndexedMap，故 edge 枚举顺序一致——第 i �?edge 对应 edgeGroups[i*3..]�?  const wf = kernel.wireframe(handle as never, 0.01)
  const groups = wf.edgeGroups
  if (!groups || groups.length < 3) throw new Error(`[cq-compat/assembly] axisRef: wireframe returned no edge groups for part "${part}"`)
  const edgeCount = groups.length / 3
  for (let ei = 0; ei < edgeCount; ei++) {
    const start = groups[ei * 3]
    const count = groups[ei * 3 + 1] // float units (3 floats / point)
    const pts: [number, number, number][] = []
    const numPts = Math.floor(count / 3)
    for (let i = 0; i < numPts; i++) {
      const o = start + i * 3
      pts.push([wf.points[o], wf.points[o + 1], wf.points[o + 2]])
    }
    const axis = fitCircleAxis(pts)
    if (axis) return axisRef(part, axis.origin, axis.direction)
  }
  throw new Error(`[cq-compat/assembly] axisRef: no circular edge found in part "${part}"`)
}

/** 对一组（应共面、闭合）�?XYZ 点拟合圆轴，返回原点(圆心投影)与方�?法向)，非�?退化返�?null�?*/
function fitCircleAxis(pts: [number, number, number][]): { origin: [number, number, number]; direction: [number, number, number] } | null {
  const n = pts.length
  if (n < 6) return null
  // 质心
  const c: [number, number, number] = [0, 0, 0]
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2] }
  c[0] /= n; c[1] /= n; c[2] /= n
  // 相邻段叉积之�?�?平面法向（闭环平面点稳定�?  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const ax = a[0] - c[0], ay = a[1] - c[1], az = a[2] - c[2]
    const bx = b[0] - c[0], by = b[1] - c[1], bz = b[2] - c[2]
    nx += ay * bz - az * by
    ny += az * bx - ax * bz
    nz += ax * by - ay * bx
  }
  const nl = Math.hypot(nx, ny, nz)
  if (!(nl > 1e-9) || !Number.isFinite(nl)) return null
  nx /= nl; ny /= nl; nz /= nl
  // 平面正交�?  let up: [number, number, number] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  let ux = ny * up[2] - nz * up[1], uy = nz * up[0] - nx * up[2], uz = nx * up[1] - ny * up[0]
  let ul = Math.hypot(ux, uy, uz)
  if (!(ul > 1e-9)) {
    up = [1, 0, 0]
    ux = ny * up[2] - nz * up[1]; uy = nz * up[0] - nx * up[2]; uz = nx * up[1] - ny * up[0]
    ul = Math.hypot(ux, uy, uz)
    if (!(ul > 1e-9)) return null
  }
  const u: [number, number, number] = [ux / ul, uy / ul, uz / ul]
  const v: [number, number, number] = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]]
  // 投影�?2D
  const xs: number[] = []
  const ys: number[] = []
  for (const p of pts) {
    const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2]
    xs.push(dx * u[0] + dy * u[1] + dz * u[2])
    ys.push(dx * v[0] + dy * v[1] + dz * v[2])
  }
  // 2D 最小二乘圆拟合（Kasa）： a·xi + b·yi + c = -(xi²+yi²)
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sR = 0, sRx = 0, sRy = 0
  for (let i = 0; i < n; i++) {
    const xi = xs[i], yi = ys[i], ri = xi * xi + yi * yi
    sxx += xi * xi; sxy += xi * yi; syy += yi * yi
    sx += xi; sy += yi; sR += ri
    sRx += ri * xi; sRy += ri * yi
  }
  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ]
  const B = [-sRx, -sRy, -sR]
  const det = det3(A)
  if (!(Math.abs(det) > 1e-12)) return null
  const a = det3([[B[0], A[0][1], A[0][2]], [B[1], A[1][1], A[1][2]], [B[2], A[2][1], A[2][2]]]) / det
  const b = det3([[A[0][0], B[0], A[0][2]], [A[1][0], B[1], A[1][2]], [A[2][0], B[2], A[2][2]]]) / det
  const cc = det3([[A[0][0], A[0][1], B[0]], [A[1][0], A[1][1], B[1]], [A[2][0], A[2][1], B[2]]]) / det
  const r2 = a * a / 4 + b * b / 4 - cc
  if (!(r2 > 0) || !Number.isFinite(r2)) return null
  // 圆度校验：卡萨拟合有偏，�?RMS 过滤非圆�?  const R = Math.sqrt(r2)
  let rms = 0
  for (let i = 0; i < n; i++) {
    const dd = Math.hypot(xs[i] + a / 2, ys[i] + b / 2) - R
    rms += dd * dd
  }
  rms = Math.sqrt(rms / n)
  if (rms > R * 0.05) return null
  // 圆心回投�?3D
  const ox = c[0] + u[0] * (-a / 2) + v[0] * (-b / 2)
  const oy = c[1] + u[1] * (-a / 2) + v[1] * (-b / 2)
  const oz = c[2] + u[2] * (-a / 2) + v[2] * (-b / 2)
  if (![ox, oy, oz, nx, ny, nz].every(Number.isFinite)) return null
  return { origin: [ox, oy, oz], direction: [nx, ny, nz] }
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

/**
 * constraintEx �?统一约束构造，覆盖 CQ 公共种类并映射到 faijs 类型面�? *
 * 映射（对�?global 求解�?consuming �?AssemblyConstraint）：
 * - 'Plane'    �?[mate]（faceRef→plane�? * - 'Axis'     �?[angle:180]（纯方向反平行、无点项——CQ 2.8.0 `axis_cost` 缺省语义�? * - 'Point'    �?[coincident]（selector 为字面坐�?"x,y,z"�? * - 'Cylinder' �?[concentric, coincident(point_on_line)]（圆边解析轴�? * - 'Distance' �?[distance(value)]（point-point �?plane-plane�? * - 'Fixed'    �?[fixed]（aPart 锁定�? * - 'Revolute' �?[fixed]（暂降级为锚定占位；旋转 DOF 后续�?joints 机制�? *
 * @param aPart A 侧成员名�? * @param aSelector A 侧面选择器字符串（如 ">Z[-2]"）�? * @param aShape A 侧成员几何（真实 Shape 或借用视图）�? * @param bPart B 侧成员名�? * @param bSelector B 侧面选择器字符串�? * @param bShape B 侧成员几何（真实 Shape 或借用视图）�? * @param kind 约束种类（Plane/Axis/Point/Cylinder/Distance/Fixed/Revolute/PointInPlane/PointOnLine/FixedPoint/FixedAxis/FixedRotation）�? * @param param 可选参数：Distance 的距离值（number）；FixedPoint/FixedAxis 的世界坐�?方向（[x,y,z]）�? *   PointInPlane/PointOnLine �?param（沿面法�?线偏移）当前 faijs global-solver �? *   pushCoincident 固定 val=0，故透传但求解器侧暂忽略�? 例被 14 条锁定用例均�?param=0）�? * @returns AssemblyConstraint[]（Cylinder 拆两条，其余单条�? */
export async function constraintEx(
  aPart: string,
  aSelector: string,
  aShape: Shape | null,
  bPart: string,
  bSelector: string,
  bShape: Shape | null,
  kind: AssemblyKind,
  param?: number | [number, number, number],
): Promise<AssemblyConstraint[]> {
  switch (kind) {
    case 'Plane': {
      if (!aShape || !bShape) throw new Error(`constraintEx Plane: shapes required`)
      // 提升边界归一：实参可能是借用视图（见 asBrepShape 注释）。faceRef 内部
      // 亦归一，入口再归一保证直接调用路径（不�?compatOp 提升）行为一致�?      const a = await faceRef(aPart, aSelector, resolveAssemblyShape(aShape))
      const b = await faceRef(bPart, bSelector, resolveAssemblyShape(bShape))
      return [{ type: 'mate', a, b } as AssemblyConstraint]
    }
    case 'Axis': {
      if (!aShape || !bShape) throw new Error(`constraintEx Axis: shapes required`)
      const a = await faceRef(aPart, aSelector, resolveAssemblyShape(aShape))
      const b = await faceRef(bPart, bSelector, resolveAssemblyShape(bShape))
      // GOTCHA (2026-09-17，对�?CQ 2.8.0 `occ_impl/solver.py` 标定)：CQ 独立 Axis 约束�?      // **纯方向约�?*——`ConstraintInvariants["Axis"]` 只收两个 gp_Dir（无点项），
      // `axis_cost` 缺省 `val = pi`（反平行）。此前误映射�?'align'（同�?val=0 + 面心
      // 重合）属双重分歧：真�?e2e �?c4 被拖�?mb z=-1（参�?+6.1），且凭空多出一
      // �?CQ 没有的面心重合项�?angle' 在求解器里正是纯方向项（global-solver.ts
      // case 'angle'：axis 成本、无点项），value 单位 deg�?80 = 反平行）�?      return [{ type: 'angle', value: 180, a, b } as AssemblyConstraint]
    }
    case 'Point': {
      // CQ 语义：两侧 Shape.Center()（可以是字面坐标、面选择器或整件）。
      // 此前只吃字面坐标 "x,y,z"，test_constrain 的 (face, face, "Point") 形态直接抛错。
      const a = await resolvePointRef(aPart, aSelector, aShape)
      const b = await resolvePointRef(bPart, bSelector, bShape)
      return [{ type: 'coincident', a, b } as AssemblyConstraint]
    }
    case 'Cylinder': {
      if (!aShape || !bShape) throw new Error(`constraintEx Cylinder: shapes required`)
      const aAxis = await resolveAxisRef(aPart, aShape)
      const bAxis = await resolveAxisRef(bPart, bShape)
      return [
        { type: 'concentric', a: aAxis, b: bAxis } as AssemblyConstraint,
        { type: 'coincident', a: aAxis, b: bAxis } as AssemblyConstraint,
      ]
    }
    case 'Distance': {
      const pa = parseCoords(aSelector)
      const pb = parseCoords(bSelector)
      const a = pa
        ? pointRef(aPart, pa)
        : await faceRef(aPart, aSelector, aShape!)
      const b = pb
        ? pointRef(bPart, pb)
        : await faceRef(bPart, bSelector, bShape!)
      const value = param ?? 0
      return [{ type: 'distance', value, a, b } as AssemblyConstraint]
    }
    case 'Fixed':
      return [{ type: 'fixed', part: aPart } as AssemblyConstraint]
    case 'Revolute':
      // 暂降级为锚定占位（旋�?DOF 留待后续 joints 机制�?      return [{ type: 'fixed', part: aPart } as AssemblyConstraint]
    case 'PointInPlane': {
      // CQ：point 落到 plane 上（保留面内 2 平移 DOF）。faijs �?coincident(point, plane)
      // �?global-solver pushCoincident 降级 point_in_plane 代价项（对齐 solver.py point_in_plane_cost）�?      const a = await resolvePointRef(aPart, aSelector, aShape)
      const b = await faceRef(bPart, bSelector, resolveAssemblyShape(bShape))
      return [{ type: 'coincident', a, b } as AssemblyConstraint]
    }
    case 'PointOnLine': {
      // CQ：point 落到 line 上（保留沿线 1 平移 DOF）。coincident(point, axis) �?point_on_line�?      const a = await resolvePointRef(aPart, aSelector, aShape)
      const b = await resolveAxisRefFromEdge(bPart, bSelector, bShape)
      return [{ type: 'coincident', a, b } as AssemblyConstraint]
    }
    case 'FixedPoint': {
      // CQ 世界锚定：把某子实体（顶�?面心/整件中心）钉到世界字面坐�?world�?      // 仅约束该点，成员其余 DOF（尤其朝向）自由——不等同整件 fixed�?      const a = await resolvePointRef(aPart, aSelector, aShape)
      const world = (Array.isArray(param) ? param : [0, 0, 0]) as [number, number, number]
      return [{ type: 'fixedPoint', a, world } as AssemblyConstraint]
    }
    case 'FixedAxis': {
      // CQ 世界锚定：把某轴（面法向）钉到世界字面方�?worldDir（求解器�?vnormalize）�?      const a = await faceRef(aPart, aSelector, resolveAssemblyShape(aShape))
      const worldDir = (Array.isArray(param) ? param : [0, 0, 1]) as [number, number, number]
      return [{ type: 'fixedAxis', a, worldDir } as AssemblyConstraint]
    }
    case 'FixedRotation':
      // CQ 世界锚定：锁定该部件朝向（本�?XYZ 对齐世界 XYZ），平移自由�?      return [{ type: 'fixedRotation', part: aPart } as AssemblyConstraint]
  }
}

/** 初始相对位姿（对�?faijs AssemblyNode �?translate / rotate）�?*/
export interface CqLoc {
  translation?: [number, number, number]
  /** 角度制（度），对�?AssemblyNode.rotate.angle�?*/
  rotation?: { axis?: [number, number, number]; angle?: number }
}

/** 装配成员（CQ Assembly.objects 语义）。shape 可为真实 Shape（叶子）或子 CqAssembly（嵌套子装配）�?*/
export interface CqAssemblyMember {
  name: string
  shape: Shape | CqAssembly
  color?: RGB
  /** 初始相对位姿（相对父装配�?loc）。默�?identity�?*/
  loc?: CqLoc
}

/** 子形状引用（CQ Assembly._subshape 语义）：约束参考用，不�?compound 几何�?*/
export interface CqSubshape {
  name: string
  shape: Shape
  color?: RGB
}

/** `add` �?obj 形态：直接�?Shape，或 `{ shape, name?, color?, loc? }`（对�?CQ add 的多形态）�?*/
export type AssemblyAddArg = Shape | { shape: Shape; name?: string; color?: RGB; loc?: CqLoc }

/** 默认成员名：`part_<n>`，跳过已占用名（CQ �?uuid；此处用可读序号便于脚本面调试）�?*/
function defaultMemberName(used: Array<{ name: string }>): string {
  const taken = new Set(used.map((m) => m.name))
  let i = used.length + 1
  let n = `part_${i}`
  while (taken.has(n)) n = `part_${++i}`
  return n
}

/** 默认子形状名：`sub_<n>`，跳过已占用名�?*/
function defaultSubshapeName(used: Record<string, unknown>): string {
  let i = Object.keys(used).length + 1
  let n = `sub_${i}`
  while (n in used) n = `sub_${++i}`
  return n
}

/**
 * CQ 风格装配对象（CQ Assembly 兼容面）�? *
 * buildAssembly 返回本对象；求解封装底层 faijs 求解器，消费方只允许�? * solve()/toCompound()/save() 访问——禁止直�?core 内部
 * （getSlot(compound).behavior.solveDetailed 等）�? */
export interface CqAssembly {
  /** 装配名�?*/
  name: string
  /** 根装配自身几何（CQ Assembly.obj）；null 表示纯容器（仅持�?children）�?*/
  rootObj: Shape | null
  /** 根装配初始相对位姿（根相对世界；CQ Assembly.loc）�?*/
  rootLoc: CqLoc
  /** 成员表（name + shape；shape 可为 Shape 叶子或子 CqAssembly 嵌套）�?*/
  members: CqAssemblyMember[]
  /** 求解器选择�?global'（默认，CQ 语义）| 'chain'（legacy 链式）�?*/
  solver: 'chain' | 'global'
  /** solve() 后填充：逐约束终态残差（global 路径；chain 路径不填）�?*/
  residuals?: number[]
  /** 未支持约束的自由度合计（诊断量；收敛时为 0）�?*/
  dof: number
  /** 是否全部约束可解�?*/
  converged: boolean
  /** 无法求解的约束明细（entity 类型不匹�?/ 参考不可达）�?*/
  unsupported: string[]
  /** solve() 后填充：per-leaf 终态变换（扁平成员顺序；恒等位姿不输出）�?*/
  transforms: AssemblyTransform[]
  /** 树模式：qualified name（点分路径，�?"SECOND.BOTTOM"）→ 世界变换（solveAssemblyTree 输出）�?*/
  nodeTransforms: Record<string, AssemblyTransform>
  /** 装配体（compound；solve() 后成员位姿已烘焙�?children）。树模式�?solve() 内构建�?*/
  compound?: CompoundShape
  /** 是否已调�?solve()�?*/
  solved: boolean
  /** 约束表（CQ Assembly.constraints 属性对齐；add/remove 保留约束，CQ 语义不删关联约束）�?*/
  constraints: AssemblyConstraint[]
  /** 子形状引用表（CQ Assembly._subshape；约束参考用，不�?compound）�?*/
  subshapes: Record<string, CqSubshape>
  /** 本节点在树中�?qualified 路径（根 = ''）。供 children / getLoc 使用�?*/
  selfPath: string
  /** 是否走树模式求解（含嵌套成员�?root 几何）�?*/
  treeMode: boolean
  /**
   * 求解装配（CQ Assembly.solve()）。封装底层求解器�?   * - 扁平模式：经 faijs `assembly` op（solveAssemblyAndKinematics）原地烘焙；
   * - 树模式：�?faijs `solveAssemblyTree`（flatten �?solveGlobal �?recompose�?   *   父变�?�?求解器变换）实现嵌套子装配�?   * 幂等：重复调用直接返回（成员已烘焙，避免双重变换）�?   */
  solve(): CqAssembly
  /** 取已求解装配体（CQ Assembly.toCompound()）�?*/
  toCompound(): CompoundShape | undefined
  /**
   * 添加成员（CQ Assembly.add）�?*不可变语�?*：返回新�?CqAssembly，不原地改�?   * obj 可为 Shape �?`{ shape, name?, color?, loc? }` 或子 CqAssembly；重名抛错�?   */
  add(obj: AssemblyAddArg, name?: string, color?: RGB, loc?: CqLoc): CqAssembly
  /**
   * 添加子形状引用（CQ Assembly.addSubshape）：用于约束参考，不进 compound 几何。不可变�?   */
  addSubshape(shape: Shape, name?: string, color?: RGB): CqAssembly
  /**
   * 移除成员（CQ Assembly.remove）。不可变：返回新�?CqAssembly�?   * **偏离 CQ**：过滤引用被删成员的约束（faijs 构造时验证约束引用必须存在）�?   */
  remove(name: string): CqAssembly
  /**
   * CQ 风格约束 DSL（CQ Assembly.constrain）�?*异步**：几何解析需内核�?   * 故在调用时即解析�?AssemblyConstraint[] 并并�?constraints（不可变返回新装配）�?   *
   * 支持�?arity（对�?CQ variadic constrain）：
   * - (partRef, kind)                      一元（Fixed / FixedRotation / FixedAxis / FixedPoint�?   * - (partRef, kind, param)               一元带参（FixedPoint world / FixedAxis worldDir�?   * - (aRef, bRef, kind)                   二元（Plane/Axis/Point/Cylinder/Distance/PointInPlane/PointOnLine�?   * - (aRef, bRef, kind, param)            二元带参（Distance value�?   * - (id1, sel1, id2, sel2, kind)         六元路径式（"TOP@faces@>Z" 形式�?   * - (id1, sel1, id2, sel2, kind, param)  七元路径式带�?   *
   * 路径语法�?PARENT/CHILD@SUBSHAPE"�?/' 映射�?faijs qualified name '.'），
   * �?"SECOND/BOTTOM@faces@<Z"�?TOP?top_face"�?SECOND/BOTTOM"�?   */
  constrain(...args: Array<string | number[] | [number, number, number]>): Promise<CqAssembly>
  /**
   * 遍历装配树（CQ Assembly.traverse）。自顶向下产�?`[qualifiedName, wrapper]` 对�?   * 扁平模式只产出根装配自身 `[[name, this]]`；树模式产出全部成员�?   */
  traverse(): IterableIterator<[string, CqAssembly]>
  /** 子装配（本节�?members 中的 CqAssembly 包装）。供 CQ `children[0].loc` 镜像�?*/
  readonly children: CqAssembly[]
  /**
   * 取本节点（相对父装配）的平移分量 [x,y,z]（对�?CQ Assembly.loc.TranslationPart()）�?   * 树模式按 qualified name �?nodeTransforms 取世界变换，再减父节点世界变换得相对量�?   */
  getLoc(): [number, number, number]
  /** �?qualified 路径取子节点世界变换（树模式）�?*/
  getNodeTransform(path: string): AssemblyTransform | undefined
}

/** solveDetailed 返回面（core AssemblySolveResult 的运行时形态；residuals �?global 路径填）�?*/
type AssemblySolveResultLike = {
  transforms: AssemblyTransform[]
  dof: number
  converged: boolean
  unsupported: string[]
  residuals?: number[]
}

/**
 * CQ 约束种类全集（用�?constrain() arity 判定）�? */
const ASSEMBLY_KINDS: ReadonlySet<string> = new Set<AssemblyKind>([
  'Plane', 'Axis', 'Point', 'Cylinder', 'Distance', 'Fixed', 'Revolute',
  'PointInPlane', 'PointOnLine', 'FixedPoint', 'FixedAxis', 'FixedRotation',
])

function isAssemblyKind(s: unknown): s is AssemblyKind {
  return typeof s === 'string' && ASSEMBLY_KINDS.has(s)
}

/** 判定某值是否为 CqAssembly 包装（鸭子类型：�?rootObj/members/add/solve）�?*/
function isCqAssembly(x: unknown): x is CqAssembly {
  return (
    typeof x === 'object' && x !== null &&
    'members' in x && 'rootObj' in x && 'add' in x && 'solve' in x
  )
}

/**
 * 解析 CQ 引用字符串："PART@SUBSHAPE"（如 "SECOND/BOTTOM@faces@<Z"）�? * "PART?tag"�?TOP?top_face"）、或�?"PART"�?SECOND/BOTTOM"）�? */
function parseCqRef(ref: string): { part: string; sub?: string; tag?: string } {
  const q = ref.indexOf('?')
  if (q >= 0) return { part: ref.slice(0, q), tag: ref.slice(q + 1) }
  const at = ref.indexOf('@')
  if (at < 0) return { part: ref }
  return { part: ref.slice(0, at), sub: ref.slice(at + 1) }
}

/** CQ 路径�?/'）→ faijs qualified name�?.'）�?*/
function qualifyPath(p: string): string {
  return p.split('/').filter(Boolean).join('.')
}

/** �?"faces@>Z" 抽取选择器（'@' 之后）；�?'@' 原样返回�?*/
function stripSub(sub: string | undefined): string {
  if (!sub) return ''
  const at = sub.indexOf('@')
  return at < 0 ? sub : sub.slice(at + 1)
}

/** 组合两个相对位姿 a �?b（先应用 b 再应�?a）。仅平移时退化为向量相加�?*/
function composeCqLoc(a: CqLoc, b: CqLoc): CqLoc {
  const ba = b.translation ?? [0, 0, 0]
  const aa = a.translation ?? [0, 0, 0]
  const rotation = a.rotation ?? b.rotation
  return { translation: [aa[0] + ba[0], aa[1] + ba[1], aa[2] + ba[2]], rotation }
}

/** 把相对位姿应用到 Shape（预烘焙�?world-init 位置，使 solveAssemblyTree �?parentPose 退化为 identity）�?*/
function applyCqLocToShape(shape: Shape, loc: CqLoc): Shape {
  const angle = (loc.rotation?.angle ?? 0) * (Math.PI / 180)
  const axis = loc.rotation?.axis ?? [0, 0, 1]
  const q = quatFromAxisAngle(axis, angle)
  return applyTransform(shape, q, [0, 0, 0], loc.translation ?? [0, 0, 0], quatToMatrix(q))
}

/** 轴角 �?四元�?[x,y,z,w]�?*/
function quatFromAxisAngle(axis: [number, number, number], angleRad: number): [number, number, number, number] {
  const n = Math.hypot(axis[0], axis[1], axis[2]) || 1
  const h = angleRad / 2
  const s = Math.sin(h)
  return [(axis[0] / n) * s, (axis[1] / n) * s, (axis[2] / n) * s, Math.cos(h)]
}

/** 四元�?�?行主�?3x3 旋转矩阵�? 元）�?*/
function quatToMatrix(q: [number, number, number, number]): number[] {
  const [x, y, z, w] = q
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ]
}

/** �?CQ 成员（可能嵌套）递归展开�?faijs AssemblyNode（叶 shape 已预烘焙�?world-init）�?*/
function memberToNode(m: CqAssemblyMember, fallbackName: string, parentWorld: CqLoc): AssemblyNode {
  const name = m.name ?? fallbackName
  const nodeWorld = composeCqLoc(parentWorld, m.loc ?? {})
  // AssemblyNode �?shape/children �?readonly（纯数据结构，修改走 addChild/updateNode）；
  // 这里构建期就地组装，用可变中间形态填充后�?AssemblyNode 面收窄�?  const node: { name: string; translate: [number, number, number]; children: AssemblyNode[]; shape?: Shape } = { name, translate: [0, 0, 0], children: [] }
  if (isCqAssembly(m.shape)) {
    const child = m.shape
    const childWorld = composeCqLoc(nodeWorld, child.rootLoc)
    if (child.rootObj) node.shape = applyCqLocToShape(child.rootObj, childWorld)
    for (const cm of child.members) node.children.push(memberToNode(cm, cm.name, childWorld))
  } else {
    node.shape = applyCqLocToShape(m.shape as Shape, nodeWorld)
  }
  return node as AssemblyNode
}

/**
 * buildAssembly �?构�?CQ 风格装配对象（不求解；位姿求解在 solve()）�? *
 * 扁平模式（members 均为 Shape 叶子，无 root 几何）：复用 faijs `assembly` op
 * （solveAssemblyAndKinematics），�?N3 既有行为一致�? *
 * 树模式（members 含子 CqAssembly，或显式给定 root 几何）：复用 faijs
 * `solveAssemblyTree`（flatten �?solveGlobal �?recompose，父变换 �?求解器变换）�? * 实现 CQ 嵌套子装配语义�? *
 * @param name - string
 * @param members - Array<{ name: string; shape: Shape | CqAssembly; color?: RGB; loc?: CqLoc }>
 * @param constraints - AssemblyConstraint[]（已解析约束；CQ DSL �?constrain() 异步解析并入�? * @param opts - optional: { solver?, subshapes?, root?: { shape, loc? } }；默�?'global'（CQ 语义�? * @returns CqAssembly
 */
/**
 * concatConstraints — 合并 constraintEx 产出的约束数组（变参）。
 *
 * 专为受限 `.fai.js` 子集而生：该子集不允许数组字面量接收者方法调用 / 多参
 * `concat` / spread 实参，镜像无法用原生 JS 合并多条约束；本 op 让镜像写
 * `let cons = await cqa.concatConstraints(c1, c2, c3)`（注意返回值不被 await
 * 破坏——同步函数在 direct-executor 下按 op 语句求值）。
 */
export function concatConstraints(...groups: Array<AssemblyConstraint | AssemblyConstraint[]>): AssemblyConstraint[] {
  const out: AssemblyConstraint[] = []
  for (const g of groups) {
    if (Array.isArray(g)) out.push(...g)
    else out.push(g)
  }
  return out
}

export function buildAssembly(
  name: string,
  members: Array<{ name: string; shape: Shape | CqAssembly; color?: RGB; loc?: CqLoc }>,
  constraints: AssemblyConstraint[],
  opts?: { solver?: 'chain' | 'global'; subshapes?: Record<string, CqSubshape>; root?: { shape: Shape; loc?: CqLoc } },
): CqAssembly {
  // 提升边界归一：经 runtime.execute �?members[].shape 是借用 brepjs 视图
  // （borrowDeep 产物），不是 faijs Shape。compound �?children 必须持有 mesh
  // （引�?applyTransform 做顶点烘焙）+ BREP 身份槽（STEP 导出/刚体变换�?  // slot.solid），借用视图两者皆�?�?必须还原为真�?Shape 再进 assembly�?  // 嵌套成员（shape 为子 CqAssembly）原样透传，不在此归一（其几何由子装配持有）�?  const shapes = members.map((m) => (isCqAssembly(m.shape) ? m.shape : resolveAssemblyShape(m.shape as Shape)))
  const memberNames = members.map((m) => m.name)
  const memberColors: Record<string, [number, number, number]> = {}
  for (const m of members) {
    if (m.color) memberColors[m.name] = m.color
  }

  // cq-compat-assembly �?CadQuery 兼容层：默认�?global 求解器（语义对齐 CQ
  // solver.py）。需要旧 chain 行为时可显式 opts.solver='chain'�?  const solver = opts?.solver ?? 'global'

  // 树模式：含嵌套子装配成员，或显式给定根装配几何（CQ Assembly(obj)）�?  const treeMode = !!(opts?.root) || members.some((m) => isCqAssembly(m.shape))
  const rootObj = opts?.root?.shape ?? null
  const rootLoc: CqLoc = opts?.root?.loc ?? {}
  const subshapesInit = opts?.subshapes ?? {}
  // 扁平模式复用 faijs assembly op 构建 compound（含 memberNames/memberColors 元数据，
  // �?solve() �?behavior.solveDetailed �?per-member transforms）；树模式的 compound
  // �?solve() 内由叶几何聚合构建（此时叶位姿来�?solveAssemblyTree �?per-leaf 变换）�?  const compound: CompoundShape | undefined = treeMode
    ? undefined
    : (assemblyOp({
        name,
        members: shapes as Shape[],
        memberNames,
        constraints,
        memberColors,
        solver,
      }) as unknown as CompoundShape)
  const asm: CqAssembly = {
    name,
    rootObj,
    rootLoc,
    members: members.map((m, i) => ({ name: m.name, shape: shapes[i], color: m.color, loc: m.loc })),
    solver,
    constraints,
    subshapes: subshapesInit,
    residuals: undefined,
    dof: 0,
    converged: true,
    unsupported: [],
    transforms: [],
    nodeTransforms: {},
    selfPath: '',
    treeMode,
    compound,
    solved: false,
    solve() {
      // 幂等守卫：成员位姿已在首�?solve() 烘焙，重复求解会二次变换�?      if (this.solved) return this

      // ── 树模式（嵌套子装�?/ 显式 root 几何）──
      // �?shape 已预烘焙�?world-init（applyCqLocToShape），parentPose 退化为
      // identity，solveAssemblyTree 返回�?per-leaf 世界变换即终态。位姿烘焙走
      // 与扁平模式相同的 mesh + BREP 双通道；compound 由叶几何在求解后聚合�?      if (this.treeMode) {
        const root: AssemblyNode = {
          name: this.name,
          translate: [0, 0, 0],
          // N3 修复：solveAssemblyTree 的 flattenTree 会收集 root.constraints ——
          // 不挂载的话嵌套子装配的约束会被静默丢弃（求解器只看到自由成员）。
          constraints: this.constraints,
          children: this.members.map((m) =>
            memberToNode(m, m.name, this.rootLoc),
          ),
        }
        const result = solveAssemblyTree(root, { solver: this.solver, name: this.name })
        this.residuals = result.residuals
        this.dof = result.converged ? 0 : -1
        this.converged = result.converged
        this.unsupported = result.unsupported
        if (!result.converged) {
          throw new Error(
            `[cq-compat/assembly] solve() did not converge (tree); unsupported: ` +
              (result.unsupported.length > 0 ? result.unsupported.join(', ') : '(no detail)'),
          )
        }
        // per-leaf 世界变换烘焙�?members（叶 shape 为烘焙后的真�?Shape），
        // 并聚�?compound；qualified 名挂�?nodeTransforms �?getLoc/getNodeTransform�?        const kernel = getBackends().kernel.brep as BrepEngineApi | null
        const leaves: Shape[] = []
        const bake = (m: CqAssemblyMember, prefix: string): void => {
          const q = prefix ? `${prefix}.${m.name}` : m.name
          const t = result.transforms[q]
          if (t) this.nodeTransforms[q] = t
          if (isCqAssembly(m.shape)) {
            for (const cm of m.shape.members) bake(cm, q)
            return
          }
          const shape = resolveAssemblyShape(m.shape as Shape)
          if (t) {
            Object.assign(shape, applyTransform(shape, t.quaternion, t.pivot, t.translation, t.rotationMatrix))
            if (kernel) {
              const solid = brepOf(shape) as BrepHandle | undefined
              if (solid) {
                const transformed = applyTransformBrep(kernel, solid, t.quaternion, t.pivot, t.translation)
                ensureSlot(shape).solid = transformed
              }
            }
          }
          leaves.push(shape)
        }
        for (const m of this.members) bake(m, '')
        this.compound = compoundOp(leaves)
        this.solved = true
        return this
      }

      // ── 扁平模式（members 均为 Shape 叶子）──

      // CadQuery's Assembly.solve() solves constraints before export �?the faijs
      // solver itself is wrapped here so consumers never touch core internals.
      // GOTCHA (2026-09-18)：引擎只�?direct-executor 路径消费 pending transforms
      // （applyPendingAssemblyTransforms）；CLI brep 模块路径无人消费 �?登记 pending
      // 也没用，成员停在恒等位姿。因此这里直�?solveDetailed() 拿到 transforms�?      // 在库侧把位姿烘焙进成员：mesh 顶点原地变换 + BREP slot.solid 刚体变换
      // （与 direct-executor 同语义）。behavior.solve/compound.solve �?pending 登记
      // 保留（direct 路径仍走引擎烘焙），但本封装不再依赖它�?      const behavior = this.compound ? (getSlot(this.compound)?.behavior as
        | { memberNames?: string[]; solveDetailed?: () => AssemblySolveResultLike }
        | undefined) : undefined
      const result: AssemblySolveResultLike = behavior?.solveDetailed?.() ?? { transforms: [], dof: 0, converged: true, unsupported: [] }
      this.transforms = result.transforms
      this.residuals = result.residuals
      this.dof = result.dof
      this.converged = result.converged
      this.unsupported = result.unsupported
      if (!result.converged) {
        throw new Error(
          `[cq-compat/assembly] solve() did not converge (dof=${result.dof}); unsupported: ` +
            (result.unsupported.length > 0 ? result.unsupported.join(', ') : '(no detail)'),
        )
      }

      // CQ 语义对齐：无约束成员（如 assemb.py 里仅 .add �?slide_top）在 CQ 求解�?      // 中固定在初始位姿（不被拉入最小化）；我方 global 求解器会给自由成员漂移解�?      // 烘焙前按「是否被约束引用」过滤，未引用成员保持恒等�?      const referenced = new Set<string>()
      for (const c of constraints) {
        // StructuralConstraint 形态是 { a: EntityRef, b: EntityRef }（EntityRef.part
        // = 成员名）；cq-compat 的 constraint() 只产出该形态。FaceMateConstraint 无
        // a/b，用 in 收窄跳过。N3 修复：FixedPoint/FixedAxis 等单侧锚定约束只有 a
        //（此前只收 {a,b} 双侧 → 被锚定成员没进 referenced，烘焙被过滤，位姿丢失）。
        const refs = 'a' in c && 'b' in c ? [c.a, c.b] : 'a' in c ? [c.a] : []
        for (const ref of refs as Array<{ part?: string }>) {
          if (ref && typeof ref.part === 'string') referenced.add(ref.part)
        }
        if ('part' in c && typeof (c as { part?: unknown }).part === 'string') {
          referenced.add((c as unknown as { part: string }).part)
        }
      }
      const baked = result.transforms.filter((t) => referenced.has(behavior?.memberNames?.[t.index] ?? ''))
      if (baked.length > 0) {
        const kernel = getBackends().kernel.brep as BrepEngineApi | null
        const children = (this.compound as unknown as { children?: Shape[] }).children ?? []
        for (const t of baked) {
          const member = children[t.index]
          if (!member || typeof member !== 'object') continue
          // mesh 顶点原地变换（保留对象引用，ctx �?compound.children 同步看到变更�?          Object.assign(member, applyTransform(member, t.quaternion, t.pivot, t.translation, t.rotationMatrix))
          // BREP 刚体变换：新 solid 写回身份槽（STEP 导出�?slot.solid）�?          // GOTCHA：旧 solid 句柄**不能 release**——solidCache（partName 键）仍指�?          // 它，库侧无法同步该缓存（setSolidHook 是宿主注入），release 后拓扑构�?          // 读到悬空句柄�?INVALID_SHAPE_ID；保留旧句柄仅浪费少量内存�?          if (kernel) {
            const solid = brepOf(member) as BrepHandle | undefined
            if (solid) {
              const transformed = applyTransformBrep(kernel, solid, t.quaternion, t.pivot, t.translation)
              ensureSlot(member).solid = transformed
            }
          }
        }
      }
      this.solved = true
      return this
    },
    toCompound() {
      return this.compound
    },
    add(obj: AssemblyAddArg, p_name?: string, p_color?: RGB): CqAssembly {
      let member: { name: string; shape: Shape; color?: RGB }
      if (obj !== null && typeof obj === 'object' && 'shape' in obj) {
        const o = obj as { shape: Shape; name?: string; color?: RGB }
        member = {
          name: p_name ?? o.name ?? defaultMemberName(this.members),
          shape: o.shape,
          color: p_color ?? o.color,
        }
      } else {
        member = { name: p_name ?? defaultMemberName(this.members), shape: obj as Shape, color: p_color }
      }
      if (this.members.some((m) => m.name === member.name)) {
        throw new Error(`[cq-compat/assembly] add: duplicate member name "${member.name}"`)
      }
      return buildAssembly(this.name, [...this.members, member], this.constraints, {
        solver: this.solver,
        subshapes: this.subshapes,
      })
    },
    addSubshape(shape: Shape, p_name?: string, p_color?: RGB): CqAssembly {
      const n = p_name ?? defaultSubshapeName(this.subshapes)
      if (n in this.subshapes) {
        throw new Error(`[cq-compat/assembly] addSubshape: duplicate subshape name "${n}"`)
      }
      const subshapes = { ...this.subshapes, [n]: { name: n, shape, color: p_color } }
      return buildAssembly(this.name, this.members, this.constraints, {
        solver: this.solver,
        subshapes,
      })
    },
    remove(name: string): CqAssembly {
      if (!this.members.some((m) => m.name === name)) {
        throw new Error(`[cq-compat/assembly] remove: no member named "${name}"`)
      }
      const members = this.members.filter((m) => m.name !== name)
      const remaining = new Set(members.map((m) => m.name))
      const constraints = this.constraints.filter((c) => {
        if ('a' in c && 'b' in c) {
          const refs = [c.a, c.b] as Array<{ part?: string }>
          return refs.every((r) => !r || typeof r.part !== 'string' || remaining.has(r.part))
        }
        return true
      })
      return buildAssembly(this.name, members, constraints, {
        solver: this.solver,
        subshapes: this.subshapes,
      })
    },
    *traverse(): IterableIterator<[string, CqAssembly]> {
      yield [this.name, this]
      for (const m of this.members) {
        if (isCqAssembly(m.shape)) {
          const q = this.selfPath ? `${this.selfPath}.${m.name}` : m.name
          for (const [qn, sub] of m.shape.traverse()) {
            void q
            yield [qn, sub]
          }
        }
      }
    },
    get children(): CqAssembly[] {
      return this.members.filter((m) => isCqAssembly(m.shape)).map((m) => m.shape as CqAssembly)
    },
    getLoc(): [number, number, number] {
      // 根装配：树模式取自身世界平移；否则回退初始 rootLoc（未求解时）�?      if (this.selfPath) {
        return this.nodeTransforms[this.selfPath]?.translation ?? [0, 0, 0]
      }
      return (this.rootLoc.translation ?? [0, 0, 0]) as [number, number, number]
    },
    getNodeTransform(p: string): AssemblyTransform | undefined {
      return this.nodeTransforms[qualifyPath(p)]
    },
    async constrain(...args: Array<string | number[] | [number, number, number]>): Promise<CqAssembly> {
      // CQ variadic constrain：拆出字符串引用/种类与可选数值参数�?      const strs = args.filter((a): a is string => typeof a === 'string')
      const param = args.find((a): a is [number, number, number] => Array.isArray(a))
      if (strs.length !== 2 && strs.length !== 3) {
        throw new Error(`[cq-compat/assembly] constrain: expected 2-3 string args (ref[, ref,] kind), got ${strs.length}`)
      }
      const [aRef, bRef, kindStr] = strs.length === 3 ? [strs[0], strs[1], strs[2]] : [strs[0], '', strs[1]]
      if (!isAssemblyKind(kindStr)) {
        throw new Error(`[cq-compat/assembly] constrain: unknown kind "${kindStr}"`)
      }
      const pa = parseCqRef(aRef)
      const pb = bRef ? parseCqRef(bRef) : null
      const shapeOf = (name: string): Shape | null => {
        const m = this.members.find((mm) => mm.name === name)
        if (!m) throw new Error(`[cq-compat/assembly] constrain: unknown part "${name}"`)
        return isCqAssembly(m.shape) ? null : (m.shape as Shape)
      }
      const cons = await constraintEx(
        pa.part, stripSub(pa.sub), shapeOf(pa.part),
        pb?.part ?? '', stripSub(pb?.sub), pb ? shapeOf(pb.part) : null,
        kindStr, param,
      )
      return buildAssembly(this.name, this.members, [...this.constraints, ...cons], {
        solver: this.solver,
        subshapes: this.subshapes,
        root: this.rootObj ? { shape: this.rootObj, loc: this.rootLoc } : undefined,
      })
    },
  }
  return asm
}

/**
 * Color
 * @param r - number
 * @param g - number
 * @param b - number
 * @param _a - number
 * @returns RGB
 */
export function Color(r: number, g: number, b: number, _a?: number): RGB {
  return [r, g, b]
}
