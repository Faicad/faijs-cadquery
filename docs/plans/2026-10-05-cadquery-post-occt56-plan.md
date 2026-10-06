# faijs-cadquery 独立后开发计划（occt-wasm 5.6 重估版）

- 日期：2026-10-05
- 状态：**实施中 —— P0 已完成（2026-10-06）**，P1 起未开始
- 仓库：`D:\Faicad\faijs-cadquery`（`@faicad/faijs-cadquery`，已从 faijs monorepo 拆出为独立 git 仓）
- 上游基准：CadQuery **2.8.0**
- 内核：`occt-wasm@5.6.0`（`node_modules/occt-wasm/dist/index.d.ts`，peer `^5.6.0`）
- 前置文档（在 monorepo，不在本仓）：
  - `docs/plans/2026-10-03-cadquery-full-port-roadmap.md`（拆分前的路线图，本文件取代它的排期部分）
  - `docs/plans/2026-10-05-occt-wasm-upgrade-3-8-to-5-6-plan.md`（升级核对）
  - `docs/plans/2026-10-05-split-cadquery-freecad-to-standalone-git-repos.md`（拆分记录）

## 0. 用户原话（2026-10-05）

> 由于把faijs-cadquery和faijs-freecad从本项目的子包里独立出去了。你可以查看D:\Faicad\faijs-cadquery，D:\Faicad\faijs-freecad项目。
> 后续这两个项目的开发，其开发计划文档要写入各自自己的docs/plans目录里。
> 然后，由于occt-wasm从3.4升级到了5.6，增加了很多新的api，所以cadquery、freecad之前blocked的很多功能，要重新评估。请为这两个项目分别写一份新的开发计划，总结之前的进展以及后续的所有的开发内容和安排。

---

## 1. 之前进展的总结（拆分时的快照 + 独立后实测）

### 1.1 三个口径（2026-10-05 在本仓实读，非引用旧文档）

| 口径 | 数字 | 读法 |
|---|---|---|
| manifest（变量级） | **697 = 528 ported / 114 blocked / 55 skipped** | `node -e "...require('./tests/manifest.json')..."`（含 N7 后的 528） |
| blockedBy distinct | **42**（114 条） | 逐条聚合，见 §3 |
| coverage（上游测试函数级） | 297 = 214 PORTABLE / 41 PORTABLE-WITH-STUB / 42 BLOCKED | `tests/coverage.json`（2026-10-05 未重算） |
| 包内单测 | 642 全绿 / 60 文件 | `npm run test`（`pretest` 先 build） |
| 镜像文件 | 540 `.fai.js` + 22 `.fai.js.blocked` | `find tests -name "*.fai.js"` |
| 全量 parity | 458 PASS + 16 PASS-NT / 650 ref = **72.92%** | `out/report.json`（**2026-10-04 产物，该产物不在本仓**，见 §2） |

### 1.2 已完成的主体（不再重做）

| 类 | 内容 |
|---|---|
| Shape 内省 | `volumeOf/areaOf/lengthOf/boundingBoxOf/centerOfMassOf/isValidShape/geomTypeOf/centerOf/radiusOf/shapeTypeOf` |
| Plane 变换 | `toLocalCoords/toWorldCoords/mirrorInPlane`（P2） |
| 对象选择器 | CenterNth/LengthNth/AreaNth/RadiusNth/Box/NearestToShape/And/Sum/Subtract/Inverse（P4） |
| 对象栈 | P3-0…P3-4：`objects` 真源、`all/size/first/last/item/end/findSolid/add`、kind 即时压栈、`split` 双体、`parent` 全链 |
| 2D 草图选择器 | `applyStringSelector`（Center + 1e-4 簇容差 + 真求交 `and`） |
| λ 批次 | `filterByPredicate` / `sortByKey`（N3）、`textOnSpine`（N4 前段）、free `draft`（N5） |
| free function | `imprint`（B2-1）、`solid`/`solidWithInner`（B2-2）、`addCavity`（B2-7）、`offset`（B2-5）、`plane(w,l)`、`hollow`（shell 别名） |
| 镜像纪律 | 双终端/畸形产物归零（B0-6），守卫测试 `src/mirror-export-convention.test.ts` |

### 1.3 独立仓当前的**能力缺口**（拆分造成，必须先修）

| # | 事实（实测） | 影响 |
|---|---|---|
| **S-1** | 本仓 `out/` 只有一个空目录 `out/smoke/`；**没有** `out/ref/`（650 条 ref STEP）、`out/cand/`、`out/report.json`、也没有 `out/cache/v2.8.0/tests`（上游测试源码缓存） | **全量 parity 现在跑不了** —— 而 parity 是本项目唯一的验收尺子（§6 判据 1） |
| **S-2** | `tests/fixtures/ref/` 只有 **30** 个 `.step` 样例 | 只够冒烟，不够全量 |
| **S-3** | `tests/ref-harness/run-ref.py` 仍在，且由 `tests/baseline.json` 驱动（`git archive` 从 CadQuery 仓库拉锁定 tag 的 tests/） | **S-1 可自愈**：不需外部资产，重跑即可重建 |
| **S-4** | `package.json` 已改 registry peer（`@faicad/faijs` / `faijs-sketch` / `faijs-extra` / `occt-wasm` / `cq-compat-compare`），`@faicad/faijs-cadquery: file:.` 自引用 | 依赖链已独立，但**构建/测试是否真绿未在本次验证**（见 P0 判据） |
| **S-5** | 本仓 `src/workplane.ts:570` 直连 `getKernel() as unknown as OcctKernel` | **好消息**：接 occt-wasm 新 API **不需要 monorepo core 授权**（与 freecad 不同，见 freecad 计划 §4） |

