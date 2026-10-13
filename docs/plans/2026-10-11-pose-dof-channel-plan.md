# P7 · 求解器 DOF 诊断 + 欠定位姿规范判等通道（方案 3 · 源码取证修订版 v2）

- 日期：2026-10-11（v2：全部改动面改按 `../faijs` **源码仓**取证重写，v1 的 dist 推断作废）
- 状态：**实施中——D1/D2/D3/D4 已落地（tgz 直装验证），D5 待办**
- 仓库分工：**`../faijs`**（packages/core + packages/cq-compat-compare，D1/D3 同仓两包）+ **本仓** faijs-cadquery（D2/D4/D5）
- 前置取证：`docs/plans/2026-10-10-cadquery-next-phase-plan.md` 2026-10-11 快照（unary ×3 收敛对齐判死）、`tests/ref-harness/lm-convergence-probe.mjs`、`tests/mark-blocked.ts` UNREACHABLE reason

---

## 0. 一句话

`FixedAxis` 等欠定约束的终态位姿由优化器轨迹决定、无唯一「正确解」，逐位判等结构性不可达；本计划打通「faijs 求解器如实上报剩余自由度 → cq-compat-compare 新增只优化欠定自由度的规范判等通道 → 本仓管线按 DOF 路由」，让 unary ×3（潜在 subassy ×2）在**不松全局容差**（R3）的前提下翻 ported。

## 1. 为什么是方案 3

| 方案 | 机制 | 问题 |
| --- | --- | --- |
| 1 人工声明路由 | manifest 逐用例标 poseMode | 靠人眼，新用例无人分析即误判 |
| 2 比较器算 DOF/秩 | compare 侧从约束元数据推 | 需把约束集传进比较器，接口重；比较器拿不到雅可比 |
| **3 求解器上报（本计划）** | `solveGlobal` 运行时本就持有 terms/J，顺手算剩余 DOF | 需改 faijs——但这是**信息源头**，且对齐 CQ 上游 solve result 的 DOF 语义 |

## 2. 源码取证（v2 · 全部钉到 ../faijs 源文件与行号）

### 2.1 `packages/core/src/api/assembly/solvers/global-solver.ts`

| 事实 | 位置 | 对本计划的意义 |
| --- | --- | --- |
| `LM_TOL_OBJ=1e-12 / LM_TOL_STEP=1e-10 / LM_LAMBDA0=1e-3 / R_INIT=1e-2 / PENALTY=1e-16` | :49-54 | 收敛参数与 CQ 对拍结论一致（初值同源），**不动** |
| 初值装配 `x[6k+3..5] = R_INIT` | :375-377 | 不动 |
| `termResidual(t, sa, sb, scale)` 单一代入点产出残差向量 | :122（调用 :394 数值雅可比、:483 目标评估） | D1-1 在此旁加 `residualDim(t)`；每类 fn 的维数表需对着 :122 函数体逐项验证 |
| 数值雅可比 → `JtJ`（n×n 正规矩阵，n = 6×freeCount）→ `solveDampedNormal(JtJ, negJtr, n, lambda)` | :394-440 | D1-2 的秩分析输入就是 `JtJ`（小矩阵，特征分解即可），**无需新算 J** |
| **返回 `{ transforms, dof: 0, converged: true, unsupported, residuals, warnings }` —— dof 硬编码 0** | :494-499 | D1 的核心改动点 |

**⚠ v1 计划的数学错误修正（rank(J) 虚满秩）**：`PENALTY=1e-16`（sqrt=1e-8）给每个自由变量加 6 行正则残差，这让 JtJ **技术上满秩**——正则化项不是约束。D1-2 的秩判定必须**剔除 penalty 行**后按 `λ_max·1e-8` 阈值数特征值，否则任何欠定问题都会算出 dof=0。验算（unary）：变量 6（仅 b2）+ FixedPoint 3 维 + FixedAxis 3 维 = 9 行非 penalty 残差，rank 5（绕 (0,1,1) 扭转方向零空间）→ dof = 6−5 = **1** ✓。

### 2.2 `packages/core/src/api/assembly/solve-tree.ts`

| 事实 | 位置 | 意义 |
| --- | --- | --- |
| 无约束早退 `return { transforms: {}, converged: true, unsupported: [], residuals: [] }` | :134 | 需补 `dof: 0` |
| 终返回**重建对象**（非 spread）：`return { transforms, converged: result.converged, ... }` | :172-174 | **dof 不会自动透传**——D1-3 必须在此显式加 `dof: result.dof`，否则树模式（test_constrain 系列）拿不到 |
| 类型注释「与 AssemblySolveResult 对齐的字段集，但新增 residuals」 | `solvers/types.ts:39` | D1-3 同步扩 `solvers/types.ts` 与 `api/assembly/solve.ts:27` 的 `AssemblySolveResult` |

