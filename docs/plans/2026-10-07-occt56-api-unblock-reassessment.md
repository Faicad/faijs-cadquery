# occt-wasm@5.6.0 API 接入后的 blocked 重估与解锁开发方案

- 日期：2026-10-07
- 仓库：`D:\Faicad\faijs-cadquery`（本仓，目标侧）
- 输入文档：`docs/plans/2026-10-06-occt-wasm-extension-plan.md`（下称「扩展方案」）
- 对拍对象：**`node_modules/occt-wasm@5.6.0`**（`dist/index.d.ts` / `dist/types.d.ts`，npm 实际装载版）
- 触发事件：`../faijs` 于 2026-10-07 发布 **0.30.7 / 0.30.8**，把一批 occt-wasm 原生能力接入脚本面与实现面

---

## 0. 一句话结论

> 扩展方案 §2.2 判定的「A 桶确证绑定缺口 48 条」，其前提是**本地 `occt-wasm` clone 停在 v5.3.5 的 façade 源码**。
> 但本仓 peer 的是 **npm 5.6.0**，其中 `shell` / `sweepFull` / `toBREPBinary` 等通道**已经绑定**（扩展方案漏看参数面）。
> 实测确认 **12 条已可解**（`hollow-intersection-join` 2 条逐位命中上游 0.584），**10 条待探针**（sew/sweep-aux/offset2D），
> 其余 **77 条确属真绑定缺口**（扩展方案 W1–W5 的 48 条 A 桶全部在内，**不受本次 API 接入影响**）。

**本轮定性与 M-1/M-2/M-3 同类**：扩展方案对 npm 5.6.0 的参数面过期，不是新算法缺口。

> **进度（2026-10-07 夜）**：T1（shell joinType + 正厚度）已落地，6 条翻 ported
> （`test_hollow__res2`、`test_hollow_open__res2`、`testSimpleShell__s1/s2/s3`、`testLegoBrick__s`）；
> T2-a（`importBin` 二进制 BREP 通道）已落地，2 条翻 ported；
> T2-b（assembly 导出 3 条）已落地，3 条翻 ported；blocked 99 → **88**。
> T4（aux-spine 探针）已判为**负结论**：`sweepFull` 与 `sweepAdvanced` 逐位相同，CE=true 仍差 −12.163%，
> 7 条维持 blocked（已冻结为测试）。`testLegoBrick__tmp` 也已补齐镜像（`op:shell` 标签清空）。
> 本轮可解项（U1–U6）至此全部处置完毕：blocked **99 → 87**。
>
> **续 §3.2（2026-10-08 晨）**：`remove` 的 sew 子集先行判过 —— `test_sewing__sh` 翻 ported
> （新增 `shellFromFaces`，f5/e12/v8 逐位命中），`test_sewing__res3` 维持 block 但理由换成
> `export:free-face-in-compound`（sewing 本身已逐位对，STEP 写出丢散面），见 `### 3.2.1`。
> blocked **87 → 86**，ported 555 → 556。
>
> **T2-a 落地形态**：`src/workplane.ts` 新增 `exportBrep/importBrep`（文本）与 `exportBin/importBin`（二进制），
> 经 `src/index.ts` 导出。DEVIATION：上游这四个方法收/写 file-like 对象，而 .fai.js 镜像面无文件 IO，
> 故改为内存字节/字符串载体（内核侧同为 OCCT `BRepTools` 读写，语义一致）。单测 `src/brep-io.test.ts` 冻结。

---

## 1. 事实基线（全部实测）

### 1.1 本仓当前口径

| 项 | 值 | 来源 |
|---|---|---|
| `tests/manifest.json` blocked | **99**（41 标签） | `node` 聚合（本轮重跑，与扩展方案 §2.7 的 99 一致） |
| 本仓 occt-wasm | **5.6.0** | `require('./node_modules/occt-wasm/package.json').version` |
| 本仓 `@faicad/faijs` | **0.29.5**（未含今日新 op） | `require('./node_modules/@faicad/faijs/package.json').version` |
| peerDependencies | `@faicad/faijs ^0.29.0`、`occt-wasm ^5.6.0` | `package.json` |

