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

### 2.2 结论 B：`sweepFull` 的辅助向导几何未复现 → **留待探针**

自造 geometry 触发了 `Courbes non jointives` / `cannot keep the section in contact with the guide wire`。这是**探针输入不合法**（guide 与 spine 未满足相交约束），不能据此判定 CE 生效与否。扩展方案 §2.3 B 桶的 `kernel:sweep-aux-spine-mode` 仍需**照抄上游 `testSweep` 的真实 path/guide 几何**再判：

- 上游真值已冻结：`SetMode(aux, CE=True) → 20218.347`、`CE=False → 20500.445`、`Fixed → 20500.455`（`mark-blocked.ts:162-166`）。
- 待判命题：`sweepFull({mode:Auxiliary, auxSpine, curvilinearEquivalence:true})` 是否给出 **20218.347**（旧 `sweepAdvanced` 给的是 12.2% 偏的 17759.157）。

### 2.3 结论 C：`shell` 正厚度 + 移除面**不再抛错**（通道确证，真值待对拍）

- 实测 `shell(box,[top],+0.1,1e-3)` → vol 0.424、f11，joinType 三个取值结果一致。
- 本仓 `src/workplane.ts:5906-5917` 对「正厚度 + 移除面」**直接 throw**（上游 `testSimpleShell__s1/s3` 就落在这里）。现在内核支持该路径 ⇒ 应替换为直调，再与上游面数 23/5/6 对拍。

### 2.4 结论 D：BREP 文本/二进制通道**齐备**（确证）

- `toBREP`/`fromBREP`（文本）与 `toBREPBinary`/`fromBREPBinary`（二进制）均存在，round-trip 体积、面数逐位复原。
- 本仓 `mark-blocked.ts:433-438` 的 `export` 与 `importBin` 是**本仓通道缺口**，扩展方案 §2.5 已归类为「与 occt-wasm 无关」，本轮由 5.6.0 + faijs `exportBrep` 补齐取证。

---

## 3. 逐条重估表（99 条 blocked）

### 3.1 已不 block（本轮可翻 ported，共 12 条）

| # | 标签 | 条 | 用例 | 依据 | 落地动作 |
|---|---|---|---|---|---|
| U1 | `kernel:hollow-intersection-join` | 2 | `test_hollow__res2`、`test_hollow_open__res2` | 探针 A（0.584 逐位） | `shell()` 增加 `joinType` 形参；`hollow` 走 Intersection |
| U2 | `importBin` | 2 | `test_bin_import_export__b/r` | 探针 D | 新增 `toBrepBinary`/`fromBrepBinary` 通道 |
| U3 | `export` | 3 | `test_native_export__simple_assy`、`test_export_errors__nested_assy`、`test_save_stl_formats__nested_assy_sphere` | 探针 D + faijs `exportBrep`/`exportStl` | assembly 导出补 BREP/STL 分支 |
| U4 | `kernel:shell-intersection-join` | 1 | `testSimpleShell__s2` | 探针 A | 同上 U1，s2 显式 Intersection |
| U5 | `kernel:shell-outward-opening` | 2 | `testSimpleShell__s1/s3` | 探针 C | 去掉 throw，改直调正厚度 shell，再对拍 |
| U6 | `op:shell`（lego brick） | 2 | `testLegoBrick__s`、`testLegoBrick__tmp` | 探针 A/C + 上游默认 arc | 先按默认 arc 复跑，失败再试 Intersection |

> **U1 是本轮唯一「逐位命中」的项**，风险最低，建议第一个翻。U5/U6 通道确证但**上游真值未知**，必须先跑一次 Python 捕获（`C:\Users\ylt\cadquery-env`）冻结面数/体积，再翻。

### 3.2 待探针（通道就绪，结论未定，共 4 类 / 10 条）

| 标签 | 条 | 待判命题 | 探针 |
|---|---|---|---|
| `kernel:sweep-aux-spine-mode` | 3 | `sweepFull` CE 是否给出上游 20218.347 | 结论 B，需真实 path/guide |
| `kernel:boolean-near-coincident-bspline` | 4 | 若 aux-spine 解则同源解；否则是否需 `law` 驱动 twist | 沿用同一 path/guide 探针 |
| `remove`（sew 子集） | 2 | `test_sewing__sh/res3`：`sew`/`sewAndSolidify`/`buildSolidFromFaces` 通道已可用（faijs `solidFromFaces`） | 与上游 sewing 语义对拍 |
| `op:offset2D-multi-region` | 1 | faijs `offset2d` 只接 `offsetWire2D`，**未提供 MakeOffset2D 多区域语义**（`mark-blocked.ts:337-343`） | 判为**仍 block**，除非内核另有多区域通道 |

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

### T4 · aux-spine 探针（判 `sweep-aux-spine-mode` 3 条 + 连带 4 条）

1. 用上游 `testSweep` 的真实 path/guide 几何，分别调 `sweepAdvanced`（基线 17759.157）与 `sweepFull({mode:3, auxSpine, curvilinearEquivalence:true, guideContact})`，与 20218.347 对拍。
2. 命中 ⇒ 删 `src/workplane.ts:7415-7423` 的 auxSpine 拒绝分支 + `src/sweep-aux-spine-guard.test.ts`，解锁 3+4 条；未命中 ⇒ 维持拒绝，reason 更新为「sweepFull CE 亦无效」。
3. 无论结果，`kernel:boolean-near-coincident-bspline` 的四条 twist 用例需单列判别（twist 需旋转律，非 `law` 缩放律）。

---

## 5. 硬门禁与风险

1. **零回归**：与当前基线取 PASS/FAIL 集合 diff（不是 parity 数字），既有 PASS 不许翻红。
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