---

## 2. occt-wasm 5.6 新面（实测取证，不是文档转述）

取证命令（本仓）：`grep -nE "^    [a-zA-Z_][a-zA-Z0-9_]*\(" node_modules/occt-wasm/dist/index.d.ts` ⇒ **212 个方法**。

### 2.1 相对 3.8.4 新增的 8 个方法（`index.d.ts` 行号）

| 行 | 方法 | 签名要点 |
|---|---|---|
| `:114` | `sectionPlane` | `(shape, origin: Vec3, normal: Vec3)` |
| `:157` | `chamferAsymmetric` | `(solid, edge, distance1, distance2, referenceFace?)` |
| `:219` | `sweepAdvanced` | `(profile, spine, options?: SweepAdvancedOptions)` |
| `:228` | `sweepFull` | `(profile, spine, options?: SweepFullOptions)` |
| `:250` | `makeHelixWireHanded` | `(origin, axis, pitch, height, radius, leftHanded?)` |
| `:304` | `booleanOp` | `(op, args[], tools[], options?) → EvolutionData` |
| `:540` / `:546` | `toPNG` / `toMultiviewPNG` | 光栅出图，与建模无关，本项目不用 |

### 2.2 XCAF 增量（`xcaf-document.d.ts`）

| 行 | 成员 | 意义 |
|---|---|---|
| `:93` | `addShape(shape, { assembly: true })` | compound 导入为**装配**（每顶层 child 一个 placed component） |
| `:127` | `getReferredLabel(label)` | component → 原型 label |
| `:135` | `getLocation(label)` | 3×4 行主矩阵（`OcctKernel.transform`/`located` 可直接吃） |
| `:141` | `getSubShapes(label)` | **部件的子形状 label（自带 name/color 者）** |
| `:148` | `addSubShape(label, shape, { name, color })` | **登记子形状并挂名/色** |
| `:158` | `exportGLTF` | 可视化出口，本项目排除 |

`RawXCAFKernel`（`:25-69`）另有 `xcafAddAssembly` / `xcafGetSubShapeLabels` / `xcafAddSubShape` / `xcafGetLabelLocation`。

### 2.3 新增类型与开关（`types.d.ts` 行号）

| 行 | 类型 | 关键字段 |
|---|---|---|
| `:36` | `BoundingBoxOptions` | `precise`（默认 true，精确极值）、`useTriangulation` |
| `:80/:82` | `WireframeSource` / `WireframeOptions` | `source: "curve" \| "triangulation"`、`deflection` |
| `:220` | `SweepContact` | None / Contact / ContactOnBorder（`BRepFill_TypeOfContact`） |
| `:234` | `SweepToleranceOptions` | `tol3d` / `boundTol` / `tolAngular` |
| `:262` | `SweepAdvancedOptions` | `mode` / `up` / `auxSpine` / **`curvilinearEquivalence`** / `guideContact` / **`transitionMode`** / `withContact` |
| `:299` | `SweepLaw` | None / Linear / SCurve |
| `:312` | `SweepFullOptions` | `support`（SpineSupport）/ `maxDegree` / `maxSegments` / `law` / `lawLength` / `lawEndFactor` |
| `:338` | `SweepOrientedOptions` | 含 **`curvilinearEquivalence`**（Auxiliary 专用） |
| `:384/:393` | `BooleanGlue` / `BooleanOpOptions` | **`glue`**、**`fuzzyValue`**、`simplifyAngularTolerance`、`inputFaceHashes` + `hashUpperBound` |
| `:437` | `EvolutionData` | `{ result, modified[], generated[], deleted[] }` |

### 2.4 仍然是缺口（**实测 grep 0 命中，不得再写「可能有」**）

```
grep -inE "prism|plate|filling|nsided|thruSection|multisection" index.d.ts types.d.ts
⇒ 仅命中 extrude 的 BRepPrimAPI_MakePrism 注释(:131) 与 draftPrism(:229)
```

| 能力 | 需要的 OCCT 原语 | 5.6 状态 |
|---|---|---|
| `interpPlate` / N 边域面填充 | `BRepOffsetAPI_MakeFilling` / `BRepFill_Filling` | **无**（`bsplineSurface` 是控制点近似，语义不同，不可冒充） |
| `Shape.remove` / `replace` | `BRepTools_ReShape`（Remove/Replace/Apply） | **无**（`defeature` 是「移除并填补」，语义不同） |
| `prism` from/to-face、thruAll | `BRepFeat_MakePrism` | **无** |
| 多截面 pipe | `BRepOffsetAPI_MakePipeShell::Add` × N | **无**（`sweepAdvanced`/`sweepFull` 仍是**单 profile**） |
| shell intersection-join | `MakeThickSolidByJoin` | **无** |
| XCAF **layer** 元数据 | `XCAFDoc_LayerTool` | **无**（name/color 有了，layer 没有） |
| 边→面投影 | `BRepProj_Projection` | **无**（只有 `projectPointOnFace:477` / `projectPointOnEdge:500` / `projectEdges:523` HLR） |