> **前置动作**：要吃到 0.30.7/0.30.8 的接入成果，`@faicad/faijs` 必须升到 `^0.30.8`（`^0.29.0` 的语义上限是 `<0.30.0`，装不到）。本仓是**直调 occt-wasm** 的架构（`src/workplane.ts` 全程 `getKernel()`），因此升级 faijs **不是硬前置**——下列多数改造可直接对 5.6.0 内核落地；faijs 的接入在本方案中的角色是**参考实现与语义取证**。

### 1.2 faijs 0.30.7 / 0.30.8 接入的 occt-wasm 能力

来源提交：`d0618a64`（0.30.7 surface + 覆盖率扫描）、`7e203933`（0.30.8 S3 P0 ops）。

| faijs 落点 | 直调的 occt-wasm 原生方法 | 关键新增字段/形态 |
|---|---|---|
| `sweep` op（扩展） | **`sweepFull(profile, spine, options?)`** | `orientation` / `up` / `auxSpine` / `curvilinearEquivalence` / `guideContact` / `transitionMode` / `support` / `maxDegree` / `maxSegments` / `law` / `lawLength` / `lawEndFactor` / `tol3d` / `boundTol` / `tolAngular` |
| `helix` op（扩展） | `makeHelixWireHanded(..., leftHanded?)` | `handed: 'right' \| 'left'` |
| `offset2d` op | `offsetWire2D(wire, offset, joinType?)` | 2D 轮廓偏置 |
| `solidFromFaces` op | `buildSolidFromFaces(faces, tolerance?)` | 面集一次成型 |
| `halfSpace` op | `halfSpace(origin, normal)` | 无界布尔工具 |
| `exportBrep` op | `toBREP(shape)` | BREP 文本导出 |
| `exportStl` op | 无（中立：只序列化 Shape mesh） | — |
| `surface` op（0.30.7） | `bsplineSurface(controlPoints, rows, cols)` | 控制点阵 → B 样条面 |

对应 occt-wasm 5.6.0 声明位置：`dist/index.d.ts` 的 `sweepFull:228`、`makeHelixWireHanded:250`、`offsetWire2D:568`、`buildSolidFromFaces:259`、`halfSpace:79`、`toBREP:390`、`bsplineSurface:481`。

---

## 2. 实测探针与结论

探针：`scripts/_analysis/probe-occt56-unblock.mjs`（本轮新建，直调 `occt-wasm`）。原始输出：

```
A box vol=1.0 bb=z[0,1]
A shell(-0.1) joinType=Arc(0):          ok vol=0.5649262499912054 f=23
A shell(-0.1) joinType=Intersection(2): ok vol=0.5840000000000004 f=11
A shell(-0.1) joinType=omitted:         ok vol=0.5649262499912054 f=23
B sweepFull(mode=Auxiliary, CE=true):   THREW: sweepFull: Courbes non jointives
B sweepFull(mode=Auxiliary, CE=false):  THREW: sweepFull: Courbes non jointives
C shell(+0.1) joinType=Arc/Intersection/omitted: ok vol=0.4239999999999998 f=11
D toBREP/fromBREP:       textLen=2470 vol=1.0 f=6
D toBREPBinary/fromBREPBinary present=true
D binary round-trip:     bytes=4494 vol=1.0 f=6
```

### 2.1 结论 A：`shell` 的 joinType **已生效**（确证，逐位）

