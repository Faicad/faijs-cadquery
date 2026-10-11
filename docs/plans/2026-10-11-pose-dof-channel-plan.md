# P7 · 求解器 DOF 诊断 + 欠定位姿规范判等通道（方案 3 开发计划）

- 日期：2026-10-11
- 状态：**待审（草稿）**
- 仓库：`D:\Faicad\faijs-cadquery`（本仓，cq-compat 层）+ 跨仓改动面 `@faicad/faijs`、`@faicad/cq-compat-compare`
- 前置取证：
  - `docs/plans/2026-10-10-cadquery-next-phase-plan.md` 2026-10-11 快照（`unary_constraints` ×3 收敛对齐判死）
  - `tests/ref-harness/lm-convergence-probe.mjs`（判定实验，可重跑）
  - `tests/mark-blocked.ts` unary 三条的 UNREACHABLE reason

---

## 0. 一句话

`FixedAxis` 等欠定约束的终态位姿由优化器轨迹决定、无唯一「正确解」，逐位判等结构性不可达；本计划沿**方案 3**打通「求解器如实上报剩余自由度 → 判等管线按 DOF 自动路由 → 比较器新增只量受约束自由度的规范判等通道」，让 9 条 `op:assembly-solve` 中的欠定族（unary ×3，潜在 subassy ×2）在**不松全局容差**（R3 红线）的前提下翻 ported。

## 1. 为什么是方案 3（三方案取舍回顾）

| 方案 | 机制 | 判定依据 | 问题 |
| --- | --- | --- | --- |
| 1 逐用例声明路由 | 人工在 manifest 标 `poseMode` | 人眼分析上游测试源码 | 新用例进来没人分析就误判；「知道欠定」靠记忆 |
| 2 比较器 DOF/秩分析 | compare 侧从约束元数据算 `6n − Σ削减` 或 `rank(J)` | 约束词表 DOF 表 / 数值雅可比秩 | 需要把约束集传进比较器，接口重；秩分析实现贵 |
| **3 求解器 dof 诊断（本计划）** | 求解器运行时本来就构造了 terms/freeIdx，**顺手上报真实剩余 DOF** | LM 收敛后的实际 `n − rank` 信息 | 需改 faijs（跨仓）——但这是**信息源头**，最可靠 |

方案 3 的核心优势：`solveGlobal` 内部**已经拥有**判定欠定所需的全部信息（terms 的残差维数、freeIdx、锁死集），且 CQ 上游 `Assembly.solve()` 的 solve result 本来就带 DOF 语义——补齐它属于**对齐上游**，不是发明新协议。

## 2. 现状取证（2026-10-11 实测）

### 2.1 faijs 侧（`@faicad/faijs` 0.31.2 dist）

| 点位 | 现状 | 位置 |
| --- | --- | --- |
| `solveGlobal` 返回 `dof` | **硬编码 `dof: 0`**（`converged ? 0 : -1` 仅在 solve-tree 层） | `dist/api/assembly/solvers/global-solver.js:455` 附近 `return { transforms, dof: 0, ... }` |
| 欠定信息真实存在 | `terms[].fn` 决定残差维数（point/axis val=0 → 3 维；point_in_plane/point_on_line val≠0 → 1 维）；`freeIdx.length` = 自由成员数；`lockedSet` = 冻结成员 | 同文件 `termResidual` / 变量装配段 |
| `solve-tree.js` recompose | 不透传 dof，`converged` 布尔 | `dist/api/assembly/solve-tree.js` |
| `CqAssembly.solve()`（本仓） | `this.dof = result.converged ? 0 : -1`，字段已存在但语义为假 | `src/assembly/assembly.ts` 扁平/树两分支 |

### 2.2 本仓判等管线

| 点位 | 现状 |
| --- | --- |
| `tests/compare.ts` | 对每对 STEP 调 `compareStepFiles(ref, cand, { linearTolerance: 1e-3, ... })`，单一逐位通道；`--only` 会覆写 `out/report.json`（R7） |
| `@faicad/cq-compat-compare` | `compareStepFiles`（几何逐位）+ `assembly-compare.js` 的四级装配比较（结构/位姿/部件几何/融合布尔），**无位姿规范判等模式**；`AssemblyCompareOptions` 已有 `pairing`/`skipFusedBoolean` 等选项，扩展点成熟 |
| manifest | `blocked` 条目有 `blockedBy` + reason；无 poseMode 字段 |

### 2.3 受益集合（9 条 `op:assembly-solve` 的欠定族定性）