---

## 3. blocked 全量重估（114 条逐标签，**这是本文件的核心价值**）

判定口径：**「解封」= 5.6 提供了此前没有的原语通道**；「候选」= 通道有了但**等价性未经实测**，必须按 §6 判据 4 先做一次性 Python 捕获 + 真值固化，捕获得出「不等价」则回写为 blocked（不许凭乐观直接翻 ported）。

### 3.1 A 组 · 5.6 直接解封（确定）

| 标签 | 条数 | 5.6 依据 | 落点 |
|---|---|---|---|
| `narrow:chamfer-asym` | 1 | `chamferAsymmetric(solid, edge, d1, d2, referenceFace?)` `:157` —— 与上游 `MakeChamfer.Add(d1,d2,E,F)` + edge→face 映射表同构 | **P4**（`src/workplane.ts:5659/5670` 的抛错改为实现） |
| ~~`kernel:sweep-aux-spine-mode`~~ | ~~3~~ | **❌ 捕获推翻（2026-10-06，P1-1）**：5.6 的 `SweepAdvancedOptions.curvilinearEquivalence`（`:275`）**只有类型、运行时无效**——`sweepAdvanced({mode: Auxiliary, auxSpine, curvilinearEquivalence: true})` 返回 17759.157，与旧 sweepOriented mode 3 逐位相同，仍差 ref 20218.347 达 12.2%（`scripts/probe-aux-spine{,-steps}.py`）。**维持 blocked**，守卫测试 `src/sweep-aux-spine-guard.test.ts` 冻结拒绝 | 无（occt-wasm 上游真正实现 `SetMode(aux, CE=True)` 后重估） |
| `op:history-subshape` | 3 | `booleanOp(..., { inputFaceHashes, hashUpperBound })` → `EvolutionData{ modified, generated, deleted }` `:437`，正是上游 `History.generated/first/last` 的反查数据 | **P3** |
| `op:assembly-subshape-import` | **4 → 部分** | XCAF `getSubShapes:141` / `addSubShape:148` / `getLabelInfo` 的 `name` + `hasColor` + `color` | **P5**：**name/color 解封；`layer` 仍无 `LayerTool`** ⇒ 4 条里含 layer 断言的子项维持 blocked，并在 manifest `reason` 写明 `layer-metadata-unavailable` |

### 3.2 B 组 · 5.6 打开通道但等价性待实测（**候选，不许预先翻 ported**）

| 标签 | 条数 | 5.6 依据 | 待验问题 |
|---|---|---|---|
| `op:fuzzy-bool` | 5 | `BooleanOpOptions.fuzzyValue`（近重合几何合并）+ `glue`（BooleanGlue: Shift/Full 共面短路）`:393-402` | 上游 `BoolOptions.fuzzyValue` 的语义与 OCCT `SetFuzzyValue` 是否逐位等价；`glue` 会不会掩盖真交叉 |
| `kernel:boolean-near-coincident-bspline` | 4 | 同上 | **❌ 实测否决（2026-10-06，P2-3，`scripts/probe-near-coincident-bool.mts`）**：testTwistExtrude 对 ref/cand 直调内核 booleanOp——**plain 通道本身健康**（cut 2.6e-4 = 真实缝隙、common 999.9999996 ≈ cand 体积，对称无退化）；fuzzyValue(1e-3~1e-5) 虽让 cut→0「恢复」，但 common 从 cand 的 999.9999996 变为 ref 的 1000.0002620 ⇒ **体积被改变，触发 R3（假 PASS）风险，不达标**；glue Shift 无改变、Full 掩盖缝隙。退化根因在比较器（E 组，`@faicad/cq-compat-compare` 侧的两形体 cut 路径），**4 条维持 blocked，归 X-2 跨仓** | 无（需 comparator 侧修复评级，或 occt-wasm 提供不改变体积的近重合通道） |
| `kernel:sweep-multisection-pipe` | 5 | ~~`sweepFull` 的 `law`/`lawLength`/`lawEndFactor`~~ **❌ 捕获推翻（2026-10-06，P1-2）**：law 是**同一截面沿脊缩放**，实测（`scripts/probe-sweepfull-caps-r5.mts`）Linear/SCurve 对 r5 输出与单截面 sweep 逐位相同（vol 0.9134245、bb z [-0.0084, 1.4]、6 faces）——既不能加第二截面，端盖仍垂直于脊（ref 在截面平面封端）。逐条判定：r5 同形同尺寸（law 无用武之地）、r7/arcSweep/normalSweep/specialSweep 截面异形或各向异性/阶梯变化 ⇒ **5 条全维持 blocked** | 无（occt-wasm 暴露 MakePipeShell 多截面 `Add` 后重估） |
| `project` + `op:project` | 4（2+2） | `projectPointOnFace:477` / `projectPointOnEdge:500` | 只覆盖「点→面/边」；上游 `BRepProj_Projection` 是**边→面投影出曲线**。⇒ **点投影可解（子集），边→面仍 blocked** |

