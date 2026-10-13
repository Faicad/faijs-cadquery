# P8：faijs 装配约束 sublocs 语义修正 — 开发计划

> 2026-10-12 立项。上游：本仓 P7 专项（canonical-pose 判等通道）清账后余下的最后一个
> 装配 blocked —— `test_constrain__nested_assy`（见
> `docs/plans/2026-10-11-pose-dof-channel-plan.md` 第八轮定性）。
> **工作仓**：D:/Faicad/faijs（packages/core），本仓只做镜像验证与发版承接。

## 1. 背景与根因（已取证，无需重查）

### 1.1 现象

`test_constrain__nested_assy`（CQ test_assembly.py::test_constrain 的 nested_assy fixture，
2 条约束 Plane + Axis）求解后 residuals=0、converged=true，但 SECOND 节点变换恒等；
ref 期望 SECOND 从 (0,4,0) 移到 (2,-4,0.75)。位姿**唯一确定**（dof=0），非欠定族，
canonical-pose 通道不适用。

附带佐证：本仓 bake 聚合修复（530ce2d）后，同构的
`test_constrain_with_tags__nested_assy` **PASS（bbox 0）**——差异不在求解器数学，
而在**约束实体进入求解器前的坐标系准备**。

### 1.2 根因（三层证据链）

1. **CQ 基准语义**（`c:/git/CADQ/cadquery/tests/test_assembly.py:1904`）：CQ 断言
   `constraint.sublocs[1]` == `nested_assy.objects["SECOND/BOTTOM"].loc`——约束的
   sub-location 记在**成员的 loc** 上；约束面几何按「成员 loc ∘ 面局部坐标」求值。
   即 CQ 求解器的初值/残差坐标系里，每个成员的面 marker 已经带着成员 loc。
2. **我方 flatten 现状**（faijs `packages/core/src/api/assembly/solve-tree.ts:98-123`）：
   `flattenTree` 收集叶 shape 时已把成员 loc **预烘焙进 shape**
   （本仓 `memberToNode` → `applyCqLocToShape`），`parentPoses` 因退化恒等而不参与
   recompose——变换丢失的另一半在此，但主矛盾不在这。
3. **求解器现状**（faijs `global-solver.ts:75-108 resolveMarker`）：从 EntityRef
   直接抽面几何（BREP 上的世界坐标快照），**没有任何 per-member loc 锚定**。
   因为 shape 已预烘焙到 world-init，求解器把 init 位姿当成"已满足约束的解"
   → 梯度为零 → 输出恒等。CQ 则把成员 loc 与几何分离（sublocs），初值=identity、
   残差含 loc 分量，求解器才需要真正"动"。

一句话：**我方把 loc 烘进了几何、又让求解器在烘过的几何上求残差——约束的
"待满足性"被预烘焙消掉了**。simple_assy（扁平）能过是因为 CQ 的三条约束引用
了 root 件（fixed 锚定系）+ 面几何恰好不落在 loc 重合退化点；nested 的
Plane+Axis 组合正好踩中。

### 1.3 判据（什么算修好）

- faijs 侧：`solveAssemblyTree` 对 nested_assy 形态（子装配 + 成员 loc）返回的
  `transforms` 非恒等，且 SECOND 世界位姿 = (2,-4,0.75)（旋转对齐 ref）。
- 本仓侧：`test_constrain__nested_assy` compare PASS（bbox/com < 1e-3，
  判据沿用 `tests/compare.ts`，不松容差）。
- 回归红线：现 585 ported 不许掉；特别是 with_tags__nested_assy、constrain 家族
  ×3（canonical 通道 6 条）、N0-3 全量基线零回归。

## 2. 方案骨架（两个候选，探针后定案）

### 方案 A：solver 侧 sublocs 显式化（贴 CQ 语义，推荐起点）

把「成员 loc」作为一等信息传进 solveGlobal：EntityRef 增加（或 env 携带）member
init loc；`resolveMarker` 返回的 marker 几何从"预烘焙世界坐标"改回"成员本地坐标"，
求解器状态变量初值从恒等改为成员 loc（即把烘焙掉的那部分还给状态变量）。
- 改动面：`global-solver.ts`（状态初始化 + resolveMarker env）、`solve-tree.ts`
  （flatten 传 loc、recompose 不再恒等退化）、`types.ts`。
- 好处：与 CQ sublocs 语义同构，nested/扁平统一； kinematics（joints）不受影响
  （direct 路径不经过此链）。
- 风险：所有现存 solveGlobal 消费方（扁平模式 solveDetailed 也走它）的初值语义
  变化 → 必须全量回归。

### 方案 B：调用侧去预烘焙（改本仓 memberToNode，不动 faijs）

`memberToNode` 不再 `applyCqLocToShape` 预烘焙，把 loc 留在 AssemblyNode.translate，
让 solve-tree 的 parentPoses/recompose 真正工作。
- 改动面：只在本仓 assembly.ts + solve-tree 的 parentPose 合成（若 faijs 端
  parentPoses 逻辑本身正确）。
- 风险：叶 shape 不预烘焙后，直接依赖 world-init 几何的约束实体解析（subshapes、
  面引用快照）会全部错位——**很可能把问题搬个地方**；且 nested 直接模式
  （buildAssemblyRoot 直跑探针）当前行为会变。
- 结论：先做 **5 行探针**（见 W1）验证 B 是否本质可行，不可行即锁定 A。

## 3. 工作包

### W1 — 判决探针（≤0.5 天，faijs 仓或本仓临时脚本）
最小复现：`buildAssemblyRoot`（嵌套，成员带 loc）+ 单条 Plane 约束 → 打印
solveGlobal 内部：成员初值状态、resolveMarker 输出的 marker 坐标、残差项。
产出：A/B 路线的定量判决 + marker 坐标与 CQ sublocs 语义的逐项对照表。
**验收**：探针脚本可重复执行（变异测试铁律），判决结论落本计划附录。