### 2.3 `packages/cq-compat-compare/src/`（判卷人，同在 faijs 仓）

| 事实 | 位置 | 意义 |
| --- | --- | --- |
| `compareStepFiles(fileA, fileB, options)`：bbox → 拓扑 → 体积/COM/布尔差 的**单一逐位通道**；Buffer 精确拷贝后 `kernel.importStep` | `step-compare.ts:107-170` | D3-1 扩 `CompareOptions`；D3-2 在 bbox/布尔计算前做规范化 |
| 关键观察：**COM 与体积对刚体旋转不变**，bbox 与布尔差对旋转敏感 | 同上 | unary 两解的 COM 恒等（(0,0,-3)）、体积恒等，只有 bbox/布尔不同 → 规范通道可以「不变量照旧逐位 + 仅对旋转敏感量在欠定方向上优化后判等」，语义精确 |
| `AssemblyCompareOptions`：`pairing`（:48）/`skipFusedBoolean`（:57）/`matchNames` 扩展点成熟；装配位姿比对是 **COM/bbox-center 级**（无旋转矩阵比对） | `assembly-compare.ts:23-57,188-240` | v1 说「位姿=旋转矩阵」不准确；装配通道现成的 per-part 比对以质心为主，D3 若走装配通道反而**天然兼容欠定旋转**，但本仓 compare.ts 现走的是 step-compare 通道 → D3 主改 step-compare，装配通道列为二选一备选 |

### 2.4 本仓消费链（faijs-cadquery）

| 事实 | 位置 | 意义 |
| --- | --- | --- |
| `CqAssembly.solve()` 假语义：`this.dof = result.converged ? 0 : -1` | `src/assembly/assembly.ts` 扁平/树两分支 | D2-1 改为消费真实 `result.dof` |
| `tests/compare.ts` 以 `linearTolerance: 1e-3` 等调 `compareStepFiles`；`--only` 覆写 `out/report.json`（R7） | `tests/compare.ts` | D4-1 路由层；跑前备份 report |
| peer：`@faicad/faijs@0.31.2` | `package.json` | D5 peer 升级 + N0-3 重扫（R2） |

## 3. 分阶段批次（两仓联动）

批次纪律：每批独立 commit、独立可停；**faijs 侧改动只动列出的函数面**，改前跑 faijs 仓全量装配单测；本仓侧 D2 先落「探测测试」钉现状，faijs 合入后即翻。

### D1 · faijs/packages/core：真实 DOF 上报

| 序 | 项 | 钉点 | 判据 |
| --- | --- | --- | --- |
| D1-1 | `residualDim(t)`：从 `termResidual`（:122）函数体提取每类 fn×val 的残差维数表 | global-solver.ts:122 旁 | 单测逐项断言维数表；与 :122 实现一一对应 |
| D1-2 | LM 收敛后对**剔除 penalty 行**的残差集重算正规矩阵 `JᵀJ_c`，对称特征分解，rank = #{λ > λ_max·1e-8}，`dof = n − rank`；退化 fallback：特征分解失败 → 用 D1-1 解析维数和 | :440-499 区间（`solveDampedNormal` 之后、return 之前） | unary 场景 dof=1；point_on_line 镜像场景 dof=0（本仓 D2-2 探针双验） |
| D1-3 | 返回结构增 `underdetermined?: { dof: number }`（**保留旧 `dof: 0` 字段不动**，防破坏既有消费方）；`solve-tree.ts:134/172` 两处显式透传 | :494-499 + solve-tree.ts:134,172-174 + types.ts:39 + solve.ts:27 | faijs 全量装配单测零回归；snapshot 无意外字段 |
| D1-4（二期可选） | 欠定方向 freeDir：`JᵀJ_c` 零空间特征向量（规范化），供 D3 免声明轴 | 同 D1-2 | unary 场景 freeDir 与 (0,1,1)/√2 夹角 < 1e-6 |

- **跨仓纪律**：faijs 仓开发文档不写入（本计划只落本仓 docs/plans/）；版本号/发布类操作先问用户；动 faijs 工作区前查有无其它进程（2026-09-29 铁律）。

### D2 · 本仓：dof 消费 + 探针测试（可立即开工，不依赖 D1）

