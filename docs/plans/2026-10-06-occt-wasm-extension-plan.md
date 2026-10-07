# occt-wasm 功能扩展开发方案（CadQuery 移植的“伪内核缺口”清算）

- 日期：2026-10-06
- 仓库：`D:\Faicad\faijs-cadquery`（本仓，目标侧）
- 上游：`D:\Faicad\occt-wasm`（`https://github.com/andymai/occt-wasm`，本地 clone 停在 `v5.3.5` / `6f512d8`）
- OCCT 源码：`D:\Faicad\OCCT`（`Open-Cascade-SAS/OCCT` master @ `3d097a03`，2026-08-24）
- 参照实现：`C:\Users\ylt\cadquery-env\Lib\site-packages\cadquery`（CadQuery **2.8.0**，OCP 绑定）
- 前置文档：本仓 `docs/plans/2026-10-05-cadquery-post-occt56-plan.md`（§3 的 blocked 重估是本文件的输入，本文对其中的三条结论做修正）

---

## 0. 一句话结论

> **当前 108 条 blocked 中，有 48 条（44.4%）是被 occt-wasm「没绑出来」阻塞的，而底层 OCCT 里每一个都能指名到一个现成的、且早已被引擎链接进来的 C++ 类与精确签名。**
> 另有 12 条（11.1%）疑似同源待探针（上限合计 60 条 / 55.6%）；9 条（8.3%）是**误判标签**——我用探针实测证明内核层其实已经支持；38 条（35.2%）与 occt-wasm 无关；1 条证据不足。

**核心判断：这些不是算法缺口，是绑定缺口。** 缺的不是 OCCT 能力，而是 `xtask/src/codegen/config.rs` 里的一条 `MethodSpec` + `ts/src/index.ts` 的一个 wrapper。

---

## 1. 口径与取证方法（可复现，全部实测不是转述）

### 1.1 四条互不替代的证据链

| 证据 | 怎么来的 | 作用 |
|---|---|---|
| **① 数量口径** | `tests/manifest.json` 现状：**697 = 534 ported / 108 blocked / 55 skipped**，108 条分布在 **41 个不同 `blockedBy` 标签**上（`scripts/_analysis/_blocked-tags.ps1`） | 分母与被分配对象 |
| **② CadQuery 侧要什么** | 直接读 `cadquery-env\...\cadquery\{cq.py,occ_impl\shapes.py,occ_impl\assembly.py}` 与 `out/cache/v2.8.0/tests/` 里的上游测试源码，取每个 blocked 用例**实际调用的 OCP 类与 Argument** | 「需求」侧 |
| **③ OCCT 底层有没有** | 在 `D:\Faicad\OCCT\src\` 里逐个 `find -name <Class>.hxx` 并**读到签名行**（不是只看类名存在） | 「供给」侧，判"底层 OCCT 其实有" |
| **④ occt-wasm 有没有绑** | ① `node_modules/occt-wasm/dist/index.d.ts` 的 212 个方法名全清单；② `facade/**/*.cpp` 的 163 个 `#include`；③ `xtask/src/codegen/config.rs` 的 MethodSpec 表；④ `xtask/src/build.rs` 的 `EXCLUDED_LIBS` | 「通道」侧，判"是绑定缺口还是库没编" |

**判定规则**：只有 ② 指明具体 C++ API、③ 在源码里读到该 API 的签名行、④ 证明该 API 在 212 方法里没有等价通道 —— 三条同时成立，才计入「确证 48」。

### 1.2 一条重要的中间发现：`EXCLUDED_LIBS`

`xtask/src/build.rs:151-166` 把 `libTKFeat.a` / `libTKHelix.a` / `libTKXMesh.a` 从**链接**里排掉了（不是"没编译"）：

```rust
// Features not used by facade
"libTKFeat.a",
"libTKHelix.a",
```

而 `-DBUILD_MODULE_ModelingAlgorithms=TRUE` 是把整个 ModelingAlgorithms **全部**编出来的。所以：

- 绑定 `BRepFeat_MakePrism` ≠ 从零开始使能 TKFeat，**只是把一行从 `EXCLUDED_LIBS` 里删掉 + 写 binding**；
- 其余 40 条所需的类所在的 toolkit（TKOffset / TKBool / TKTopAlgo / TKBRep / TKPrim / TKXCAF / TKDESTEP / TKGeomBase）**本来就在链接里**，纯属没绑。

这决定了"不同 blocked 项的工程成本完全不同"（见 §5）。

---

## 2. 全量分类（108 条 / 41 标签）

### 2.1 桶的定义

| 桶 | 含义 | 条数 | 占比 |
|---|---|---|---|
| **A · 确证绑定缺口** | 底层 OCCT 有精确对应原语 + 当前无等价绑定通道 | **48** | **44.4%** |
| **B · 疑似同源待探针** | 有合理技术假设，但缺判别探针，不许预先计入 | **12** | 11.1% |
| **C · 误判标签** | manifest 打了 `kernel:*`，但**实测证明内核层已支持** ⇒ 阻塞点在本仓/比较器 | **9** | 8.3% |
| **D · 与 occt-wasm 无关** | 算法自研 / 本仓值面 / 跨仓 / JS 语言层 / 字节通道 | **38** | 35.2% |
| **E · 证据不足** | 标签自解释，无足够线索，`reason` 为空且无关联测试 | **1** | 0.9% |

### 2.2 A 桶 · 确证绑定缺口（48 条）—— **本方案要解决的全部**