| 用例 | 欠定自由度 | 判据 |
| --- | --- | --- |
| `test_unary_constraints__{simple_assy2,assy,w}` | **1**（b2 绕 (0,1,1) 扭转） | 12 DOF − Fixed 6 − FixedPoint 3 − FixedAxis 2 = 1（实验判死，probe 可复跑） |
| `test_constrain__simple_assy` / `__subassy1/2` | 待验（疑似同族：ref 解带非极小扭转残差） | P4 对拍：b2 z[-0.074,1.074] 非 ±0.5/±1.5 |
| `test_constrain__nested_assy` | 非 DOF 问题（recompose 丢 1 solid） | **不属本计划**，单列 |
| `PointInPlane` ×2 | 非 DOF 问题（comparator vertex 家族） | 不属本计划 |

## 3. 分阶段开发批次

批次纪律：每阶段独立 commit、独立可停；D1/D2 在 faijs 仓实施前，先在本仓建**适配层探测测试**钉住当前行为（内核升级先红）。

### D1 · faijs：`solveGlobal` 真实 DOF 上报（跨仓 PR）

| 序 | 项 | 判据 |
| --- | --- | --- |
| D1-1 | `termResidual` 增配 `residualDim(t)` 纯函数：point/axis val=0 → 3；val=π/其他 → 1；point_in_plane → 1；point_on_line → 3/1；penalty 行 → freeIdx×6 | 单测：每类 term 的维数表逐项断言 |
| D1-2 | LM 收敛后算**有效秩**：对最终雅可比 `J`（数值雅可比已存在）做奇异值阈值判定（σ > σ_max·1e-8），`dof = n − rank(J)`；退化保护：`J` 奇异 → fallback 到 D1-1 的解析维数和 | `unary_constraints` 场景返回 `dof: 1`；适定场景（point_on_line 镜像）返回 `dof: 0` |
| D1-3 | 返回结构增 `underdetermined: { dof: number, freeDirs?: ... }`（暂只 dof 数字 + 保留 `dof` 字段语义不变防破坏既有消费方）；`solve-tree` 透传 | 既有 faijs 单测零回归；snapshot 无意外字段 |
| D1-4 | （可选，二期）freeDir 方向向量输出：欠定方向 = `J` 零空间最小奇异值对应的右奇异向量，规范化后随结果返回——D4 规范化投影的输入 | 验证 unary 场景 freeDir ≈ 绕 (0,1,1) 的扭转生成元（与轴夹角 < 1e-6） |

- **风险**：改 faijs 求解器属全局性行为面 → 遵守共享环境铁律：PR 前先跑 faijs 全量装配单测；本仓侧 peer 升级后必须重跑 N0-3 全量重扫（R2）。
- **落点**：faijs 仓 PR + 本仓登记（N6 跨仓清单）。

### D2 · 本仓：dof 透传与 dof 探针测试（可先做，D1 未合时用探测钉现状）

| 序 | 项 | 判据 |
| --- | --- | --- |
| D2-1 | `src/assembly/assembly.ts` 扁平/树两分支透传 `result.dof` / `underdetermined` 到 `CqAssembly.dof`（替换假语义），JSDoc 写明「dof > 0 = 欠定位姿，逐位不可达」 | typecheck 绿；既有 36 装配用例零回归 |
| D2-2 | `src/assembly-dof.test.ts` 探针测试：① unary 场景断言 `dof === 1`（D1 合入前先断言现状 `0` 并 TODO 注明，D1 合入即翻）② point_on_line 镜像场景断言 `dof === 0` | 两条探针 + 变异（去掉 FixedAxis ⇒ dof 变化） |
| D2-3 | `tests/gen-manifest.ts`：manifest 条目允许 `poseMode: 'canonical-pose' | 'bitwise'`，默认 bitwise（完全向后兼容） | gen-manifest 重扫 diff 为空（无 poseMode 条目时） |

### D3 · cq-compat-compare：规范判等通道（跨仓 PR）

| 序 | 项 | 判据 |
| --- | --- | --- |
| D3-1 | `AssemblyCompareOptions` 增 `poseMode?: 'bitwise'（默认） | 'canonical-pose'` 与 `canonicalFreeAxis?: [x,y,z]`（欠定轴；D1-4 的 freeDir 可直接喂入） | 类型面 diff 审查 |
| D3-2 | `canonical-pose` 判等实现：per-part 位姿比对前，把两侧解各自绕 freeAxis 的扭转分量投影到**最小角规范代表**（Rodrigues 分解 → 剥离轴平行分量 → 重组），再走既有 1e-3 逐位；平移/受约束旋转/体积/拓扑**仍逐位**（不变量不放松） | 单元测试：同一约束集的两个合法解（CQ 实测四元数 vs faijs 实测四元数）规范化后逐位 PASS；故意扰动受约束自由度 ⇒ FAIL |
| D3-3 | 结果结构标注 `poseMode: 'canonical-pose'` + 剥离的扭转角数值（审计信息） | report 里可见，防「静默放松」 |