| 序 | 项 | 判据 |
| --- | --- | --- |
| D2-1 | `assembly.ts` 两分支消费 `result.underdetermined?.dof`（D1 未合时字段不存在 → 维持现状 0，用可选链兼容，合入即生效） | typecheck 绿；36 装配用例零回归 |
| D2-2 | `src/assembly-dof.test.ts`：① unary 场景 `expect(asm.underdetermined?.dof ?? 0).toBe(1)`（D1 前先 `.toBe(0)` + TODO，D1 合入翻断言）② point_on_line 镜像场景 dof=0 ③ 变异：去掉 FixedAxis ⇒ dof 由 1 → 0 | 三条探针全绿；变异翻红→绿 |
| D2-3 | `tests/gen-manifest.ts` 支持 `poseMode: 'canonical-pose' | 'bitwise'`（默认 bitwise）与 `poseFreeAxis?: [number,number,number]`；unary 三条 manifest 条目预写 poseMode+axis=(0,1,1)+DOF 取证 reason 引用 | 无 poseMode 条目时重扫 diff 为空（向后兼容） |

### D3 · faijs/packages/cq-compat-compare：规范判等通道

| 序 | 项 | 钉点 | 判据 |
| --- | --- | --- | --- |
| D3-1 | `CompareOptions` 增 `poseMode?: 'bitwise'（默认） \| 'canonical-pose'` 与 `canonicalFreeAxis?: Vec3` | step-compare.ts `CompareOptions` 定义处 | 类型面 diff 审查；默认行为逐字节不变 |
| D3-2 | canonical-pose 实现（贴源码事实的**最小角优化**方案）：① 不变量照旧逐位——拓扑/体积/COM 沿用现有分支（:145-170）不放松；② 旋转敏感量（bbox、布尔差）改为「对两侧形状各自绕 `canonicalFreeAxis` 扫描角 θ∈[0,2π)（步长网格 + 黄金分割细化），取差异最小点」；③ PASS ⇔ min_θ 差 ≤ 既有容差 | step-compare.ts:128-170 的 bbox/布尔段；需 kernel 的形状旋转 API（gp_Trsf），**若 occt-wasm 绑定缺 rotate 则先补绑定并按 occt-wasm 5.6「类型面先行声明」教训跑 Python 捕获验证运行时真值** | 单测：CQ 实测四元数解 vs faijs 实测四元数解（同一约束集两合法解）→ PASS；扰动受约束自由度（改 FixedPoint 目标）→ FAIL；θ 扫描确定性（同输入同输出） |
| D3-3 | 结果增审计字段 `poseMode` + `canonicalTwistAngle`（被优化掉的扭转角） | `StepCompareResult` | report 可见，防静默放松；旧行为下字段缺省 |

### D4 · 本仓：管线接线 + 翻三条

| 序 | 项 | 判据 |
| --- | --- | --- |
| D4-1 | `compare.ts` 路由：manifest `poseMode==='canonical-pose'` → 传新 options；**比较器版本不支持（options 被忽略/报未知参数）→ 显式 ERROR 提示升级，禁止静默回落 bitwise**（探测方式：对已知「规范可过/逐位必挂」的哨兵对跑一次自检） | 哨兵自检进 `npm run compat:report` 前置；R7 备份 report |
| D4-2 | unary ×3 镜像重导 + compare → PASS | 体积/拓扑/COM 逐位；bbox(规范后) < 1e-3；拓扑 `f12/e24/v16` 同 |
| D4-3 | `mark-blocked.ts` 删 unary 三条 BY_KEY（保留判死实验注释，注明由 P7 规范通道解锁）→ gen-manifest 重扫 → 579 → 582 | 三条 status=ported |
| D4-4 | `assembly-n3-mutation.test.ts` 增规范通道组：两合法解 PASS / 扰动受约束 DOF FAIL | 变异全绿 |
| D4-5 | subassy ×2 复核：用 D1 dof 输出实测是否欠定 → 是则同批翻（镜像微调帧），否则留 blocked 回写 P4 | dof 实测值落档 |

### D5 · 收尾

- faijs 版本发布（**先问用户**）→ 本仓 peer 升级 → `npm install`（共享环境纪律：查进程、获批准）→ **N0-3 全量重扫**（硬前置）→ 与基线集合 diff，新红逐条归因。
- 文档回写：本计划各批次落点 + `2026-10-10-cadquery-next-phase-plan.md` §3.5 分类（B 余 9 → 6 或 4）。
- faijs 侧 PR 链接 + X-2（判卷人不可自改）关闭记录登记进 N6 跨仓清单。