### 3.3 C 组 · 5.6 无关，但本仓可做（沿用旧判定，不因升级改变）

| 标签 | 条数 | 说明 |
|---|---|---|
| `op:extrude-until-face` + `op:cutBlind.until-face` | 7 | 含 G-G1 的 ref 异常，须**重新推导镜像**不可照源码写 |
| `op:prism-from-face` / `op:prism-tilt` | 5 | from-face 4 条内核依赖；tilt 1 条本仓可做（`extrude` 本就吃方向向量） |
| `getfixturevalue` | 5 | 内联 fixture 写镜像（其中 3 条需 export→importStep 内存往返） |
| `parametricCurve` / `op:parametricSurface` | 3 | 参数曲线/曲面 |
| `plane` | 2 | free `plane()` 无参「无限平面」重载不支持（内核无 ±1e60 平面原语） |
| `export` | 3 | `native_export` / `save_stl_formats` / `export_errors`；内核 `toBREPBinary`/`fromBREPBinary` 已存在（`:393/:395`），缺的是 `.fai.js` 侧字节/字符串通道 |
| `importBin` | 2 | 同上；**语义陷阱**：ref 的 `b`/`r` 体积逐位相同 ⇒ 写两个同形 box 能 PASS 但**不验证往返**，按 G-C19 原则不冒充 ported |
| `history:images` | 2 | 依赖 P3 的 History 反查 |
| `op:shell` / `op:pendingWires` / `op:shell-sew` | 4 | 本仓可做（多轮廓 pendingWires） |
| `eachpoint` | 1 | `eachpoint` 收 `Location → Shape` 回调（λ 可用，非语法缺口） |
| `cast` / `op:offset2D-multi-region` / `op:sweep-sketch-sections` / `op:extrude-taper-sketch` / `op:faceOn` | 5 | 零散值面与参数通道 |
| `op:assembly-solve` | **14** | 装配约束求解器（自研 pure-TS 全局 NLP），**与内核升级无关，仍是最大单项** |

### 3.4 D 组 · 5.6 仍无通道（维持 blocked，不排期到 5.6 之后才动的内核项）

| 标签 | 条数 | 缺的原语 |
|---|---|---|
| `kernel:fillet-chain-reapply` | 9 | fillet 接受 fillet 产出（TopoDS 接受面）；5.6 无新 fillet 通道 |
| `interpPlate` | 5 | `BRepOffsetAPI_MakeFilling` |
| `remove` | 2 | `BRepTools_ReShape`（`defeature` 仅近似，须 parity 判） |
| `kernel:shell-outward-opening` + `kernel:hollow-intersection-join` + `kernel:shell-intersection-join` | 5 | `MakeThickSolidByJoin` |
| `narrow:sphere-angles` | 3 | 高椭圆/球面角度构造（`gp_Elips` 参数化） |
| `kernel:loft-coplanar-sections` / `kernel:ellipse-tall-axis` / `kernel:crash-polygon-cutThruAll` | 3 | ThruSections 参数 / gp_Elips / 崩溃根因 |

### 3.5 E 组 · 归属不在本仓

| 标签 | 条数 | 归属 | 处置 |
|---|---|---|---|
| `comparator:open-shell-volume` + `comparator:vertex-degenerate-compound` | 3 | `@faicad/cq-compat-compare`（留在 monorepo） | 开壳三度量全失效（`∮x·n dA`），需 comparator 侧评级；本仓只能钉 reason，**不许自行翻 ported** |
| `op:shape-operator-overload` | 1 | core `lang/`（JS 无运算符重载） | 保持 blocked，不写 stub |
| `op:assembly-subshape-import` 的 layer 子项 | （见 A 组） | occt-wasm 上游 `LayerTool` | 维持 blocked + reason 写明 |
| 核心装载根因（assembly 子路径被装载成根包） | 原 2 条 | core `packages/core/src/lang/metadata-extractor.ts:145` `derivePackageName()` 丢子路径 | 拆分后需走**跨仓协作**：提 issue + 本仓规避方案（镜像里显式 `import` 根包后再取子路径） |

### 3.6 重估后的净预期

| 口径 | 值 |
|---|---|
| 确定解封（A 组） | **11 条**（1 + 3 + 3 + 4 中的 name/color 部分，layer 子项不计） |
| 候选待验（B 组） | **18 条**（5 + 4 + 5 + 4），**实测后才定，不许预先计入** |
| 本仓可做、与升级无关（C 组） | **51 条** |
| 内核依赖残余（D 组） | **27 条** |
| 非本仓（E 组） | **7 条** |

> 合计 114。**注意：A 组 11 条是「通道已开」不是「已解锁」——解锁仍需写镜像 + parity 逐位通过。**

---

## 4. 开发批次（P0 → P7）

批次纪律：**每批独立 commit、独立测试、独立可停**；任一验收不过就停在本批。**每批开工先跑一次性 Python 捕获**（§6 判据 4），捕获若推翻本表结论，**以捕获为准并回写 §3**。