- `JoinType.Intersection(2)` → **vol 0.584**，与上游 `test_hollow__res2` 的 intersection 真值 **0.584 逐位相等**；`Arc` → 0.565，正是上游 arc 真值。
- 本仓 `src/workplane.ts:5897` 当前调用 `kernel.shell(h, facesToRemove, -thickness, 1e-3)`——**没传第 5 个实参**。`mark-blocked.ts:494-496` 记的「occt-wasm offset is arc-join only」已过期。
- `dist/index.d.ts:172` 明确声明 `shell(solid, facesToRemove, thickness, tolerance, joinType?: JoinType.Arc | JoinType.Intersection)`；内核内部把 Intersection 重编码为 1（错误信息 `joinType must be Arc (0) or Intersection (1)`），wrapper 层传 **2** 即可。

### 2.2 结论 B：`sweepFull` **未**闭合 aux-spine（2026-10-07 已判，负结论）

§2 里最初的自造 geometry 触发 `Courbes non jointives` / `cannot keep the section in contact with the guide wire`——那是**探针输入不合法**（直线 guide 与直线 spine 不相交），不能用作判据。已改用**上游 `testSweep` 的真实几何**重判
（profile rect 10×20；spine spline (0,0,0)→(0,20,100) 切向 +Z；guide spline (0,20,0)→(20,0,100) 切向 +Z），
脚本 `scripts/_analysis/probe-aux-spine-sweepfull.mjs`：

| 调用 | 体积 | 对上游真值 |
|---|---|---|
| `sweepAdvanced(mode=3, aux, CE=true)` | 17759.15746693434 | −12.163% |
| `sweepFull(mode=3, aux, CE=true)` | **17759.15746693434**（与上一行逐位相同） | −12.163% |
| `sweepFull(mode=3, aux, CE=false)` | 20500.444900109196 | == 上游 CE=False 真值 20500.445 |
| `sweepFull(mode=0, Fixed)` | 20500.45513233427 | == 上游 Fixed 真值 20500.455 |

**修正了一条过期论断**：此前记的是「内核 IGNORES `curvilinearEquivalence`」。实测并非忽略——CE=true 与 CE=false 产出不同实体；
只是内核的 CE=true 构造（`GeomFill_GuideTrihedronAC` / `BRepFill_ACRLaw`）与 OCP 的不等价，而 CE=true 恰恰是上游默认走的模式。
⇒ `kernel:sweep-aux-spine-mode`（3 条）与 `kernel:boolean-near-coincident-bspline`（4 条）**维持 blocked**；
`src/workplane.ts` 的 auxSpine 拒绝分支与 `sweep-aux-spine-guard.test.ts` 保留，理由文案已按上述实测改写；
新增 `src/sweep-aux-spine-sweepfull.probe.test.ts` 冻结本次负结论。

### 2.3 结论 C：`shell` 正厚度 + 移除面**不再抛错**（通道确证，真值待对拍）

- 实测 `shell(box,[top],+0.1,1e-3)` → vol 0.424、f11，joinType 三个取值结果一致。
- 本仓 `src/workplane.ts:5906-5917` 对「正厚度 + 移除面」**直接 throw**（上游 `testSimpleShell__s1/s3` 就落在这里）。现在内核支持该路径 ⇒ 应替换为直调，再与上游面数 23/5/6 对拍。

### 2.4 结论 D：BREP 文本/二进制通道**齐备**（确证）

- `toBREP`/`fromBREP`（文本）与 `toBREPBinary`/`fromBREPBinary`（二进制）均存在，round-trip 体积、面数逐位复原。
- 本仓 `mark-blocked.ts:433-438` 的 `export` 与 `importBin` 是**本仓通道缺口**，扩展方案 §2.5 已归类为「与 occt-wasm 无关」，本轮由 5.6.0 + faijs `exportBrep` 补齐取证。

---

## 3. 逐条重估表（99 条 blocked）

### 3.1 已不 block（本轮可翻 ported，共 12 条）