## 4. 验收硬门禁

1. **零回归**：D1 后 faijs 全量装配单测绿；D2 后本仓 36 装配用例绿；D5 全量重扫 PASS 集合与基线 diff 只有「新增绿」。
2. **翻 ported 三条件**：镜像存在 + 规范通道判等（不变量仍逐位）+ 变异测试（D2-2③/D4-4）。
3. **不松容差**：`linearTolerance` 保持 1e-3；豁免仅作用于「D1-2 证明 dof>0 的自由度」，每条豁免挂 manifest DOF 取证 reason + `canonicalTwistAngle` 审计字段。
4. **可判定性**：比较器旧版本下显式报错（D4-1 哨兵自检），杜绝静默走错通道。
5. **两仓纪律**：faijs 改动面 = global-solver.ts(:122,440-499) + solve-tree.ts(:134,172) + types/solve 类型 + step-compare.ts(CompareOptions,bbox/布尔段) + StepCompareResult；其余一概不动；faijs 仓不落开发文档。

## 5. 风险与守卫

| # | 风险 | 守卫 |
| --- | --- | --- |
| R-a | penalty 行污染秩判定 → 永远 dof=0 | **剔除 penalty 行后再算秩**（§2.1 修正项）；D2-2 探针钉 dof=1/dof=0 双边界 |
| R-b | 特征分解阈值 1e-8 在病态 JᵀJ 上抖动 | fallback 解析维数和（D1-1）；阈值落常量并单测两条边界 |
| R-c | kernel 缺形状旋转 API / occt-wasm 5.6 类型面先行声明（d.ts 有、运行时 no-op） | D3-2 前置 Python 捕获验证 rotate 真值（memory 教训）；缺则先补绑定 |
| R-d | faijs peer 升级单方面改写 PASS 集合（R2 惯犯） | D5 重扫硬前置；`src/adapters/faijs.ts` 单点收口 |
| R-e | `dof` 字段语义变更破坏既有消费方 | D1-3 保留旧字段、新增 `underdetermined`；双仓单测门禁 |
| R-f | 规范通道被滥用（适定用例标 canonical-pose 躲判等） | poseMode 必须挂 DOF 取证 reason；D4-5 复核；review 查 DOF 验算 |
| R-g | θ 扫描漏掉非凸差异最小点 | 网格 64 步 + 黄金分割细化；单测断言确定性 |

## 6. 工作量与关键路径