| 批 | 主题 | 规模 | 预期解锁 | 依赖 |
|---|---|---|---|---|
| **P0** | **独立仓自举 + parity 基线重建**（S-1/S-2/S-4） | 中 | 恢复尺子（0 条 parity 增量） | 无，**必须最先做** |
| **P1** | sweep 族：aux-spine 3 + multisection law 试 5 | 中 | 3 确定 + 0~5 候选 | P0 |
| **P2** | 布尔稳健：`fuzzyValue`/`glue` 接入 → 5 + 4 | 中 | 0~9 候选 | P0 |
| **P3** | History 子形状反查（`EvolutionData`）3 + images 2 | 中 | 5 | **P2**（同一 booleanOp 底座） |
| **P4** | `chamferAsymmetric` 1 + `makeHelixWireHanded` 新镜像 | 小 | 1 | P0 |
| **P5** | XCAF 子形状 name/color 读回 + 装配导出结构 | 大 | 4（layer 除外） | P0 |
| **P6** | 本仓可做 op 批（C 组 51 条，再拆子批） | 特大 | ~40（逐子批） | P0 |
| **P7** | 长线：装配求解器 14 + 内核残余 27 + comparator 3 | 特大 | 排期问题，不是「不做」 | P3/P5 |

---

### P0 · 独立仓自举与 parity 基线重建（**最先做，否则后面所有验收无尺子**）

**状态：✅ 已完成（2026-10-06）。** 后续所有批次的「零回归」判据 = 与本次 `out/report.json` 取 PASS/FAIL **集合 diff**。

| 序 | 项 | 结果 |
|---|---|---|
| **P0-1** | 独立仓自举 `npm install && build && typecheck && test` | ✅ build / `tsc --noEmit` / `npm test` **642 通过（60 文件）**均绿。两条须知：① `npm install` 在本仓依赖图上必崩（npm 10.9.7 arborist `#loadPeerSet` → `edgesOut of null`），须 `--legacy-peer-deps`；② **`npm run lint` 有 3 个 HEAD 既有 error**（`src/draft.test.ts:26-27` 未使用的 `createRuntime` / `registerOcctBrepEngine` / `createNodePorts` import）——本仓 CI（`.github/workflows/ci.yml:36`）会跑 lint，故 **CI 目前会红**。这三条在 monorepo 时代从未被拦（旧 eslint glob 不含本包），属拆出后新门禁暴露的既有违规，**未擅自修改**，待定夺 |
| **P0-2** | 重建 ref（`run-ref.py`，用 `C:\Users\ylt\cadquery-env\Scripts\python.exe`） | ✅ **650 STEP / 305 cases**（其中 47 条 ref 自身 error），`out/ref/manifest.json` 就位 |
| **P0-3** | 重建上游测试源码缓存 | ✅ `out/cache/v2.8.0/tests` 就位 |
| **P0-4** | 全量 `run-cand.ts` → `compare.ts` ⇒ 本仓 parity 基线 | ✅ 见下表 |
| **P0-5** | 「parity 资产不入库」写入 `tests/README.md` | ✅ 到位（并顺带修正拆分后失效的 handover 链接） |

#### P0-4 基线（2026-10-06 全量，`out/report.json`）

| PASS | PASS-NT | FAIL | ERROR | BLOCKED(no cand) | ref cases | parity |
|---|---|---|---|---|---|---|
| **474** | **19** | **22** | **1** | **135** | 650 | **75.85%** |

镜像运行侧（`run-cand.ts`，543 个可跑镜像）：**518 exported / 15 failed**（12 无对应 ref 的不计）。

> ⚠ **基线口径三条（不可忘）**
> 1. **拆分前的 `out/report.json`（458 PASS + 16 PASS-NT = 72.92%）没有随仓迁移** ⇒ 逐例 PASS/FAIL 集合无法与拆分前做 diff。本表是**新基线**，从它起算。聚合数与拆分前相容（FAIL=22 与既有「~21 条 class-D 既存几何不符」吻合），但不能据此宣布「零回归」——重建的 ref（P0-2）本身就可能与旧 ref 有别。
> 2. `out/` 已 gitignore ⇒ 基线是**生成物**，换机/换包后必须按 `tests/README.md` 的命令重建，再以 PASS/FAIL 集合（不是 parity 数字）做零回归判定。
> 3. parity 分母是 ref 全部 650 条，**BLOCKED 计入分母**；135 条 blocked 的构成见 §3。

#### P0-4 运行时失败明细（15 条，`run-cand.ts` 层）