| # | 标签 | 条 | CadQuery 需要的 OCCT API（位置） | OCCT 源码签名落证 | occt-wasm 现状 | 所需 toolkit（已链接？） |
|---|---|---|---|---|---|---|
| A1 | `op:extrude-until-face` + `op:cutBlind.until-face` | **7** | `facesIntersectedByLine` → `BRepIntCurveSurface_Inter::Init(shape, line, tol)` + `gce_MakeLin`（`shapes.py:1494-1495`、`cq.py:_extrude`） | `src/ModelingAlgorithms/TKTopAlgo/BRepIntCurveSurface/BRepIntCurveSurface_Inter.hxx`；`src/ModelingData/TKGeomBase/gce/gce_MakeLin.hxx` | 只有 `sectionPlane`（平面切割）与 `containsPoint`（点判定），**无射线-面求交** | TKTopAlgo + TKGeomBase ✅ |
| A2 | `interpPlate` | **5** | `BRepOffsetAPI_MakeFilling(degree, nbPtsOnCur, nbIter, anisotropy, tol2d, tol3d, tolAng, tolCurv, maxDeg, maxSegments)` + `Add(edge, GeomAbs_C0/G1)` + `Add(gp_Pnt)`（`shapes.py:3536-3569`、`makeNSidedSurface`） | `src/ModelingAlgorithms/TKOffset/BRepOffsetAPI/BRepOffsetAPI_MakeFilling.hxx` | **只暴露了退化形式** `makeNonPlanarFace(wireId)`：默认构造 + `Add(edge, GeomAbs_C0)`，**无全参构造、无点约束、无 G1**（`facade/generated/kernel.cpp:1695-1708`） | TKOffset ✅ |
| A3 | `kernel:sweep-multisection-pipe` | **5** | `BRepOffsetAPI_MakePipeShell::Add(profile)` **重复调用多次** / `Add(profile, LocationVertex)`（`shapes.py:7292-7296` 多截面、`7359-7360` 多导线） | `MakePipeShell.hxx:133-148`（两个 `Add` 重载都在） | `sweepFull(profileId: uint32_t, ...)` **单 profile 形参，`maker.Add()` 只调一次**（`kernel.cpp:3186,3246`） | TKOffset ✅ |
| A4 | `op:history-subshape` + `history:images` | **5** | `builder.FirstShape()/LastShape()`、`Generated(el)`、`Modified`、`IsDeleted`、`Images()`（`shapes.py:5780-5820,7183-7187,7305-7327`；`sweep`/`loft`/`prism` 全部依赖） | `BRepPrimAPI_MakeSweep.hxx:48,51`（纯虚函数）、`BRepOffsetAPI_ThruSections.hxx:140,143,161`、`BOPAlgo_Builder.hxx:285`（`Images()`） | 只有 `*WithHistory` 族返回 **`EvolutionData`：face-hash 数组**，无 FirstShape/LastShape/任意 subshape 键的映射 | TKTopAlgo / TKBO ✅ |
| A5 | `op:prism-from-face` + `op:prism-tilt` | **5** | `BRepFeat_MakePrism(S, faces, base, dir, additive, modify)` + `BRepFeat_MakeDPrism` + `Perform(face)/Perform(from,to)/PerformThruAll()`（`shapes.py:7707-7744`） | `src/ModelingAlgorithms/TKFeat/BRepFeat/BRepFeat_MakePrism.hxx` | 完全没有 | **TKFeat ❌ 被 `EXCLUDED_LIBS` 排链** |
| A6 | `kernel:hollow-intersection-join` + `kernel:shell-outward-opening` + `kernel:shell-intersection-join` | **5** | `MakeThickSolidByJoin(S, faces, t, tol, Mode, **Intersection=true**, SelfInter, **Join=GeometryAbs_Arc/Intersection**, RemoveIntEdges)`（`shapes.py:4055-4062`、`7608-7615`；`testSimpleShell` 显式传 `kind="intersection"`） | `BRepOffsetAPI_MakeThickSolid.hxx:103-113`，`Intersection` / `Join` / `RemoveIntEdges` **全是命名默认参数** | **已调用该类但只传前 4 个实参**：`MakeThickSolidByJoin(shape, faces, -thickness, tolerance)`（`kernel.cpp:778,832,3769,3823`） | TKOffset ✅ |
| A7 | `project` + `op:project` | **4** | `BRepProj_Projection(edge, face, dir)` → `More()/Current()/Next()`（`shapes.py:2492`、`7574-7578`） | `src/ModelingAlgorithms/TKBool/BRepProj/BRepProj_Projection.hxx` | 只有 **点→面/边**投影（`projectPointOnFace:1603` / `projectPointOnEdge:1706`）与 HLR `projectEdges:1805`，**无边→面投影** | TKBool ✅ |
| A8 | `op:assembly-subshape-import` | **4** | STEP 读回子形状名/色（`STEPCAFControl_Reader` + `XCAFDoc_ShapeTool::GetSubShapes` + `TDataStd_Name`）与 `XCAFDoc_LayerTool`（`assembly.py:470,550-553`） | `STEPCAFControl_Reader.hxx`、`XCAFDoc_ShapeTool.hxx`、`**XCAFDoc_LayerTool.hxx**（DataExchange/TKXCAF） | XCAF 面有 `getSubShapes/addSubShape/getLabelInfo`，**但 layer 通道完全没有**；且 subshape 级 name/color 读回为空 | TKXCAF / TKDESTEP ✅ |
| A9 | `narrow:sphere-angles` | **3** | `BRepPrimAPI_MakeSphere(gp_Ax2(pnt, dir), r, Umin, Umax, Vmin, Vmax)`（`shapes.py:4348-4356`；`testSphereCustom` 传 `angle1/2/3`） | `BRepPrimAPI_MakeSphere` 全参构造在 TKPrim | **`makeSphere(radius: number)` 单参数**（`index.d.ts:65`） | TKPrim ✅ |
| A10 | `plane` | **2** | `BRepBuilderAPI_MakeFace(gp_Pln)` **无界/无限面**（`shapes.py:3591-3598`，` Face.makePlane` 不传 size 的分派） | `BRepBuilderAPI_MakeFace.hxx:74` 明确有 `BRepBuilderAPI_MakeFace(const gp_Pln& P)` | 只有 `makeFace(wire)` / `makeFaceOnSurface`；本仓还误以为上游依赖“`±1e60` 平面”（见 §3 的 M-3 修正） | TKTopAlgo ✅ |
| | **合计** | **48** | | | | |

### 2.3 B 桶 · 疑似同源，必须先探针（12 条）

| 标签 | 条 | 假设 | 为什么现在不能判 |
|---|---|---|---|
| `kernel:sweep-aux-spine-mode` | 3 | `SetMode(auxSpine, CurvilinearEquivalence)` 三个实参组合空间未穷尽：`_extrudeAuxSpine` 用 **CE=**`False`（`shapes.py:4366`），`sweep(..., aux=...)` 用 **CE=**`True`（`shapes.py:7150,7277`），且 **` KeepContact` 一律不传 ⇒ `BRepFill_NoContact`** | 上游两个不同调用点承载着不同语义，本仓 P1-1 只试了其中一格；且**第三个 `SetMode(SpineSupport)` 重载**（`MakePipeShell.hxx:89`，occt-wasm 已绑成 `sweepFull` 的 `supportId`）尚未被排除 |
| `kernel:boolean-near-coincident-bspline` | 4 | 与 aux-spine **同源**：`testTwistExtrude` 系列的输入几何本身就是 `_extrudeAuxSpine` 产出 | 已排除"plain 布尔故障"（P2-3 实测），但没排除"输入几何差"是 aux-spine flag 造成的；另一种可能仍是 comparator 侧评级（X-2）。**两个假设需判别探针拆分** |
| `op:shell`（lego brick） | 2 | 与 A6 同源：`faces("<Z").shell(-t)` 走默认 `kind="arc"`，而 OCCT 侧默认 `Intersection=false` | 需探针确认 lego brick 的失败点是否就是 `Intersection` 开关 |
| `kernel:loft-coplanar-sections` | 1 | `BRepOffsetAPI_ThruSections` 的 `SetMaxDegree/CheckCompatibility/SetContinuity/SetParType/SetSmoothing/SetCriteriumWeight` 全未暴露（当前只有 `loft(wires, isSolid, ruled)`，`index.d.ts:194`） | `test_loft__r4 = loft(w1,w2,w3, cap=True)`，尚不知 hit 点是哪个参数 |
| `kernel:ellipse-tall-axis` | 1 | `makeEllipseEdge(center, normal, majorRadius, minorRadius)` **没有 major-axis X 方向**，而上游 `makeEllipse` 走 `gp_Elips(gp_Ax2(center, dir, xdir), ...)` | 需在非 XY 正交平面上做判别探针 |
| `kernel:crash-polygon-cutThruAll` | 1 | 疑为 WASM trap；注意 trap 不走 `Standard_Failure`，facade 的 catch 看不到它（见 `CLAUDE.md` 的 "Memory & errors" 节） | 需先复现并拿到 trap 位置，才能分辨是 façade 缺前置守卫，还是 OCCT 自身崩溃 |

### 2.4 C 桶 · 误判标签（9 条，本次新发现，**不用改一行 occt-wasm**）

> **2026-10-07 已解决（9/9 翻 ported）**：9 条 `testEnclosure__*` 镜像全部写完并 parity 逐位 PASS（vol Δ ~1e-13、拓扑 f/e/v 逐位）。真阻塞点是本仓两个 bug（`faceWithHoles` 丢弃 `addHolesInFace` 返回值、`translate` 移动 `wp.origin`），与 fillet 链无关。详见本节末尾「结案」段。

**`kernel:fillet-chain-reapply`（9 条，全 `testEnclosure__*`）**

既有文档 §3.4 判定为「fillet 接受 fillet 产出；5.6 无新 fillet 通道」。**这个判定已过期。**

- 体制证据：occt-wasm 在 `00d94f4`（2026-09-03，早于本地 HEAD 且被 npm 5.6.0 包含）专门修了这个 —— `fix(facade): unwrap the singleton compound fillet/chamfer returns (#288)`，注释原文：
  > *"`BRepFilletAPI_MakeFillet`/`MakeChamfer` wrap their result in a Compound even for single-solid input. A later call that expects a Solid then fails in the `TopoDS::Solid(...)` cast ... **so chaining two fillets cannot work**. Restoring the Solid type here makes chaining behave as it does through OCP's direct pybind11 binding."*
  （`xtask/src/codegen/emitter.rs:348-356`，已落到 `facade/generated/kernel.cpp:193`，`fillet`/`chamfer`/`filletVariable`/`filletBatch`/`*WithHistory` 共 8 处调用 `unwrapSingletonSolid`）

- 实测证据（`scripts/_analysis/probe-fillet-chain.mjs`，对 `node_modules/occt-wasm@5.6.0` 直调）：

```
box type=solid vol=750000
edges0=12
fillet1 ok type=solid vol=745707.9632679488      ← 返回 Solid 而非 Compound
edges1=24
fillet2 chained=ok type=solid vol=745295.9063426348   ← 链式 fillet 成功
fillet3 chained=THREW: fillet: There are no suitable edges for chamfer or fillet
```
（`fillet3` 的失败是我故意挑了一条倒圆生成的 blend 边，属几何语义，不是缺陷。）

⇒ **链式 fillet 在内核层已经可用。** `testEnclosure` 的真正摩擦点在本仓：**第二次 `.edges("#Z")` 要在 fillet 之后的形状上重新做方向选择器**——那些新生成的边是圆弧/椭圆（不再是 `LINE`），而本仓的方向分类逻辑对 curve-type 的依赖未经验证。应在 `src/workplane.ts` 的 `resolveEdgeSelection` 上做判别探针，**把标签从 `kernel:*` 改成 `impl:*`**（在 `tests/manifest.json` 里同步改，不许留 `kernel:` 标签误导下一个人）。

#### 结案（2026-10-07）

上面的「第二次 `.edges("#Z")` 选中圆弧」假设**被一次性 Python 捕获推翻**：`scripts/probe-enclosure-capture.py` 实测第二次 `.edges("#Z")` 选中 **8 条，全部是 `LINE`**（倒圆后剩下的竖直直线段），不是圆弧。本仓 `resolveEdgeSelection` 无辜。

真阻塞点是两个本仓 bug，都在写镜像过程中暴露：

| # | bug | 症状 | 修复 |
|---|---|---|---|
| a | `faceWithHoles`（`src/workplane.ts:653`）**丢弃** `addHolesInFace` 的返回值——该内核函数是「返回带孔的新面」而非原地修改 | 所有嵌套 profile 拉伸成**实心**：`circle(5).circle(2).extrude(10)` → 785.398/f3（上游管件 659.734/f4）；`rect(10,10).rect(4,4).extrude(10)` → 1000/f6（上游 840/f10）。`sketch.ts:1158`、`text-solid.ts:227` 两处调用点本来就写对了，只有这一处写错 | 接收返回值 |
| b | `Workplane.translate` 移动 `wp.origin`——上游 `newObject()` 保留 `self.plane`，`translate((100,0,0))` 后 `plane.origin` **仍是 (0,0,0)**（实测：`Workplane("XY").box(10,10,10).translate((100,0,0)).plane.origin == (0,0,0)`；`faces(">Z").workplane()` 默认 `ProjectedOrigin` → (0,0,5)，只有 `CenterOfMass` 才是 (100,0,5)） | `workplane()` 重新锚定到平移后的中心，`topOfLid` 的 4 个沉头孔**打进了零件里**（vol −352），而上游打在空处（`topOfLid` vol == `cutlip` vol，真值已冻结在 `out/probe-enclosure-truth.json`） | 不再移动 origin |

结果：9/9 PASS。包内单测 66 文件 / 657 用例全绿，零回归。9 条已从 `tests/mark-blocked.ts` 的 `BY_KEY` 移除（留 CLOSED 注释），manifest 翻 `ported`。

> 顺带冻结的一个上游陷阱：`testEnclosure` 里 `topOfLid.rotateAboutCenter((1,0,0), 180)` **没有赋值**，CadQuery 返回新对象 ⇒ 旋转被丢弃（`topOfLid` 与 `cutlip` 的 bbox 逐位相同）。镜像必须同样丢弃。

### 2.5 D 桶 · 与 occt-wasm 无关（38 条）

| 标签 | 条 | 归属 | 为什么与内核无关 |
|---|---|---|---|
| `op:assembly-solve` | 14 | 本仓，自研 pure-TS 全局 NLP | 上游 `occ_impl/solver.py` 用 **`casadi`**（第三方数值库）+ `gp`/`BRepTools` 做量取，**OCCT 本身没有约束求解器**。这是算法层缺口，不是绑定缺口 |
| `getfixturevalue` | 5 | 本仓 | 内联 fixture 写镜像；其中 3 条需 export→importStep **内存**往返通道 |
| `export` 3 + `importBin` 2 | 5 | 本仓 | 内核 `toBREPBinary:393` / `fromBREPBinary:395` **已存在**，缺的是 `.fai.js` 侧字节/字符串通道 |
| `comparator:open-shell-volume` 2 + `comparator:vertex-degenerate-compound` 1 | 3 | `@faicad/cq-compat-compare`（跨仓） | 开壳三度量全失效（`∮x·n dA`），需 comparator 侧降级评级 |
| `parametricCurve` 2 + `op:parametricSurface` 1 | 3 | 本仓 | 上游只是**采样 + `GeomAPI_PointsToBSpline`**，而 `GeomAPI_PointsToBSpline` 已在 occt-wasm 的 include 面里；本仓 `splineFace` 已做到 4.2e-11 |
| `op:shape-operator-overload` | 1 | 语言层 | JS 无运算符重载 |
| `eachpoint` / `cast` / `op:faceOn` / `op:offset2D-multi-region` / `op:sweep-sketch-sections` / `op:extrude-taper-sketch` / `op:pendingWires` | 7 | 本仓 | λ 分发与值面通道，与内核面无关 |

### 2.6 E 桶 · 证据不足（1 条）

`ref:degenerate-compound-vertex`（`test_loft_to_vertex__c`）：manifest 的 `reason` 为空，无关联探针，本轮不归类。

### 2.7 汇总

```
108 blocked                                   ← 2026-10-06 定稿时口径
├─ A 确证绑定缺口（底层 OCCT 有）          48  ████████████ 44.4%
├─ B 疑似同源待探针                        12  ███ 11.1%     ← A+B 上限 60 (55.6%)
├─ C 误判标签（内核已支持，阻塞在本仓）       9  ██ 8.3%   → 已清零 2026-10-07，见 §2.4 结案
├─ D 与 occt-wasm 无关                     38  █████████ 35.2%
└─ E 证据不足                               1  · 0.9%

 99 blocked                                   ← 2026-10-07 现状（C 桶 9 条翻 ported）
```

> **两个分母别混**：`out/report.json` 的 135 BLOCKED 是「没有对应 cand 镜像的 ref 用例」（ref 侧口径）；`tests/manifest.json` 的 108 blocked 是「测试变量粒度」（镜像侧口径）。**本文 §2 全用 manifest 口径，P0-6 的对拍用 report 口径**，两者不可直接相减。
> （顺带记录一处待核对：`report.json` 的 `474+19+22+1+135 = 651 ≠ 650`，怀疑有一个 ERROR 用例被重复计数；不影响本文结论，但下次重算 baseline 时应查证。）

**对齐到 parity 的意义**：当前 650 条 ref 上 PASS 474 + PASS-NT 19 = **75.85%**。A 桶 48 条全解 ⇒ 理论上限 **541/650 ≈ 83.2%**；含 B 桶则 **553/650 ≈ 85.1%**。
注意这是**上限**：按本仓判定纪律，任何一条翻 ported 都必须「镜像存在 + parity 逐位通过 + 变异测试」，允许最终低于该数，但**不许高于**。

---

## 3. 三条对既有结论的修正（写进 `2026-10-05-cadquery-post-occt56-plan.md` 的回写项）

| # | 既有结论 | 修正 | 证据 |
|---|---|---|---|
| **M-1** | §2.4「`BRepOffsetAPI_MakeFilling` 无绑定」 | **错在粒度**：该类的头文件早就在 facade 的 163 个 `#include` 里，`makeNonPlanarFace` 已经走通了退化形式。真缺口是**全参构造 + 点约束 + G1 连续性** | `kernel.cpp:1695-1708` vs `shapes.py:3536-3569` |
| **M-2** | §3.4「`kernel:fillet-chain-reapply` 9 条：5.6 无新 fillet 通道」 | **已过期**：`#288` 已修并随 5.6.0 发布；探针实测链式 fillet 成功。改判为本仓问题（C 桶）。**2026-10-07 结案**：真因是 `faceWithHoles` 丢返回值 + `translate` 移动 origin，9/9 已翻 ported | `emitter.rs:348-356` + `probe-fillet-chain.mjs` + §2.4 结案 |
| **M-3** | §3.3「`plane`：内核无 ±1e60 平面原语」 | **前提就错**：上游压根没用 ±1e60，用的是 `BRepBuilderAPI_MakeFace(gp_Pln)` 的**无界（自然边界）面**。OCCT 有该构造，是纯绑定缺口（A10） | `shapes.py:3591-3598` + `BRepBuilderAPI_MakeFace.hxx:74` |

---

## 4. 为什么这批 48 条没有早早被解掉（根因，不是借口）

1. **判别口径失焦**：过去找缺口的手段是 `grep index.d.ts`（TS 面）。而 A2/A3/A6 三项的真缺口**不在方法存不存在，而在方法的参数面不够宽**——`sweepFull`、`makeNonPlanarFace`、`MakeThickSolidByJoin` 全都"存在"，grep 全命中。必须下沉到 `kernel.cpp` 的实参列表 + OCCT 头文件的默认参数才能看见。
2. **`EXCLUDED_LIBS` 是隐形墙**（A5）：TKFeat 明明编出来了，只因为链接阶段被排掉。
3. **`kernel:*` 标签一旦打上就没人再验证**：M-2 的 9 条是最好的例子 —— 上游在 9 月就修好了，10 月的重估直接把旧标签抄了过来。

---

## 5. occt-wasm 扩展方案

### 5.0 Phase 0 · 先把「可编译、可对拍」打通（**硬前置 · 未完成不许写任何 binding**）

实测本机状态（`scripts/_analysis/out-toolchain.txt`）：

```
rustc / cargo / rustup          NOT FOUND（无 ~/.cargo 目录）
emcc / em++                     NOT FOUND
cmake / ninja / wasm-opt        NOT FOUND
Docker Desktop                  NOT FOUND
WSL                             wsl.exe 存在，但被工作区安全策略列入黑名单，不可用作构建通道
choco / winget                  可用
GitHub 网络                     可用（git ls-remote 实测通）
```

⇒ **本机当前不具备构建 occt-wasm 的任何一条通路**。Phase 0 就是造通路。同时 `wsl.exe` 被拉黑 ⇒ **只能走原生 Windows 工具链**，Docker 路线需要先装 Docker Desktop（额外决策，不默认）。

| 序 | 项 | 具体动作 | 判据 |
|---|---|---|---|
| **P0-1** | 同步 fork 到 **v5.6.0** | 本地 clone 停在 `v5.3.5`（`6f512d8`），而本仓 peer 的是 **npm 5.6.0**。远端 tag `v5.6.0` = `1091f224`（`git ls-remote --tags` 实测）。 `git fetch --tags && git checkout v5.6.0 -b ext/56` | TS 面 diff = 仅 `{booleanOp, toPNG, toMultiviewPNG}` 三项新于本地 HEAD；`git describe` 报 `v5.6.0` |
| **P0-2** | 装 Rust（版本以 `rust-toolchain.toml` 的 pin 为准） | 本机无 `~/.cargo`，用 `winget install Rustlang.Rustup`（或 choco）。装完不要动本机其它既有软件 | `cargo --version` 通；`cargo xtask` 能列出子命令 |
| **P0-3** | 装 emsdk 5.0.3 | 按 emsdk 官方在 Windows 上的安装（`emsdk install latest` → `emsdk activate`），**并**确认随附的 `ninja`/`cmake` 可调用（`cargo xtask build-occt` 用 `-G Ninja`） | `em++ --version` + `ninja --version` + `cmake --version` 三者通，`wasm-opt` 在 PATH |
| **P0-4** | 初始化 OCCT 子模块 | `git submodule update --init`（指向 `https://github.com/andymai/OCCT.git` @ `c540f31`）。**不要用 `D:\Faicad\OCCT` 替代**，理由见风险 R2 | `occt/CMakeLists.txt` 存在 |
| **P0-5** | 全量构建一次（~1h） | `cargo xtask build-occt` 然后 `cargo xtask build --release` | 产出 `dist/occt-wasm.{js,wasm}` |
| **P0-6** | **严格对拍**（最关键的一步） | 把 P0-5 的 `dist/` 与 `node_modules/occt-wasm/dist/` 做：① 方法名集合 diff（应为空）；② `npm test`（`cd ts && npx vitest run`，需 dist）全绿；③ 用本仓 `npx tsx tests/run-cand.ts` + `compare.ts` 跑全量 parity，与当前基线（474 PASS / 19 PASS-NT / 22 FAIL / 1 ERROR / 135 BLOCKED / 650）取 **PASS/FAIL 集合 diff** | ① 空 diff；② ts 测试全绿；③ **零回归**（既有 PASS 不许翻红） |

> **P0-6 不过 = 没有可靠的增量基线，后面所有 binding 都无法区分"我改好的"和"我改坏的"。这一步不许省。**

### 5.1 加一个方法到底要动哪几个文件（机制，写清以免每次重新探索）

按 `CLAUDE.md` 的 "Codegen (the central seam)" 节与 `emitter.rs` / `run.rs` 实测：

1. **`xtask/src/codegen/config.rs`** —— 在 `TARGET_METHODS` 加一条 `MethodSpec`。大多数用 `MethodKind::CustomBody`（`setup_code` 就是完整 C++ 函数体，处在一个 `try { ... } catch (const Standard_Failure& e)` 里，用 `store(x)` 返回形状句柄、`throw std::runtime_error(...)` 报错）。可选 `ReturnType` 见 `types.rs:126-170`（`ShapeId` / `VectorShapeIds` / `Double` / `VectorDouble` / `EvolutionData` / `Bytes` …）。
2. **`cargo xtask codegen && cargo fmt --all`** —— 重新生成 `facade/generated/{kernel,bindings,wasi_exports}.cpp` 与 `crate/src/kernel_generated.rs`。**生成文件是提交进库的**（force-tracked），CI 会跑 drift check。
3. **`ts/src/raw-types.ts`**（Embind 面）+ **`ts/src/index.ts`**（`OcctKernel` wrapper，用 `wrap()` 包 `OcctError`）+ 需要时 **`ts/src/types.ts`**（选项类型）。
4. **`test/`** 加 vitest 集成用例；README 里的 ```` ```typescript check ```` 片段（`npm run typecheck:docs` 门禁会编译它）。
5. `crate/src/occt-wasm.wasm.br` 会因 façade 变化失效，CI 的 WASI stale-check 会红 ⇒ 必须跑 `scripts/reembed-wasmbr.sh`（且**只接受 CI 产物**，本地重编不 byte-identical）。

两个硬约束：

- **参数宽度 ≤ 16 个 wasm 标量**（`WASMTIME_MAX_PARAMS`，`types.rs:45`）。超了就变成 npm-only，`crate` 里消失。`sweepFull` 已经很宽 ⇒ **新方法的参数一律用「少量标量 + 少量 ShapeId 数组」的形状**，避免继续加标量。
- **返回结构体要同时改 `rust_emitter.rs`**：`ReturnType` 每加一个变体，三个 emitter（C++ / Rust / WASI）都要覆盖。能用 `VectorUint32` 扁平打包解决的，就不要加新结构体。

### 5.2 批次规划（W0 → W5，按「解锁条数 ÷ 工程成本」排序）

**排序原则**：A6 A1 A3 A2 A4 A7 A5 A9 A10 A8 —— 先做「已链接 toolkit + 纯实参扩展」的（几乎零成本），最后做需要动链接策略的。

---

#### W0 · `MakeThickSolidByJoin` 实参扩展 —— **解锁 5 条（+可能 2 条 lego）／成本：极低**

唯一真改动：把 `Intersection` / `JoinType` / `RemoveIntEdges` 三个已存在的默认参数暴露出来。

```rust
MethodSpec {
    name: "shellAdvanced",
    kind: MethodKind::CustomBody,
    params: &[
        FacadeParam::ShapeId("solidId"),
        FacadeParam::VectorShapeIds("facesToRemove"),
        FacadeParam::Double("thickness"),
        FacadeParam::Double("tolerance"),
        FacadeParam::Bool("intersection"),      // OCCT: Intersection
        FacadeParam::Int("joinType"),           // 0 = GeomAbs_Arc, 1 = GeomAbs_Intersection
        FacadeParam::Bool("removeIntEdges"),
    ],
    occt_class: "",
    ctor_args: "",
    setup_code: "\
TopoDS_Shape shape = get(solidId);
NCollection_List<TopoDS_Shape> faces;
for (uint32_t fid : facesToRemove) { faces.Append(get(fid)); }
BRepOffsetAPI_MakeThickSolid maker;
maker.MakeThickSolidByJoin(shape, faces, thickness, tolerance,
                           BRepOffset_Skin,
                           intersection,          // ← A6 的关键开关
                           false,                 // SelfInter
                           joinType == 1 ? GeomAbs_Intersection : GeomAbs_Arc,
                           removeIntEdges);
maker.Build();
if (!maker.IsDone()) { throw std::runtime_error(\"shellAdvanced: operation failed\"); }
return store(maker.Shape());",
    includes: &["BRepOffsetAPI_MakeThickSolid.hxx", "BRepOffset_Mode.hxx",
                "GeomAbs_JoinType.hxx", "TopoDS_Shape.hxx", "NCollection_List.hxx"],
    category: "construction",
    return_type: ReturnType::ShapeId,
}
```

`BRepOffset_Mode.hxx` 与 `GeomAbs_JoinType.hxx` 都已在 facade 现有的 163 个 `#include` 里 ⇒ **零新增依赖**。

**判据**：`testSimpleShell__s1/s2/s3`（面数 23 / 5 / 6）+ `test_hollow__res2` + `test_hollow_open__res2` parity 逐位；变异测试：把 `intersection` 硬编码成 `false`，三条断言必须变红。

---

#### W1 · `facesIntersectedByLine` —— **解锁 7 条／成本：低**（本方案 ROI 最高的一项）

对应 CadQuery `Shape.facesIntersectedByLine(point, axis, tol, direction)`。返回结构需要「面 + 沿轴距离」，推荐**新增返回结构 `FaceHitData { std::vector<uint32_t> faceIds; std::vector<double> distances; }`**（加新返回结构有先例：`EvolutionData` / `ProjectionData` 都是这么做的），或退而求其次拆成两个方法分别取 ID 列表与距离列表。

```cpp
// setup_code 骨架（严格对齐 shapes.py:1491-1520 的 Python 逻辑）
gp_Lin lin = gce_MakeLin(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)).Value();
BRepIntCurveSurface_Inter mk;
mk.Init(get(shapeId), lin, tol);
std::vector<std::pair<double, TopoDS_Face>> hits;
while (mk.More()) {
    gp_Pnt p = mk.Pnt();
    hits.emplace_back(gp_Pnt(px, py, pz).SquareDistance(p), mk.Face());
    mk.Next();
}
std::sort(hits.begin(), hits.end(), [](auto& a, auto& b){ return a.first < b.first; });
for (auto& [d, f] : hits) { data.faceIds.push_back(store(f)); data.distances.push_back(d); }
return data;
```

`direction` 过滤（`"AlongAxis"` / `"Opposite"`）留在本仓实现，不在内核做——内核只负责给「沿轴排好序的命中」，避免把 CadQuery 的策略语义烧进 kernel。

**判据**：`testExtrudeUntilFace__*` 4 条 + `testCutBlindUntilFace__*` 3 条全部翻转 ported 且 parity 逐位；冻结守卫 `src/extrude-until-face-guard.test.ts` 翻红解锁。

---

#### W2 · `MakePipeShell` 多截面 —— **解锁 5 条／成本：中**

新增 `sweepMulti(profileIds[], spineId, auxSpineId, options)`。核心差异只有一行：**循环 `maker.Add(get(id))` 而不是单次**（`MakePipeShell.hxx:133` 的 `Add` 本来就可以重复调用）。

```cpp
BRepOffsetAPI_MakePipeShell maker(TopoDS::Wire(get(spineId)));
maker.SetTransitionMode(...);
for (uint32_t pid : profileIds) {
    maker.Add(get(pid), withContact, withCorrection);   // ← 上游 loop 形态
}
maker.Build();
if (maker.IsDone() && cap) maker.MakeSolid();           // ← cap=true ⇒ MakeSolid（shapes.py:7364）
```

注意上游两个语义细节必须照抄，否则 parity 不会逐位：
- **`cap` 决定是否 `MakeSolid()`**（`shapes.py:7236-7237,7364-7365`）；
- `transition` 默认 `"transformed"`，但 `Workplane.sweep` 的默认 `"right"`（`shapes.py:4611`）—— 沿用现有 P1-3 结论，行为不改，只记录。

另建议同批暴露 `Add(profile, LocationVertex)` 重载（`MakePipeShell.hxx:141`），给未来需要显式定位截面的场景留门。

**判据**：`testMultisectionSweep__*` 与 `test_sweep__r5/r7`；判别量是**端盖平面方位 + bbox**，不是体积（体积可能巧合接近）。

---

#### W3 · `MakeFilling` 完整面 —— **解锁 5 条／成本：中**

新增 `interpPlate(edgeWireId, constraintPointIds[], options{degree,nbPtsOnCur,nbIter,anisotropy,tol2d,tol3d,tolAng,tolCurv,maxDeg,maxSegments})`，替代退化版 `makeNonPlanarFace`（保留旧方法，不删，避免破坏现有 ported 用例）。

关键点（对齐 `shapes.py:3536-3569`）：**先全参构造，再依次 `Add(edge, GeomAbs_C0)`，最后 `Add(gp_Pnt)` 加内点约束**；`Face(...).fix()` 上的 `ShapeFix` 后处理留在本仓（`facade` 没义务承担）。

**判据**：`test_interpPlate__plate_1..5` 五条；变异测试：丢掉 `maxDeg`/`tol3d` 后断言变红。

---

#### W4 · History 真值映射 —— **解锁 5 条／成本：高**

这是 A 桶里唯一可能要**新增 API 面**（而非只给现有方法补实参）的一项：现有的 `EvolutionData` 语义不够，凑不出来。

现状：occt-wasm 已有 `*WithHistory` 一族（14 个），但 `EvolutionData` 只回 **face-hash 数组**（连 `FirstShape`/`LastShape` 也被压成哈希语文本）。而 CadQuery 需要的是 **任意 subshape 键 → 产出列表** 的映射，且必须能精确到 Vertex / Edge / Face 任意层级。

推荐设计（**不依赖哈希语义**）：新增一个返回 `VectorUint32` 的扁平打包方法，避免新增返回结构体：

```cpp
// sweepHistory(profileIds[], spineId, options) → VectorUint32，扁平打包：
// [resultId, firstId, lastId, mapCount,
//  genCount, [genInputId, genOutCount, genOutId...]...,
//  modCount, [modInputId, modOutCount, modOutId...]...,
//  delCount, [delInputId...]...]
```
每个 output 都 `store()` 成 arena 句柄，可以直接回喂后续调用。**同一个 `buildEvolution` 套路已经在 `emitter.rs:410` 有了**，只需把 key 从 face-hash 换成 subshape handle。

需要的 CMake 变化：无。需要的 include：`BRepPrimAPI_MakeSweep.hxx`、`BRepOffsetAPI_ThruSections.hxx`、`BOPAlgo_Builder.hxx`（`Images()`）。

**判据**：`test_history_extrude__sides` / `test_history_sweep__side` / `test_history_loft__side` / `test_imprint__b1_imp` / `test_imprint__b3_imp` 五条；必須做到**一次 Python 捕获 → 真值固化进 TS 断言**（这些是非 STEP 输出）。

---

#### W5 · 其余四项打包 —— **解锁 14 条**

| 子项 | 条 | 动作 | 特殊注意 |
|---|---|---|---|
| **W5-a** `removeSubShapes(shape, subshapeIds[])` | 3 | `BRepTools_ReShape` + `Remove()` + `Apply()`；配套 `replaceSubShape(shape, oldId, newIds[])` 用 `Replace()` | **不要**用现有 `defeature` 冒充（那是"移除并填补"，语义不同）；开工前先用判别探针确认 `test_remove__br` 走的确实是 ReShape 语义 |
| **W5-b** `projectEdgesOnFace(edgeIds[], faceId, dir)` | 4 | `BRepProj_Projection` + `More()/Current()/Next()` | 与现有 HLR `projectEdges` 重名风险 ⇒ 用新名 `projectEdgesOnFace` |
| **W5-c** `makePrismFeature(...)` / `makeDPrismFeature(...)` | 5 | `BRepFeat_MakePrism` / `MakeDPrism` + `Perform(face)` / `Perform(from,to)` / `PerformThruAll()` | **必须同步把 `"libTKFeat.a"` 从 `EXCLUDED_LIBS` 摘掉**（`build.rs:184`）；记得测 dist 体积增量 |
| **W5-d** `makeSphereAdvanced(origin, normal, radius, uMin, uMax, vMin, vMax)` | 3 | `BRepPrimAPI_MakeSphere(gp_Ax2(...), r, Umin, Umax, Vmin, Vmax)` | 保留原单参 `makeSphere`（现有 ported 用例依赖它，不删不改） |
| **W5-e** `makeInfinitePlaneFace(origin, normal)` | 2 | `BRepBuilderAPI_MakeFace(gp_Pln(...))` **无实参范围**（`MakeFace.hxx:74`） | **不是** ±1e60 大面（见 M-3）；本仓 `src/workplane.ts:5571-5581` 的既有报错文案要一并改因为它当前的说法是错的 |
| **W5-f** XCAF subshape name/color/layer 读 + `XCAFDoc_LayerTool` | 4 | ① 修 subshape 级 `TDataStd_Name` 读回；② 新增 `getLayers(label)` / `setLayer(label, name)` | X-3 缺口；`XCAFDoc_LayerTool.hxx` 在 TKXCAF（已链接） |

### 5.3 执行顺序与交付形式

```
P0（工具链 + 基线对拍）
 └─ W0 → W1 → W2 → W3 → W4 → W5(a..f)
```

**每批严格独立跑：改 C++ → `cargo xtask codegen && cargo fmt --all` → `cargo xtask build --release` → 装进本仓测 → 全量 parity → 变异测试 → 独立 commit。** 任一批不过就停。

**仓库形态**：在 `D:\Faicad\occt-wasm` 的 `ext/56` 分支实现，每批一个 conventional commit（`feat(facade): ...`）。验收通过后 **向 `andymai/occt-wasm` 提 PR**（注意：任何 `xtask/` 改动都会触发 npm 版本 bump，`release-please` 的 `exclude-paths` 只排掉 `crate` 和 `Cargo.lock`）。

**在 PR 合并前先解锁本仓**：把 `cargo xtask build --release` 出的 `dist/` 打成本地 tgz，在 `faijs-cadquery` 侧用 npm 的 `file:` 依赖（或 `overrides`）临时指向它，先把 A 桶 48 条按「镜像 + parity 逐位」逐项翻转；PR 合并后再切回 registry 版本。

---

## 6. 验收判据（硬门禁）

1. **零回归**：与 P0-6 基线取 PASS/FAIL **集合 diff**（不是 parity 数字）。既有 PASS 不许翻红；PASS-NT 算通过但必须在镜像注释 + manifest `reason` 写明差异。
2. **翻转规则**：一条用例从 blocked 翻 ported 必须同时满足 ① 镜像文件存在且可跑 ② parity 逐位 ③ 变异测试（改坏关键分支 ⇒ 断言变红）。
3. **一次性 Python 捕获优先**（`C:\Users\ylt\cadquery-env\Scripts\python.exe`）。**捕获推翻设为结论就回写 §2**——这是「P1-1 / P2-3 / P3-1 / P5-1 / P6-a 五次捕获推翻五条纸面结论」换来的纪律。
4. **数据同步**：改判任意一条 ⇒ **同时**更新 `tests/manifest.json`（走 `tests/mark-blocked.ts`）+ `tests/coverage.json`（重算）+ 本文件 §2 + `2026-10-05-cadquery-post-occt56-plan.md` 的 §3。只改一处会让下一轮重算把结论翻回去。
5. **occt-wasm 仓自带门禁**：`cargo fmt --check` / `clippy -D warnings` / `tsgo --noEmit` / `eslint` / codegen drift check / bench gate / WASI `wasm.br` stale-check。**CI 只跑一次，且跑之前 1–4 已全过**（严禁用 CI 找 bug）。
6. **提交**：显式 `git add <path>`（禁 `-A`）、conventional commits（英文）、过门禁（禁 `--no-verify`）、**禁 `Co-Authored-By`**、**禁 git stash**。

---

## 7. 风险与守卫

| # | 风险 | 守卫 |
|---|---|---|
| **R1** | P0 跳过 ⇒ 增量失去可用的对拍基线，分不清哪些是新 binding 的功劳、哪些是我改坏的 | P0-6 列为硬前置；不过不许进 W0 |
| **R2** | 用 `D:\Faicad\OCCT`（上游 master @ 2026-08）替 submodule | **禁止**。① façade 是照 `andymai/OCCT` fork @ `c540f31` 写的；② master 已现代化（`Standard_False` 标 `Standard_DEPRECATED`，`Handle(x)` → `occ::handle`），编译面有漂移风险；③ fork 可能带 `CLAUDE.md` 里提到的 `#348` 那一类针对 upstream 的补丁。本地 OCCT **只作签名对照源**用 |
| **R3** | 新 wiring 超 16 标量 ⇒ Rust crate 静默失去该方法 | 每个新 spec 加完必须看 codegen 输出的那行 `npm-only (over wasmtime's 16-scalar ceiling ...)`；出现即重构为数组形参 |
| **R4** | `EvolutionData` 的哈希语义被误当成 History 够用 ⇒ W4 被做一半 | W4 的验收不用哈希值，必须用 handle 映射；任一 `(input → outputs)` 映射拿不到即为不过 |
| **R5** | `fuzzyValue` / `Intersection=true` 掩盖真几何失配（假 PASS） | 判据要求「拓扑/面数恢复 **且** 体积不变」；只恢复拓扑不算 |
| **R6** | `wasm.br` 未重装 ⇒ CI 红 | 每次 façade 改动后跑 `scripts/reembed-wasmbr.sh <pr>`，**只吃 CI 产物**，不吃本地 `build-wasi` |
| **R7** | 把 "occt-wasm 没绑" 当成唯一瓶颈，忽略真 bottleneck（装配求解器 14 条） | §2.5 明示：求解器 14 条是算法缺口（上游用 casadi，OCCT 无此能力），不排绑定 |
| **R8** | WebKit 上 dist 体积增长失控（解除 TKFeat 链接后） | W5-c 强制记录、比对 `dist/occt-wasm.wasm` 字节数增量；超过阈值先讨论再合 |
| **R9** | 标签沉底：`kernel:*` 标签一旦写进 manifest 就无人复核 | C 桶 9 条的教训 ⇒ 新规：**任何 `kernel:` 标签必须附 `reason` 指向探针脚本或 commit**，否则不许写入 manifest |

---

## 8. 附录

### 8.1 本次生成的取证脚本（保留，可重跑）

| 文件 | 用途 |
|---|---|
| `scripts/_analysis/_blocked-tags.ps1` | 从 `tests/manifest.json` 聚合 41 个 `blockedBy` 标签的条数 + 样本名（本文 §1.1 ①） |
| `scripts/_analysis/_reasons.ps1` | 导出指定标签的 `reason` 字段（本文用它的空结果佐证 E 桶证据不足） |
| `scripts/_analysis/probe-fillet-chain.mjs` | **判别探针**：直调 `node_modules/occt-wasm@5.6.0`，证明链式 fillet 已可用（本文 §2.4，推翻既有 §3.4 结论） |
| `scripts/_analysis/out-blocked-tags.txt` | 标签/条数/样本名快照 |
| `scripts/_analysis/out-toolchain.txt` | 本机 Rust / emsdk / cmake / Docker 实测状态（本文 §5.0） |

### 8.2 occt-wasm 当前 212 方法全清单（用于快速判定"某能力到底有没有"）

```
构造 makeBox makeBoxFromCorners makeCylinder makeSphere makeCone makeTorus halfSpace makeEllipsoid makeRectangle
布尔/变形 fuse cut common intersect section sectionPlane fuseAll cutAll split intersectionCells
成形 extrude revolve fillet chamfer chamferDistAngle chamferAsymmetric shell offset draft pipe simplePipe
     loft loftWithVertices sweep sweepPipeShell sweepOriented sweepAdvanced sweepFull draftPrism
线/面/体 makeVertex makeEdge makeLineEdge makeCircleEdge makeCircleArc makeArcEdge makeEllipseEdge
     makeEllipseArc makeBezierEdge makeBSplineEdge makeTangentArc makeHelixWire makeHelixWireHanded
     makeWire makeFace makeNonPlanarFace addHolesInFace removeHolesFromFace makeSolid sew sewAndSolidify
     buildSolidFromFaces makeCompound buildTriFace makeFaceOnSurface makeNullShape
变换 translate alignX/Y/Z rotate scale mirror copy transform located generalTransform linearPattern
     circularPattern composeTransform translateBatch booleanOp booleanPipeline queryBatch filletBatch
     transformBatch rotateBatch scaleBatch mirrorBatch
内省 getShapeType isCompound isCompSolid isSolid isShell isFace isWire isEdge isVertex getSubShapes
     subShapeCount subShapeHashes downcast distanceBetween isSame isEqual isNull hashCode shapeOrientation
     sharedEdges adjacentFaces iterShapes edgeToFaceMap
网格/导入导出 tessellate wireframe hasTriangulation meshShape meshBatch importStep exportStep importStl
     exportStl toBREP fromBREP toBREPBinary fromBREPBinary cacheStep loadCached
度量 getBoundingBox getVolume getSurfaceArea getLength getCenterOfMass getInertia containsPoint
     getSurfaceCenterOfMass getLinearCenterOfMass surfaceCurvature vertexPosition surfaceType surfaceNormal
     pointOnSurface outerWire reverseSurfaceU uvBounds uvFromPoint getFaceCylinderData
投影 projectPointOnFace classifyPointOnFace bsplineSurface curveType curvePointAtParam curveTangent
     curveParameters curveIsClosed curveIsPeriodic curveLength interpolatePoints
     interpolatePointsWithTangents projectPointOnEdge approximatePoints getNurbsCurveData curveDegreeElevate
     curveKnotInsert curveKnotRemove curveSplit liftCurve2dToPlane projectEdges
输出/修复 toSVG toMultiviewSVG toPNG toMultiviewPNG thicken defeature reverseShape simplify filletVariable
     offsetWire2D translateWithHistory fuseWithHistory cutWithHistory filletWithHistory rotateWithHistory
     mirrorWithHistory scaleWithHistory intersectWithHistory chamferWithHistory shellWithHistory
     offsetWithHistory thickenWithHistory buildExtrusionLaw trimLaw sweepWithLaw fixShape unifySameDomain
     isValid healSolid healFace healWire fixFaceOrientations removeDegenerateEdges buildCurves3d fixWireOnFace
管理 createXCAFDocument importXCAFFromSTEP release releaseAll checkpoint releaseSince describe
     getRawModule getRawKernel
```

**判 C 桶/补充：** `makeNonPlanarFace` / `sweepFull` / `shell` / `makeSphere` / `*WithHistory` **都在清单里却不是真的通了**——这正是 §4 第 1 条说的「grep 命中 ≠ 参数面够」。