| # | 标签 | 条 | 用例 | 依据 | 落地动作 | 状态 |
|---|---|---|---|---|---|---|
| U1 | `kernel:hollow-intersection-join` | 2 | `test_hollow__res2`、`test_hollow_open__res2` | 探针 A（0.584 逐位） | `shell()` 增加 `joinType` 形参；`hollow` 走 Intersection | ✅ 已翻 ported（f12/e24/v16、f11/e24/v16，vol 差 0） |
| U2 | `importBin` | 2 | `test_bin_import_export__b/r` | 探针 D | 新增 `toBrepBinary`/`fromBrepBinary` 通道 | ✅ 已翻 ported（`exportBin`/`importBin` + 文本 `exportBrep`/`importBrep`；往返 f6/e12/v8、vol 差 0；变异：导出几何改 2³ → r 翻红 vol +700%） |
| U3 | `export` | 3 | `test_native_export__simple_assy`、`test_export_errors__nested_assy`、`test_save_stl_formats__nested_assy_sphere` | 探针 D + faijs `exportBrep`/`exportStl` | assembly 导出补 BREP/STL 分支 | ✅ 已翻 ported（沿用 `test_export`/`test_save_raises` 既有约定：file-exists 断言非 STEP 可观测，镜像只捕获 fixture compound；f24/e48/v32×2、f14/e30/v20，vol 差 0）。**导出格式本身（BREP/STL writer、XCAF-XML）仍是真实值面缺口**，只是不 gate 这三条 |
| U4 | `kernel:shell-intersection-join` | 1 | `testSimpleShell__s2` | 探针 A | 同上 U1，s2 显式 Intersection | ✅ 已翻 ported（f5/e6/v4） |
| U5 | `kernel:shell-outward-opening` | 2 | `testSimpleShell__s1/s3` | 探针 C | 去掉 throw，改直调正厚度 shell，再对拍 | ✅ 已翻 ported（s1 f23/e48/v28、s3 f6/e8/v5） |
| U6 | `op:shell`（lego brick） | 2 | `testLegoBrick__s`、`testLegoBrick__tmp` | 探针 A/C + 上游默认 arc | 先按默认 arc 复跑，失败再试 Intersection | ✅ 两条全翻（`s` f43/e72/v48；`tmp` f71/e114/v76，vol 差 0；变异：去掉 posts 内圈 → +21.6% 翻红） |

> **U1 是本轮唯一「逐位命中」的项**，风险最低，建议第一个翻。U5/U6 通道确证但**上游真值未知**，必须先跑一次 Python 捕获（`C:\Users\ylt\cadquery-env`）冻结面数/体积，再翻。

### 3.2 待探针（通道就绪，结论未定，共 4 类 / 10 条）

| 标签 | 条 | 待判命题 | 探针（**2026-10-07 已判：负，仍 block**） |
|---|---|---|---|
| `kernel:sweep-aux-spine-mode` | 3 | `sweepFull` CE 是否给出上游 20218.347 | ❌ 17759.157（−12.163%，与 sweepAdvanced 逐位相同）→ §2.2 / T4 |
| `kernel:boolean-near-coincident-bspline` | 4 | 若 aux-spine 解则同源解；否则是否需 `law` 驱动 twist | ❌ 不同源；`law` 仅缩放律，twist 需旋转律 → T4-4 |
| `remove`（sew 子集） | 2 | `test_sewing__sh/res3`：`sew`/`sewAndSolidify`/`buildSolidFromFaces` 通道已可用（faijs `solidFromFaces`） | 🟡 **一翻一留**：`sh` ✅ 已翻（新增 `shellFromFaces`，f5/e12/v8 逐位命中）；`res3` ❌ 仍 block，理由已换为非 `remove`（见下 `### 3.2.1`） |
| `op:offset2D-multi-region` | 1 | faijs `offset2d` 只接 `offsetWire2D`，**未提供 MakeOffset2D 多区域语义**（`mark-blocked.ts:337-343`） | ❌ 2026-10-08 复核：装在本仓的 occt-wasm 声明里 2D 侧**只有** `offsetWire2D(wire, offset, joinType?)`（`index.d.ts:568`），没有任何 MakeOffset2D / 多区域 / 自交裁剪通道 ⇒ **仍 block** |