### D4 · 本仓：管线接线 + 翻三条

| 序 | 项 | 判据 |
| --- | --- | --- |
| D4-1 | `tests/compare.ts` 增路由：manifest 条目 `poseMode === 'canonical-pose'` 且比较器支持该模式 → 传 `poseMode + canonicalFreeAxis`；比较器不支持（旧版本）→ 显式 ERROR 并提示升级，**不许静默回落 bitwise** | `--only unary_constraints` 走新通道；R7：跑前备份 report |
| D4-2 | 三条 `unary_constraints` 镜像重导 + compare：体积/拓扑逐位、规范位姿逐位 → PASS | cen/bbox（规范化后）< 1e-3；拓扑 `f12/e24/v16` 同 |
| D4-3 | `mark-blocked.ts` 删 unary 三条 BY_KEY（保留判死实验注释作为规范通道的依据引用）→ `gen-manifest` 重扫 → **579 → 582 ported** | manifest 三条 status=ported + `poseMode: 'canonical-pose'` 注记 |
| D4-4 | 变异测试扩展：`assembly-n3-mutation.test.ts` 增「规范通道判定」组——规范化后剥离扭转的两个合法解 PASS、扰动受约束 DOF（改 FixedPoint 目标）FAIL | 变异全红→绿对齐 |
| D4-5 | subassy ×2 的 DOF 复核：用 D1 的 dof 输出实测这两条是否欠定（P4 疑似但未定）→ 是则同批翻，否则留 blocked 并回写 P4 快照定性 | dof 实测值落档 |

### D5 · 收尾

- N0-3 全量重扫（**硬前置于宣布任何零回归**——本计划动了 faijs peer）：`npm run build → run-cand → compare`，与既有基线做集合 diff，新红逐条归因。
- 文档回写：本计划 D 阶段落点 + `2026-10-10-cadquery-next-phase-plan.md` §3.5 分类更新（B 余 9 → 6/4，视 D4-5 结果）。
- N6 跨仓清单登记：faijs PR 链接、cq-compat-compare PR 链接、X-2/X-5 关闭与否。

## 4. 验收判据（硬门禁）

1. **零回归**：D2 合入后 36 装配用例绿；D5 全量重扫 PASS 集合与基线 diff 只有「新增绿」。
2. **翻 ported 三条件**：镜像存在 + 规范通道逐位（不变量仍严） + 变异测试（D4-4）。
3. **不松容差**：`linearTolerance` 保持 1e-3；规范通道只对「证明欠定的自由度」豁免，且每条豁免挂着 manifest reason + 审计字段（D3-3）。
4. **可判定性**：比较器旧版本下管线显式报错（D4-1），杜绝静默走错通道。
5. **跨仓纪律**：faijs/cq-compat-compare 的 PR 只动列出的函数面；共享环境操作先查进程再动手（2026-09-29 铁律）。

## 5. 风险与守卫

| # | 风险 | 守卫 |
| --- | --- | --- |
| R-a | `rank(J)` 数值判定在病态雅可比上抖动（时而 1 时而 0） | 奇异值阈值取 σ_max·1e-8 并 fallback 解析维数和；D2-2 探针钉两条边界用例 |
| R-b | 规范化投影对「freeAxis 不准」敏感（freeDir 偏 1e-3 → 剥离不净） | D1-4 freeDir 与解析轴对拍断言 < 1e-6；D3-2 单测用解析轴 |
| R-c | faijs peer 升级单方面改写 PASS 集合（R2 惯犯） | D1 PR 合入 → 本仓立即 N0-3 重扫；`src/adapters/faijs.ts` 单点收口 |
| R-d | `dof` 字段语义变更破坏既有消费方（assembly op / gear harness） | D1-3 保留旧 `dof` 字段、新增 `underdetermined`；faijs 全量单测 + 本仓 36 用例双门禁 |
| R-e | 规范通道被滥用（把适定用例也标 canonical-pose 躲判等） | manifest `poseMode` 必须挂 DOF 取证 reason；D4-5 复核制度；review 时查 DOF 验算 |

## 6. 工作量与顺序

- D2（1 天内）：本仓独立可交付，D1 未合时以探针钉现状。
- D1 + D3（各 1–2 天，两仓可并行）：faijs 求解器侧与比较器侧无依赖。
- D4（1 天）：依赖 D1+D3 合入。
- D5（重扫 ~1h + 归因半天）。

关键路径：D1 → D4；D3 → D4。D2 与 D5 的重扫部分可随时插入。