| 类 | 条数 | 症状 | 归因 |
|---|---|---|---|
| 字体资源缺失 | **8 → ✅ 已修（2026-10-06）** | `[NodeFontProvider] font file not found: …/@faicad/faijs/dist/assets/fonts/OpenSans-Regular.ttf` | **归因更正：字体是宿主（host）责任，不是 core 缺陷**——core 的 `NodeFontProvider` 本就是依赖注入设计（`defaultFontPath`，注释「发布态由宿主注入覆盖」），但 `cliMain` 只透传 `fontsDir` 不透传 `defaultFontPath` ⇒ 本仓 CLI（`tests/faijs-cli.mjs`）改为直调 `cliRun` 并注入 `FAIJS_DEFAULT_FONT`（run-cand 默认指向 monorepo core 的源字体，env 可覆盖）。实测 9 条 Text 镜像全导出。已发布的 tgz 不含内置字体 ⇒ 下游宿主必须自行注入 |
| `draftPrism: Invalid shape ID: 0` | **3** | 锥度拉伸（taper）路径 | 本仓镜像/内核适配（`testTaperedExtrudeHeight__s`、`testTaperedExtrudeCutBlind__s`、`TestCQSelectors__testCenterNthSelector__prism`） |
| `cqa.constraint is not a function` | **2** | `@faicad/cq-compat-assembly` 命名空间缺 `constraint` | **§5 X-1**（core `metadata-extractor.ts:145` `derivePackageName()` 丢子路径 ⇒ 子路径被装载成根包）。`test_toCompound__assy1` / `__c3` |
| `fillet: TopoDS::Solid` | **1** | fillet 入参非 Solid | `TestCadQuery__testFillet__c` |
| `cut: boolean operation failed` | **1** | shell 后布尔失败 | `TestCadQuery__testClosedShell__s3` |

#### P0-4 比对失败明细（23 = 22 FAIL + 1 ERROR；均为「ported 但几何不符」的 class-D 既有项）

- `test_shapes` ×4：`test_siblings__level_1/2/3/123`（volΔ 60%~300%）
- `test_free_functions` ×4：`test_draft__res1/res2`、`test_text__r7/r8`
- `test_cadquery` ×9：`testTwoWorkplanes__r/t`(5.16/5.29%)、`testMultiWireWorkplane__r`(5.16%)、`testCutToFaceOffsetNOTIMPLEMENTEDYET__r`(5.16%)、`testGlue__obj/res`、`testNestedCircle__s`、`testWorkplaneCenterMove__t`、`testWorkplaneOnExistingSolid__c`
- `test_assembly` ×5 + ERROR ×1：`test_toCompound__assy0/c1/c2/nested_assy`、`test_infinite_face_constraint_Plane__assy`、ERROR `test_PointInPlane_param__box_and_vertex`（`cut: boolean operation failed`）

> 其中 `testTwoWorkplanes__r` 的镜像内已带 `// -> expect FAIL, records the pending-wires-as-list gap` 注释 ⇒ 属**已知**缺口，与 §3.3 的 `op:pendingWires`（本仓可做）为同一根因。

---

### P1 · sweep 族

| 序 | 项 | 动作 | 判据 |
|---|---|---|---|
| **P1-1** | ~~aux-spine 3 条解锁~~ → **❌ 捕获推翻（2026-10-06）**：5.6 `sweepAdvanced` 的 `curvilinearEquivalence` 运行时无效（17759.157 = 旧 mode 3 值，差 ref 12.2%）。镜像恢复 blocked，拒绝路径保留，守卫测试 `src/sweep-aux-spine-guard.test.ts` 冻结 | 捕获证据 `scripts/probe-aux-spine{,-steps}.py`；待 occt-wasm 真正实现 `SetMode(aux, CE=True)` 再重估 |
| **P1-2** | **multisection 5 条逐条试 law** | 对每条判「截面是否同形仅尺寸变」：是 ⇒ 试 `sweepFull({ law, lawLength, lawEndFactor })`；否 ⇒ 维持 blocked | 逐条记体积/bbox/拓扑对照；**判别量是端盖平面 + bbox，不是体积**（体积可能巧合接近） |
| **P1-3** | `transitionMode` 通道 | **✅ 已确认（2026-10-06）**：上游 `Workplane.sweep` 签名默认 `transition='right'`（→ `SetTransitionMode(RightCorner)`），而 kernel `sweepAdvanced` 默认 `Transformed`（types.d.ts:284）——**不一致**。本仓 `sweep()` 走 `BRepOffsetAPI_MakePipe`（无 transition 参数，代码内已注明「Documented, not silently ignored」），既有镜像均按此通过 parity ⇒ **不改行为，只记录差异**；若未来接 `sweepAdvanced`/`sweepFull` 主路径，须显式传 `transitionMode` 对齐上游 'right' |

### P2 · 布尔稳健（`booleanOp` 底座）

| 序 | 项 | 判据 |
|---|---|---|
| **P2-1** | **✅ 完成（2026-10-06）**：`booleanOpBase` 底座接入（`src/workplane.ts`，export 供测试），单 solid/单 solid-compound 结果自动 clean（与上游 clean=True 对齐），多 solid compound 跳过（simplify 会炸句柄）。plain 路径零回归（全量 651 测试通过） | 既有 PASS 零回归 ✅ |
| **P2-2** | **✅ 校准完成（2026-10-06，`scripts/probe-fuzzy-bool.py` + `probe-fuzzy-clean.mts`）**：`fuzzyValue` 与上游 `tol`→`SetFuzzyValue` 语义一致；fuzzy fuse raw 2.0006667 → clean 后 2.0009999999999994 = 上游 2.001 **逐位**；fuzzy cut→0、intersect→1.0 逐位。**op:fuzzy-bool 5 条通道就绪**——但解封仍需给 union/cut/intersect 暴露 tol 参数 + 写镜像跑 parity（尚未做） | 布尔探针恢复 + 体积 Δ ≤ 1e-6·rel ✅（底座层） |
| **P2-3** | **❌ 实测否决（见 §3.2）**：`kernel:boolean-near-coincident-bspline` 4 条维持 blocked（fuzzy 掩盖真实缝隙、体积被改，触发 R3） | 不达标，回写 blocked |
| **P2-4** | **✅ 完成**：变异测试——丢弃 options 后 4 条 fuzzy 断言变红，恢复后 7/7 全绿（`src/boolean-op-base.test.ts`） | 承重 ✅ |