### 3.2.1 `remove`（sew 子集）实测结论（2026-10-07）

新增 `shellFromFaces`（`src/workplane.ts`）实现上游自由函数 `shell(*faces)` 的 `BRepBuilderAPI_Sewing`
重载，与既有的抽壳 `shell()` 分开命名（上游同名分双 policies，本仓不可共用）。

**`test_sewing__sh` 已翻 ported**（`sh = box(1,1,1).remove(face ">Z")`）：ReShape 未绑并不重要 ——
去掉一个面后剩下的 5 个面交给 `kernel.sew`，逐位复得上 ref 的 **f5/e12/v8**（体积差 0）。
变异测试：把被移除的顶面加回去 ⇒ 立刻翻红（f6/e12/v8，vol +25%），证明成件真在数据路径上。

**`test_sewing__res3` 维持 block，但理由换了**：不是 sewing，是 STEP 写出丢面。

| 环节 | 实测 |
|---|---|
| `shellFromFaces(7 面)` 内存结果 | **f7/e16/v12** —— 与上游 res3 逐位一致（已冻结：`src/shell-from-faces.test.ts`） |
| 同一结果导出 STEP | **6 面**（只有那个 6 面闭壳），第 7 面（x+1 位移的帽面）消失 |
| `compound(shell, face)` / `compound(face, shell)` | 两种子序都只写 shell 部分；`compound(face, face)` 则两个面都写 ✅ |

根因：上游 `shell()` 会把 sewing 剩下来的散面用 `TopoDS_Builder.MakeShell + Add` 包成自己的 shell
（`occ_impl/shapes.py`：*for one closed face sewing will not produce a shell, so a special treatment is needed*），
ref STEP 因此有两个 `SHELL_BASED_SURFACE_MODEL`（6+1）。**内核没有这条路**：`sew([face])` 原样返回 `face`
（`getShapeType` = `face`），`buildSolidFromFaces([face])` / `sewAndSolidify([face])` 同样，
`makeSolid(face)` 抛 `TopoDS::Shell`。故新理由记为 `export:free-face-in-compound`（faijs 导出侧，非本轮内核接入面）。

### 3.3 仍 block（真缺口，共 77 条，不受本次 API 接入影响）

按扩展方案 §5 的 W 批次归属（**需改 occt-wasm façade，不在本轮**）：

| 批次 | 标签 | 条 | 真缺口 |
|---|---|---|---|
| W1 | `op:extrude-until-face` 4 + `op:cutBlind.until-face` 3 | 7 | `BRepIntCurveSurface_Inter` 未绑 |
| W2 | `kernel:sweep-multisection-pipe` | 5 | `MakePipeShell::Add` 只调一次（`sweepFull` 仍是单 profile） |
| W3 | `interpPlate` | 5 | `MakeFilling` 全参构造 + 点约束未绑 |
| W4 | `op:history-subshape` 3 + `history:images` 2 | 5 | `FirstShape/LastShape/Generated/Images` 未绑（`EvolutionData` 是 face-hash） |
| W5-c | `op:prism-from-face` 4 + `op:prism-tilt` 1 | 5 | `BRepFeat_MakePrism/MakeDPrism` 未绑（TKFeat 被 `EXCLUDED_LIBS`） |
| W5-b | `op:project` 2 + `project` 2 | 4 | `BRepProj_Projection`（边→面）未绑 |
| W5-f | `op:assembly-subshape-import` | 4 | XCAF layer + subshape name/color 读回 |
| W5-d | `narrow:sphere-angles` | 3 | `makeSphere(radius)` 仍单参（`index.d.ts:65`） |
| W5-a | `remove`（`test_remove__br`） | 1 | `BRepTools_ReShape` 未绑（`sew` 2 条已移入 §3.2 待探针） |
| W5-e | `plane` | 2 | `BRepBuilderAPI_MakeFace(gp_Pln)` 无界面未绑（`makeFace` 仍只收 wire，`index.d.ts:252`） |
| B 桶 | `kernel:loft-coplanar-sections` 1、`kernel:ellipse-tall-axis` 1、`kernel:crash-polygon-cutThruAll` 1 | 3 | `ThruSections` 参数、`makeEllipseEdge` 主轴、WASM trap |
| D 桶 | `op:assembly-solve` 14、`getfixturevalue` 5、`export/import` 已列 3.1、`comparator:*` 3、`parametricCurve` 2、`op:parametricSurface` 1、`op:shape-operator-overload` 1、`eachpoint/cast/faceOn/op:pendingWires/op:sweep-sketch-sections/op:extrude-taper-sketch` 各 1 | 33 | 本仓值面 / 跨仓 / 语言层，与内核无关 |