### W2 — faijs 求解器修正（1-2 天，方案 A）
- `resolveMarker`/env：EntityRef → marker 时减去成员 init loc（或等价的
  状态初值注入），保持「求解器变量 = 成员位姿增量」的语义纯净。
- `solve-tree.ts`：flatten 传 parentPoses 时不再被预烘焙恒等化（若 W1 判 A）；
  recompose 复合已有逻辑（`composePose`）不动。
- 单测（`packages/core/test/`，英文 commit，faijs 仓规范）：nested loc 锚定
  正/反用例 + 扁平模式回归 + 欠定诊断（underdetermined.dof）不被改语义。
- **验收**：W1 探针翻绿 + faijs 全量 `npm test` 零回归。

### W3 — 发版与承接（0.5 天）
- faijs 发版（patch/minor 视 API 面变化；W2 若扩 EntityRef 类型则 minor）。
- **tgz 直装先行**（用户既定流程：先直装验证，过了再谈升级/发版流程）；
  两条 peer 包同装必须一条 npm 命令（memory 铁律）。
- 本仓 peer 锁版 + lockfile 重生成 + 装配套件回归。

### W4 — 本仓实证与清账（0.5 天）
- `npm run build` 后重导 `test_constrain__nested_assy` → compare 实测。
- 收敛：翻 ported（585 → 586）+ gen-manifest 重扫 + 全量 compare 回归
  （零新回归红线）+ 文档回写 + 两仓 commit。
- 不收敛：回 W2 归因（预期风险点见 §4）。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| 扁平模式 solveDetailed 走同一 solveGlobal，初值语义变化引发全量回归 | W2 单测必须含扁平回归组；W4 全量 compare 兜底；N0-3 基线对照 |
| 预烘焙 world-init 不止服务于求解——STEP 导出/`getLoc` 也读它 | 修正只动求解器输入侧（marker/初值），烘焙链（bake/导出）不碰 |
| sublocs 中还含 subassembly 嵌套链的复合 loc（CQ sublocs[1] 是完整链合成） | W1 探针覆盖两层嵌套；composeCqLoc 复合已有测试可复用 |
| 欠定家族（canonical 6 条）被初值变化扰动 → 扭转角漂移 | canonical 通道对初值不敏感（扫描吸收流形差）；W4 全量验证 |
| occt-wasm 类型面先行声明陷阱（memory） | 不新增 d.ts 依赖面；W2 只用已实证的运行时能力 |

## 5. 排期与依赖

W1 →（W2 → W3 → W4）串行；总量 **2.5-3.5 天**。W1 判决若指向方案 B，
则 W2/W3 缩为纯本仓改动（不发版），排期减半。

## 附录：W1 探针结论（2026-10-12 实测）

探针：`.tmp-frame/probe-w1-sublocs.mts`（dist 导入路径变体 `.tmp-frame/probe-w1-dist.mts`
——GOTCHA：tsx/vitest 直读 src/sketch.ts:1715 会触发其自带 esbuild 的 `Unexpected "..."`
转译错误（字节级检查该文件本身无损伤、git 干净，属 tsx esbuild 版本问题）；探针类
临时脚本一律改从 `dist/index.js` / `dist/assembly/index.js` 导入）。

**最小复现**：root b1（fixed 锚）+ 成员 b2 带 loc (0,4,0)，仅 1 条 Plane 约束
（TOP '>Z' vs SECOND.BOTTOM '<Z'——b2 的 <Z 面初始在 z=4，root 顶面 z=0.5，
CQ 语义下 b2 必须移动 t_z≈-4）。

**结果**：converged=true，residuals=[0,0]，SECOND: t=[0,0,0] q≈恒等——
求解器认为约束已满足，零移动。

### 判决：方案 A（faijs 求解器侧 sublocs 显式化）

- 方案 B（本仓去预烘焙）被证伪：预烘焙同时服务实体解析（约束面引用按世界坐标
  快照取自预烘焙几何）——去掉预烘焙则 marker 全部错位，问题搬家而非解决。
- 方案 A 的注入点（W2 实施指引）：
  1. `resolveMarker` 的 env 需携带成员 init loc；face/edge marker 几何减去
     init loc（等价于把状态变量初值从恒等改为 init loc 的逆）。
  2. `solveGlobal` 状态初值：成员 i 的初值 = init loc（而非恒等）——把烘焙掉
     的那部分还给状态变量，残差恢复"待满足性"。
  3. 输出 transforms 语义不变（仍是"相对初值的增量"或"绝对位姿"——按现有
     composePose 约定，recompose 侧不动）。

### marker vs CQ sublocs 对照表

| 项 | CQ 基准 | 我方现状 | 修正后（方案 A） |
|---|---|---|---|
| sublocs 存储 | 约束对象记录成员 loc（test_assembly.py:1904 断言） | 无——loc 烘进 shape | env 携带成员 init loc |
| 面 marker 坐标系 | 成员本地坐标 ∘ 面局部 | 预烘焙世界坐标 | 成员本地坐标（减 init loc） |
| 状态变量初值 | identity（CQ solver 初值） | 恒等（= 预烘焙世界系） | 成员 init loc |
| residual 初值 | 非零（b2 顶面 z=4 vs 0.5） | 0（假已满足） | 非零（恢复） |
| nested_assy 解 | SECOND → (2,-4,0.75) | 恒等（FAIL） | 待 W4 实证 |

- [x] 判决：方案 A
- [x] marker 坐标 vs CQ sublocs 对照表