### P3 · History 子形状反查（依赖 P2 的 booleanOp 底座）

| 序 | 项 | 判据 |
|---|---|---|
| **P3-1** | 用 `inputFaceHashes` + `EvolutionData{modified, generated, deleted}` 实现 `History.generated/first/last` | 一次性 Python 捕获上游 `History` 的面集合真值 → 固化 TS 断言 |
| **P3-2** | `op:history-subshape` 3 条 + `history:images` 2 条镜像 | parity 逐位（子形状集合是**非 STEP 输出**，按 §6 判据 3 走「选中实体 {type, center} 保序集合」比对） |

### P4 · 倒角与螺旋

| 序 | 项 | 判据 |
|---|---|---|
| **P4-1** | `chamferAsymmetric(solid, edge, d1, d2, referenceFace)` 取代 `src/workplane.ts:5659/5670` 的抛错 | `testChamferAsymmetrical__cube` parity 逐位；变异测试：翻转 d1/d2 ⇒ 断言变红 |
| **P4-2** | `makeHelixWireHanded`（左手螺旋）⇒ 补上游 handed 相关镜像（先一次性捕获确认上游 helix 是否有 handed 语义） | 有则解锁；**上游若无该语义则不立镜像**（不许为用新 API 而造需求） |

### P5 · XCAF 子形状 name/color

| 序 | 项 | 判据 |
|---|---|---|
| **P5-1** | `importStep` 走 XCAF：部件 `getSubShapes` + `getLabelInfo` 读 **name / color** | 与 E3b 既有 13 用例不回退 |
| **P5-2** | 装配导出结构：`addShape({ assembly: true })` + `getReferredLabel` + `getLocation` 的 3×4 矩阵 | 导出 STEP 能被自身 `importStep` 读回同名同色同位姿（往返断言） |
| **P5-3** | **`layer` 明确登记为缺口**：manifest `reason` 写 `layer-metadata-unavailable`（`XCAFDoc_LayerTool` 无绑定） | reason 到位，不许静默当解封 |

### P6 · 本仓可做 op 批（C 组 51 条，按「一次改动解锁多条」再拆）

建议子批顺序（每条开工前一次性捕获）：

1. **P6-a until-face 7 条**（`extrude("next"/"last")` + `cutBlind.until-face` + `faces(">X[1]")` 索引；**G-G1 ref 异常必须重新推导，不可照源码写**）
2. **P6-b 零散值面**（`cast` / `offset2D-multi-region` / `sweep-sketch-sections` / `extrude-taper-sketch` / `faceOn` / `eachpoint` / `parametricCurve` / `parametricSurface` / `op:shell` / `pendingWires` / `shell-sew`，共 ~14 条）
3. **P6-c fixture 内联**（`getfixturevalue` 5 + `plane` 2，其中 3 条需 export→importStep 内存往返通道）
4. **P6-d IO**（`export` 3 + `importBin` 2 —— 需先做 B1-1 ④ 的**前置决策**：要不要「不验证往返」的镜像；本计划倾向 **保持 blocked 并在 reason 写明 `pass-nt:no-roundtrip-channel`**，不冒充 ported）
5. **P6-e prism-tilt 1**（斜向减材，判据 `faces == 6+1`）

### P7 · 长线（排期，不是不做）

| 序 | 项 | 说明 |
|---|---|---|
| **P7-1** | 装配约束求解器（14 条）：pure-TS 全局 NLP，对标 CadQuery solver 语义 | 独立子系统设计，与内核升级无关 |
| **P7-2** | 内核残余 27 条 | 逐项保留 `blockedBy` 标签，**不许删标签**（R4） |
| **P7-3** | comparator 3 条 | 跨仓（compare 包在 monorepo） |

---

## 5. 与 monorepo / occt-wasm 上游的协作接口（拆分后的新约束）