> 其中 `op:parametricSurface`（`testParametricSurface__r2`）与 `parametricCurve`（2 条）虽标 D 桶，但 faijs 0.30.7 的 `surface`（`bsplineSurface`）与本仓既有 `splineFace`（`src/workplane.ts:6543`）已覆盖同一能力，**可一并作为本仓值面任务处理**，不依赖内核扩展。

---

## 4. 落地任务（按 ROI 排序）

### T1 · shell joinType（解锁 U1/U4，2+1 条，逐位已证）

1. `src/workplane.ts` 的 `shell()`：增加 `joinType` 形参，negative+removed 分支透传第 5 参；`hollow(kind='intersection')` 传 `JoinType.Intersection(2)`。
2. 删 `mark-blocked.ts:494-496` 的旧 reason（arc-join only），改指向本文件 §2.1。
3. 写镜像 `test_hollow__res2` / `test_hollow_open__res2` / `testSimpleShell__s2`。
4. 变异测试：把 joinType 硬编码回 `Arc`，三条断言必须变红。
5. `npx tsx tests/run-cand.ts` + `compare.ts` 全量对拍零回归，manifest 翻 ported。

### T2 · BREP 文本/二进制通道（解锁 U2/U3，5 条）

1. `Shape`/相对函数新增 `toBrep()`（→ `toBREP`）与 `fromBrepBinary()`/`toBrepBinary()`（→ `toBREPBinary`/`fromBREPBinary`），对齐 faijs `exportBrep` 的引擎断言口径（`assertEngineFor`，非 occt 引擎报错、不补桩）。
2. assembly 导出补 BREP/STL 分支（`test_native_export` / `test_export_errors` / `test_save_stl_formats`）。
3. 验收：`test_bin_import_export__b/r` round-trip 体积/面数逐位。

### T3 · shell 正厚度（解锁 U5/U6，4 条，需先捕获真值）

1. `src/workplane.ts:5906-5917` 删除 throw，改直调 `kernel.shell(h, facesToRemove, +thickness, tol, joinType)`。
2. **先**用一次性 Python 捕获 `testSimpleShell__s1/s3`、`testLegoBrick__s/tmp` 的面数/体积真值，冻结进镜像注释。
3. 变异测试：恢复 throw 分支，断言变红。

### T4 · aux-spine 探针（判 `sweep-aux-spine-mode` 3 条 + 连带 4 条）— **已完成，负结论**

1. ✅ 用上游 `testSweep` 的真实 path/guide 几何跑过了（`scripts/_analysis/probe-aux-spine-sweepfull.mjs`）：
   `sweepAdvanced(CE=true)` 与 `sweepFull(CE=true)` 同为 **17759.15746693434**（逐位相同），距上游 20218.347 差 **−12.163%**；
   而 `sweepFull(CE=false)`=20500.4449、`sweepFull(Fixed)`=20500.4551 与上游对应真值**逐位相等**。详见 §2.2。
2. ✅ 未命中 ⇒ 维持 `src/workplane.ts` 的 auxSpine 拒绝分支与 `sweep-aux-spine-guard.test.ts`（3+4 条**继续 blocked**）；
   reason 已由「内核忽略 CE」改写为实测口径「内核 honour CE，但其 CE=true 构造与 OCP 不等价，CE=false/Fixed 反而是精确的」。