> **D4 实施落点（2026-10-11）**：D1–D4 全部落地。faijs core `5dd2ed33`（dof 诊断）→ cq-compat-compare `a4372c15`（canonical-pose 通道）+ `3dbf62c5`（**逐成员对齐修正**：整 compound 刚体扭转吸收不了成员级欠定扭转——COM 枢轴残差 2.4e-3、锚点枢轴会搬动 b1，必须拆 solids 按成员绕自身 COM 扫描，收敛到 ~1e-9）；本仓 `f78f3dc`（D2 透传+探针）→ `4a7192e`（tgz 直装验证 unary dof=1）→ `eadd677`（D4 路由+manifest 注记，**579→582 ported / 60 blocked**）。验证方式：faijs core/cq-compat-compare tgz 双包装 `npm install --no-save`（版本号未动，正式发布走 set-version 流程待批）。D4-4（变异测试扩展）与 D4-5（subassy ×2 复核）与 D5（N0-3 全量重扫）未做。
>
> **D4-4/D4-5 落点（2026-10-11 补）**：D4-4 已落地（本仓 `704cf62`：镜像级规范通道方向变异 10/10 绿——合法解 B 扭 40° canonical PASS/bitwise FAIL、FixedPoint 扰 0.5mm canonical 也 FAIL；GOTCHA：`toCompound()` 是 mesh 级 CompoundShape，brepOf 不适用，BREP 句柄直接取 solve() 烘焙后的成员 Shape）。D4-5 复核结论（探针 `.tmp-p7/probe-subassy-dof.mts` 实测）：**test_constrain 树模式约束集欠定 `underdetermined.dof=2`**（converged、unsupported 空）——与 P4 期「ref 解带非极小扭转残差」的观察一致，属欠定族而非帧缺口；但 dof=2 意味着自由方向有两个（Plane+Axis+Point 对三个嵌套成员的残余），**翻 ported 需先确定两个自由方向对应的轴/枢轴注记**，且 ref 侧欠定扭转幅度更大（b2 y/z ±0.074），canonical 扫描能否收敛到 1e-3 内待验证——维持 blocked，解锁路径与 unary 同（轴注记 → 重导 → compare 实证），不冒充。
>
> **小样本复测归因（2026-10-12，用户批准 ≤60 条替代全量）**：装配域 57 条重导（constrain 19 + point 9 + fixed 3 + assembly 26 + toCompound 10）0 失败；compare 全量判卷 PASS=538/PASS-NT=21/FAIL=23/ERROR=3。逐条定性（与 manifest status 交叉 + 镜像源码核对）：① toCompound ×4 FAIL——镜像为纯 `cq.compound` 导出**不经求解器**（P7 改动面不触达），且旧候选（tgz 前）与新候选 FAIL 特征逐位相同 ⇒ **先存，非本次引入**；② ERROR ×3 PointInPlane（`cut: boolean operation failed`）——manifest 本就 blocked（顶点退化家族）⇒ 先存；③ FAIL test_constrain ×4——blocked（欠定 dof=2 已落档）⇒ 从未 PASS；④ test_infinite_face FAIL——体积/质心/bbox/拓扑全逐位一致（1e-18）仅布尔差非零 ⇒ 顶点退化家族比较器布尔工件。**结论：tgz 直装态下装配域零回归**。附带发现：registry `@faicad/faijs@0.32.3` 官方 dist 缺 `solve-tree.js`（镜像无法运行）——registry 版自身损坏，A/B 无对照意义，tgz 直装态是当前唯一可用态；全量 N0-3 重扫仍待用户批准。
>
> **N0-3 全量重扫结论（2026-10-12，用户批准）**：run-cand 全量 602 条 → 555 导出 / 38 失败（无 TIMEOUT/崩溃；38 条全为宿主 CLI 导出限制类：2D 无 solid ~29、compound 无 mesh ~4、face-only 等，与 P7 改动面无关）。compare 全量判卷 PASS=519/PASS-NT=14/FAIL=18/ERROR=3/BLOCKED=99/parity=82.00%。与基线集合 diff（按 manifest status 交叉）：21 条 FAIL/ERROR 中 **7 blocked**（constrain ×4 欠定族已终局定性 + PointInPlane ×3 顶点退化家族）、**7 ported**（toCompound ×4 + infinite_face + draft ×2）——与重扫前小样本基线的 FAIL 集合**逐条吻合、数值逐位相同**（draft bbox 0.087/0、toCompound 4mm 级、infinite_face 布尔工件）⇒ **零新回归**；7 条 none 为键映射的类前缀格式（testGlue/testParametricCurve/testText/testWorkplaneCenterMove），核实均在 manifest 中为 ported 且 FAIL 特征与基线相同（文本/参数曲线家族，先存）。**N0-3 终局：0.33.2 发版 dist 下全量零回归，P7 改动面（D1 求解器 + D3 判卷人 + D2/D4 接线）未引入任何新红。**
>
> **constrain ×3 嵌套帧调查（2026-10-12 第二轮，修正前定性）**：取证 solve-tree.ts 全文（flatten → solveGlobal(identity 初值) → recompose(parentPose ∘ solverPose)）+ 归因探针实测。**关键证据：subassy1.b2 的 cand loc (-1,0.5,0.5) 与 CQ ref 断言逐位一致**——求解器、约束映射、树模式嵌套帧变换全部正确，前轮「位姿差不在欠定流形上」的定性**部分修正**：① subassy1 的 ref/cand 差异实为自由扭转代表点选择（ref 轨迹噪声 bbox ±0.074 vs cand penalty 钉在 ~0），**在流形上**；canonical compare 残差 0.035 应为扫描收敛精度问题（golden-section 细化或步长网格），非语义缺口——有希望修比较器扫描后翻 ported；② subassy2/simple_assy 的 2.5mm 级平移差仍待 ref 侧 b3 数值对拍定性（b3 是双 solid compound，怀疑与比较器逐 solid 配对扫描破坏刚体关系有关）。下一步：比较器扫描收敛精度专项（修好可先翻 subassy1）。

- D2（≤1 天）：本仓独立交付，探针先钉现状。
- D1 + D3（faijs 仓，各 1-2 天，两包可并行 PR）：D1 动 core 求解器，D3 动判卷人——**同仓两包，一次版本发布承载**。
- D4（1 天）：依赖 D1+D3 合入 + 版本发布。
- D5（重扫 ~1h + 归因半天；发布需用户批准）。

关键路径：D1 →（发布）→ D4；D3 → D4；D2 与 D5 重扫可随时插入。