| # | 事项 | 归属 | 本仓动作 |
|---|---|---|---|
| **X-1** | core `packages/core/src/lang/metadata-extractor.ts:145` `derivePackageName()` 丢子路径 ⇒ assembly 子路径被装载成根包 | monorepo core | 提 issue；同时给**本仓规避方案**（镜像内显式导入根包再取子路径）并在测试里冻结 |
| **X-2** | comparator 开壳三度量失效 | `@faicad/cq-compat-compare`（monorepo） | 提 issue + 本仓钉 `blockedBy: comparator:*`，**不自行翻 ported** |
| **X-3** | `XCAFDoc_LayerTool` 缺绑定 | occt-wasm 上游 | 登记缺口，不绕行 |
| **X-4** | `BRepOffsetAPI_MakeFilling` / `BRepTools_ReShape` / `BRepFeat_MakePrism` / 多截面 `MakePipeShell::Add` | occt-wasm 上游 | 同上；D 组 27 条挂在这些绑定上 |
| **X-5** | `@faicad/*` 版本漂移 | 本仓 peer `^0.29.0` | 独立仓不再受 `set-version` / `check-lockstep` 约束；**每次升级 peer 必须重跑 P0-1** |

---

## 6. 验收判据（硬门禁，不过 = 本批不做成）

1. **零回归**：`npx tsx tests/run-cand.ts` + `npx tsx tests/compare.ts`，与 **P0-4 的基线**取 PASS/FAIL 集合 diff —— 新解锁允许新增 PASS，**既有 PASS 不许翻红**。PASS-NT（几何逐位一致、仅拓扑差）算通过，但必须在镜像注释 + manifest `reason` 写明差异。
2. **包内单测全绿**：`npm run test`（`pretest` 先 build；改 `src/` 后 CLI 走 `dist`，**别用陈旧产物测**）。
3. **非 STEP 输出**（选择器/内省/对象栈/子形状集合）走「一次性 Python 捕获 → 真值固化进 TS 断言」：选中实体 `{type, center}` 保序集合 + count（center 1e-6，顺序敏感）；几何量 volume 1e-6·rel / bbox 1e-3 / bool 精确。
4. **每项开工先一次性 Python 捕获**（`C:\Users\ylt\cadquery-env\Scripts\python.exe`）。**捕获若推翻 §3 判定，以捕获为准并回写 §3** —— 这是 P3 三次「捕获推翻方案假设」换来的纪律。
5. **变异测试**：把新实现的关键分支改坏，断言必须变红。**没做过变异测试的断言不算验证。**
6. **数据同步**：改判任何一条 blocked ⇒ **同时**更新 `tests/manifest.json`（经 `tests/mark-blocked.ts`）+ `tests/coverage.json`（重算）+ 本文件 §1/§3 计数。只改一处会让下一轮重算把结论翻转。
7. **门禁**：`npm run typecheck` / `npm run lint`；新导出必须有 JSDoc。**注意**：本仓的 tsc 错误不会被 monorepo 的 pre-commit 拦到 ⇒ **提交前必须手动 `npx tsc --noEmit`**。
8. **CI 只跑一次且跑前 1–7 已全过**（`pwsh -NoProfile scripts/ci.ps1`）。严禁通过跑 CI 找 bug。

---

## 7. 风险与守卫

| # | 风险 | 守卫 |
|---|---|---|
| R1 | 把「5.6 打开了通道」当成「已解锁」（本计划最大的自我欺骗风险） | §3 严格区分 A/B/C/D 组；B 组 18 条**实测前不许翻 ported**；解锁判据 = 镜像存在 + parity 逐位 |
| R2 | P0 跳过 ⇒ 后续所有批次「零回归」无尺子 | P0 列为**硬前置**，不完成不进 P1 |
| R3 | `fuzzyValue` / `glue` 掩盖真几何失配（假 PASS） | P2 判据要求「布尔探针恢复**且**体积不变」；只恢复布尔不算 |
| R4 | 内核依赖项被当成「已定性不做」沉底 | §3.4 D 组逐项保留 `blockedBy` 标签，不许删 |
| R5 | 句柄泄漏 | 新接 `booleanOp` / `sweepAdvanced` 后跑 parity 时记 kernel arena 计数 |
| R6 | 为用新 API 而造需求（如上游无 handed 语义仍立镜像） | P4-2 判据明确：捕获不到上游语义就不立项 |
| R7 | 跨仓（core / compare / occt-wasm）事项被当成「本仓可做」 | §5 独立列接口清单，逐项标归属 |

---

## 8. 作业纪律（沿用，不得简化）

1. **镜像写法**：裸 Shape 中间量一律内联进消费它的调用（双终端陷阱）；实参位置不接受嵌套 `await`（`E_VALUE: unsupported value expression: AwaitExpression`）⇒ 长链摊平成逐句 `let`。
2. **λ 两硬约束**：λ 必须 `function` 声明体非箭头体；收 λ 的 op 必须 `await` 回调。两条都要双向防回归测试。
3. **`autoLift:false` 假绿**：CLI 下 `cq.*` 不提升为 op ⇒ `cq.*` 内部只能用内核级 `translateBrep` / `rotateBrep` / `kern().cut|fuse`。「CLI 下真能跑」只有 parity 能判。
4. **grep 计数三陷阱**：路径不存在⇒任何模式返回 0；注释被计入；只查 `cq.all(` 漏链式。两个口径都跑 + 人工判别。
5. **长任务串行**：一次只跑一个后台任务；启动下一批前确认上一批的 node/kernel 子进程已死。
6. **提交**：显式 `git add <path>`（禁 `-A`）、conventional commits（英文）、过门禁（禁 `--no-verify`）、**禁 `Co-Authored-By`**、**禁 git stash**。