3. ✅ 负结论冻结：`src/sweep-aux-spine-sweepfull.probe.test.ts`（3 断言），
   未来任一天 sweepFull 真的对齐 OCP，该测试会**先红**，再回跑捕获，然后才允许抬镜像。
4. `kernel:boolean-near-coincident-bspline` 四条 twist 用例仍单列：twist 需旋转律，`sweepFull` 的 `law` 只有缩放律
   （`SweepLaw.Linear/SCurve` + `lawEndFactor`），不构成解。

---

## 5. 硬门禁与风险

1. **零回归**：与当前基线取 PASS/FAIL 集合 diff（不是 parity 数字），既有 PASS 不许翻红。
   - **本轮实际取证范围（如实记录，未完成项）**：`shell`/`hollow` 的改动面按「调用者」收敛到 16 条镜像
     （`testClosedShell`×5、`testLegoBrick`、`testOccBottle`、`testOpenCornerShell`、`testSimpleShell`×3、
     `test_hollow*`×4、`test_hollow_open*`×2）全部重跑并逐位 PASS；**555 条全量重扫未跑**，
     `out/report-final.json`（11:26，500/20/18/1/112）仍是 shell 改动**之前**的基线。
     未做全量重扫的代价是：无法用 PASS/FAIL 集合 diff 证明「无间接回归」，只能证明受影响面无回归。
     下次跑全量时须 §5.1 的 diff 判据复核。
   - 已知非回归项：`TestCadQuery__testClosedShell__s3` 的 cut 失败经
     `scripts/_analysis/probe-shell-s3-regression.mjs` 证明在**旧调用形态**（不传第 5 参）下同样发生
     （内核返回空 inner），属既有缺口，与本次 joinType 改动无关。
2. **翻 ported 三条件**：镜像存在 + parity 逐位 + 变异测试变红（沿用扩展方案 §6.2）。
3. **一次性 Python 捕获优先**：U5/U6 与 T4 必须先捕获真值再下结论；捕获推翻纸面结论即回写本文件（`probe-occt56-unblock.mjs` 只作通道取证，不作真值）。
4. **数据同步**：改判任意一条 ⇒ 同时更新 `tests/manifest.json`（走 `tests/mark-blocked.ts`）+ `tests/coverage.json` + 本文件 + 扩展方案 §2.2。
5. **依赖口径**：若走 faijs 路径而非直调，需把 `peerDependencies.@faicad/faijs` 提到 `^0.30.8`；若维持直调，只需 lock 在 `occt-wasm@5.6.0`。**两者不混用**。
6. **R9 标签纪律**：被本轮证伪的 `kernel:*` 标签（`hollow-intersection-join` 的 reason、`shell-outward-opening` 的「kernel does not expose」）必须同步改写，否则继续误导下一个人。

---

## 6. 附录

### 6.1 本轮取证脚本

| 文件 | 用途 |
|---|---|
| `scripts/_analysis/probe-occt56-unblock.mjs` | 判别 shell joinType / sweepFull CE / BREP 二进制通道，输出见 §2 |

### 6.2 对扩展方案的修正（回写项）

| # | 扩展方案原文 | 修正 | 证据 |
|---|---|---|---|
| N-1 | §2.2 A6「已调用该类但只传前 4 个实参」 | 该判断基于本地 facade clone v5.3.5；npm 5.6.0 的 `shell` 已绑 `joinType` 且实测生效 | §2.1、`index.d.ts:172` |
| N-2 | §2.3 B 桶假设 CE 需新绑 | 5.6.0 `sweepFull` 已有 CE/guideContact 字段；是否生效待探针 B | §2.2 |
| N-3 | §2.5「export/importBin 5 条与 occt-wasm 无关」 | 归类正确，但 5.6.0 + faijs 0.30.8 已把通道补齐，可从 D 桶移入本轮可解 | §2.4 |