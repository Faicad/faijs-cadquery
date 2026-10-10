# faijs-cadquery 下一阶段开发方案（自有能力层 + 剩余 84 条清算）

- 日期：2026-10-10
- 状态：**待审（草稿）** —— 本文只做分析与排期，不含实现
- 仓库：`D:\Faicad\faijs-cadquery`（`@faicad/faijs-cadquery`，独立 git 仓，gitcode）
- 上游基准：CadQuery **2.8.0**（ref 650 条 STEP）
- 内核：`occt-wasm@5.6.0`（peer `^5.6.0`）；宿主：`@faicad/faijs@0.30.9`
- 前置文档（本仓 `docs/plans/`）：
  - `2026-10-05-cadquery-post-occt56-plan.md`（P0–P7 批次与 blocked 重估）
  - `2026-10-06-occt-wasm-extension-plan.md`（A–E 桶分类、W0–W5 内核扩展）
  - `2026-10-07-occt56-api-unblock-reassessment.md`（U1–U6 / T1–T4 解锁）

> **本文取代前三份文档的「排期部分」**，其取证结论仍然有效；冲突处以本文 §3 的三分表为准。

---

## 0. 三句话结论

1. **进度**：`tests/manifest.json` = **697 条 → 558 ported / 84 blocked / 55 skipped**（34 个 `blockedBy` 标签）；镜像 **563 个 `.fai.js` + 18 个 `.blocked`**；包内单测 **72 文件 / 680 用例**（实测 2026-10-10，1 条红，见 §1.3）；**已验证的 parity 基线仍是 2026-10-07 全量的 80.00%**（500 PASS + 20 PASS-NT / 650），此后 4 次提交**没有重扫**，尺子已过期。
   > **2026-10-10 回写**：manifest 已推进到 **573 ported / 69 blocked / 55 skipped · 26 个 `blockedBy` 标签**
   > （A 类 12/12 翻完，见 §3.1.1；B 类 N2 的 `narrow:sphere-angles` 与 `plane` 各 1 条已翻，见 §3.1.1 ⑤⑥）；N2-0 骨架已落地
   > （`src/kernel/` + `src/adapters/faijs.ts` + 边界探针）；单测 **76 文件 / 720 用例**，仍**只有 1 条红**
   > （§1.3 的 `TestCQSelectors__testShape__res4`，宿主策略，与本轮改动无关）；
   > parity 基线**仍未重扫**（§5 N0-3 待办）。
   > **分类实况（按 plan 时 manifest 逐标签重算，见 §3.5）**：A **11**（不是 12）/ B **25→余 16** /
   > C **43→47** / D **6**（不是 5）；blocked **84 → 69**，**翻转 15 条** = A 11 + B 4。
   > 校验：`0 + 16 + 47 + 6 = 69` = 实测 blocked ✅（N2-1 时点：`0 + 21 + 43 + 6 = 70` ✅）。
   > §3.2 原文的 `14 + 1 + 4 + 2 + 1 + 1 = 22` 与 §3.4/§3.5 的 `D = 5` **两处各错一条且方向相反**，
   > 恰好让 §3.5 的 `0 + 22 + 43 + 5 = 70` 靠抵消而「验算通过」——以本节重算值为准。
   > 另：`plane` 与 `project` 两个标签在 N2 的捕获下**都从 B 类移出**（1 翻 / 1 判 D / 4 判 C），
   > 故 §3.2 的 B 表实际只剩 `op:assembly-solve` 14 + `export:free-face-in-compound` 1 + `op:faceOn` 1。
2. **剩余 84 条能不能自己做**：真内核缺口 **42 条**（必须 fork occt-wasm，而本机 Rust/emsdk/cmake **至今一台都没装**，见 §1.4）；**可自造 ~24 条**（装配求解器 14 为首）；**本仓值面 ~14 条**；**不可控 4 条**（比较器/证据不足）。
3. **关于「自己的扩展库」**：**能做，而且应该分层做**——faijs-gears 已经给出了可复制的模板（§4.1）。但推荐形态是**先在本仓内建 `src/kernel/`（内核原语层）+ `src/solver/`（自研求解器）**，把散落在 `workplane.ts` 里的直调收进一层；**等出现第二个消费方（faijs-freecad）再拆成独立包**，而不是现在就开新仓（理由见 §4.4）。

---

## 1. 现状（2026-10-10 实测，不是转述）

### 1.1 四个口径

| 口径 | 值 | 取证命令 |
|---|---|---|
| manifest（变量级） | **697 = 558 ported / 84 blocked / 55 skipped**，blocked 分布在 **34** 个标签 | `node -e "…require('./tests/manifest.json')…"` |
| 镜像文件 | **563 `.fai.js` + 18 `.fai.js.blocked`**（另有 10 个**死镜像**停在 `tests/` 顶层，不参与扫描） | 遍历 `tests/<module>/` |
| 包内单测 | **72 文件 / 680 用例 / 1 红**（5m42s，含 build） | `npm test` |
| 全量 parity | **500 PASS / 20 PASS-NT / 18 FAIL / 1 ERROR / 112 BLOCKED / 650 ref = 80.00%** —— 来自 `out/report-final.json`（**2026-10-07 11:26**） | `npx tsx tests/run-cand.ts` + `tests/compare.ts` |

> ⚠ **尺子过期警告**：`out/report.json` 当前是 2026-10-08 的一次 `--only` 残留（仅 2 条），`report-final.json` 是 10-07 的产物；此后 `9c639eb`（shellFromFaces）、`da432ab`（lego tmp）、`527f24d`（assembly export）、`9a9cc94`（parametricCurve/Surface）、`81468c3`（faijs 0.30.9）、`3dfb002`/`85d76ff`（unwrapShape/isValidShape）**六次提交全量未重扫**。本文所有「零回归」判断在 N0 完成前都**不成立**。

### 1.2 门禁实测

| 项 | 结果 |
|---|---|
| `npx eslint src` | ✅ 绿（P0 时代暴露的 3 条 HEAD 既有 error 已在 `60b7c07` 修掉） |
| `npx tsc --noEmit` | ✅ 绿（含未提交 WIP） |
| `npm test` | 🟡 679/680 绿，1 红见 §1.3 |
| lint 依赖面 | 🟡 `peerDependencies` 已分裂：`@faicad/faijs ^0.30.9` 但 `faijs-extra/sketch ^0.29.0`（实装 0.29.5）⇒ `npm install` 仍需 `--legacy-peer-deps` |

### 1.3 唯一红灯（新发现，必须进 N0）

```
FAIL src/parity-smoke.test.ts > TestCQSelectors__testShape__res4
FAIL tests/test_selectors/TestCQSelectors__testShape__res4.fai.js:
  All 1 live terminal(s) are 2D (no solid) — nothing to export as a 3D part (skipped: result)
```

- 该用例在 **2026-10-07 全量基线里是 PASS**（`ref f0/e4/v8 vs cand f0/e4/v8`，逐位），是**边 compound**（无 solid）。
- 报错字符串实测位于 **`node_modules/@faicad/faijs/dist/node-host/cli.js`**（G0-D「二维终端过滤」分支，`if (!includeHidden)`），**不在本仓代码里**。
- **疑似归因**：`81468c3` 把 `@faicad/faijs` 提到 0.30.9，宿主 CLI 新增了 2D 终端过滤 ⇒ 所有「只有线/面/边终态」的镜像都可能被跳过。
- **尚未 A/B 证真**（未降级回 0.30.8 复跑），因此本文只标「疑似」。但**这恰恰是 §4 的核心论据**：parity 尺子长在 faijs 宿主 CLI 上，宿主一改策略，本仓的 PASS 集合就被单方面改写。
- 逃生口已存在：`tests/faijs-cli.mjs` 已经把 `parseArgs` 的 `includeHidden` 透传给 `cliRun`，可按需开启；另一条路是自造导出通道（§5 N4）。

### 1.4 内核扩展通路：仍然不通

```
rustc / cargo / rustup   NOT FOUND      emcc / em++   NOT FOUND
cmake / ninja / wasm-opt NOT FOUND      Docker        NOT FOUND
D:\Faicad\occt-wasm      git describe = v5.3.5（main），未切 v5.6.0，未建 ext 分支
```

⇒ `2026-10-06-occt-wasm-extension-plan.md` 的 **Phase 0 一步未动，W0–W5 全线不可执行**。这不是「慢」，是**零通路**。所以 §3 的 42 条真内核缺口在本机目前**没有任何解锁路径**，只能：① 装工具链（N5，长线）② 维持 blocked + 冻结守卫。

### 1.5 工作区脏状态

`src/workplane.ts` 有 **68 行未提交改动**：`shapeUnion / shapeIntersect / shapeDifference`（CadQuery `Shape.__or__/__and__/__mod__` 的**集合运算**语义，不是几何布尔），对应 `op:shape-operator-overload`（1 条）。类型/ lint 均绿，但尚未挂镜像、尚未翻 manifest。**N1 第一件事就是把它收口。**

---

## 2. 已经做完的东西（不再重做）

| 面 | 内容 |
|---|---|
| Workplane DSL | 对象栈 P3-0…P3-4（`objects` 真源 / kind 即时压栈 / `split` 双体 / `parent` 全链）、Plane 变换（`toLocalCoords`/`toWorldCoords`/`mirrorInPlane`） |
| 选择器 | 方向/中心/半径/长度/面积 Nth、Box/NearestToShape/And/Sum/Subtract/Inverse、2D `applyStringSelector` |
| Shape 内省 | `volumeOf/areaOf/lengthOf/boundingBoxOf/centerOfMassOf/isValidShape/geomTypeOf/centerOf/radiusOf/shapeTypeOf` |
| free function | `imprint`、`solid`/`solidWithInner`、`addCavity`、`offset`、`plane(w,l)`、`hollow`、`shellFromFaces` |
| λ 批次 | `filterByPredicate`、`sortByKey`、`textOnSpine`、free `draft` |
| 布尔 | `booleanOpBase` 底座 + `fuzzyValue`（对齐上游 `tol`→`SetFuzzyValue`），`union/cut/intersect` 暴露 `{tol}` |
| 倒角/螺旋 | `chamfer` length2（`chamferDistAngle` + 角度换算）、`helix` handed 修正 |
| 装配 | XCAF 真装配导出（`save()` 走 raw occt-wasm）、`importStep`、`constraint/constraintEx/buildAssembly/solve/toCompound` |
| IO | `exportBrep/importBrep`（文本）+ `exportBin/importBin`（二进制，走 `toBREPBinary/fromBREPBinary`） |
| 参数面 | `parametricCurve`、`parametricSurface`、`splineFace`（`bsplineSurface` + `approximatePoints`） |
| 纪律资产 | 5 个冻结守卫测试（`extrude-until-face` / `sweep-aux-spine` / `assembly-subshape-import` / `assembly-layer-metadata` / `sweep-aux-spine-sweepfull`）+ 镜像导出约定守卫 |

---

## 3. 剩余 84 条的三分表（本文核心价值）

判定口径：**「自造」= 只用 occt-wasm 已有的 212 个方法 + TS 算法层就能给出与上游逐位等价的结果**；凡需要 OCCT 内部状态（历史映射、XCAF 文档层、特征建模器）的一律判「内核」。

### 3.1 A 类 · 本仓值面可做（**14 条，零新依赖**）

> **2026-10-10 回写**：本表 14 条中 **11 条已翻 ported**（第 12 条 `test_assembly_step_import_roundtrip__assy`
> 改判 D 类，见 §3.1.1 与 §3.5）；`op:faceOn` 与 `op:sweep-sketch-sections`
> 经一次性捕获判定为**误判**，实为内核/算法缺口，已回写（见 §3.1.1）。manifest 现为
> **573 ported / 69 blocked / 55 skipped**。

| 标签 | 条 | 动作 | 判据 |
|---|---|---|---|
| `getfixturevalue` | 5 | **4 已翻**（内联 fixture 写镜像；3 条内存 export→importStep 往返 `exportBin/importBin`）；第 5 条 `test_assembly_step_import_roundtrip__assy` **改判 D 类**（`ref:step-roundtrip-drops-part`，见 §3.4） | 往返体积/拓扑逐位 |
| `op:shape-operator-overload` | 1 | ✅ **已翻**（`shapeUnion/Intersect/Difference` + `test_set_ops__*` 镜像 + 变异） | 集合语义（非布尔），面计数 |
| `op:faceOn` / `eachpoint` / `cast` / `op:pendingWires` / `op:extrude-taper-sketch` / `op:sweep-sketch-sections` | 6 | λ 分发与值面通道 → **4 已翻，2 误判**（§3.1.1） | 一次性捕获真值 |
| `op:prism-tilt` | 1 | ✅ **已翻 2026-10-10**：`cutBlind(wp, depth, { dir })`（本仓扩展）建**平移**斜棱柱作切具 | 逐位 PASS f7/e15/v10 |
| `kernel:ellipse-tall-axis` | 1 | ✅ **已翻 2026-10-10**：旧注「主轴恒在 global X、旋转会重近似」**两半都错**（§3.1.1） | 逐位 PASS f4/e6/v4 |

#### 3.1.1 捕获回写（2026-10-10，以实测为准）

判据纪律见 §5：「捕获推翻本文结论的，以捕获为准并回写 §3」。本轮结论如下（①–⑥）。

**① `op:prism-tilt`（`test_prism__res3`）— 已翻。** 本表原文「本仓 `extrude` 本就吃方向向量」
只对了一半：核 `extrude(face, dx, dy, dz)` 是 `BRepPrimAPI_MakePrism` **平移**棱柱，方向向量一直
都吃；缺的是**切割侧**的接线。一次性 Python 捕获钉死语义：上游 `prism(ctx, base, profile, t, dir,
additive=False)` 的 `dir=(0,0.1,1)` 是**增材侧**，`additive=False` 时刀沿 **(0,−0.1,−1)** 走；
切除体积恒为 πr²·h（截面是**剪切**而非旋转）。镜像逐位 PASS：volΔ 1.1e-6 %、质心Δ 4.1e-9、
bboxΔ 0、booleanΔ 0、拓扑 f7/e15/v10。变异（翻转倾角符号）体积不变但质心移 0.0144 → FAIL。

**② `kernel:ellipse-tall-axis`（`TestCQSelectors::testEdgeTypesFilter__c`）— 已翻，且旧注释两半都错。**
探针 `src/ellipse-axis.probe.test.ts` 实测：

- `makeEllipseEdge` 的主轴落在 `gp_Ax2(center, normal)` 的**默认 X 方向**，该方向**随法向变化**
  （+Z→+X、−Z→−X、±X→±Z、±Y→±Z、(1,1,0)→(1,−1,0)/√2、(1,1,1)→(1,0,−1)/√2），
  **不是** global X（原文「恒在 global X」错）；
- 刚性 `rotate` **保持解析曲线**：`curveType()` 仍是 `ellipse`、bbox 精确、体积 π·major·minor
  到机器精度。只有 **矩阵**通路（`transform`/`generalTransform`）会把椭圆降为 B 样条 ——
  原文说的 0.4 % 体积漂移出自那里，不是 `rotate`（原文「旋转会重近似」错）。
- 它仍**拒绝 major < minor**（`gp_Elips() - invalid construction parameters`），所以「高」椭圆
  必须先建宽边再转向：`buildProfileWire` 现在**实测**主轴方向（OCC `Geom_Ellipse` 的
  `u = FirstParameter` 正好在主轴端点上）后绕平面法向转到平面的 +Y。镜像逐位 PASS
  （volΔ 0、bboxΔ 0、拓扑 f4/e6/v4）；质心残差 6.7e-5 来自 **ref 自身**（其 com.y = +6.71e-5，
  而该实体关于 y=0 对称，数学上必须为 0），已在镜像头注明。

**③ `op:faceOn`（`test_faceOn__f2`）— 误判，不是 λ 分发。** 需要**二维插值**样条
（CadQuery 走 `Geom2dAPI_Interpolate`），而本仓 `makeBSpline2d` 把输入点当**控制极点**
（近似式，见 vendored `kernel2dOps.js:142-147`），无法复现 `edgeOn/wireOn`。还缺
「曲面上的 pcurve 边」（`kernel.buildEdgeOnSurface` + `buildCurves3d`，可经 `getRawModule()` 触达）
与 `Face.trim(outer, *inner)`＝`BRepBuilderAPI_MakeFace(surface, wires)` 的**内环**支持
（`cad.faceOnSurface` 只吃单 wire）。⇒ 归 **N2（内核原语层）**。顺带两条捕获更正：
自由函数 `sphere(4)` 的 4 是**直径**（`shapes.py:6653`，半径 2），`text("CQ",1)` 字形坐标落在
x[−0.700,0.713] × y[−0.386,0.398]。

**④ `op:sweep-sketch-sections`（`testSketch__r6`）— 误判，应归 C 类。** 该 sweep 就是
`multisection=True` 带 2 个截面 ⇒ 与已被判 C 的 `kernel:sweep-multisection-pipe`（5 条）
是**同一个内核缺口**（`MakePipeShell::Add` 多次调用未暴露），另加 frame-aware `placeSketch`。
本仓现有 `sweepPipeShell` + fuse 只是近似，按 §4.5.4 不许冒充逐位。

> **A 类修正结论**：两次声明式移出后 A 的范围是 **12** 条；其中 **11 条已翻 ported**，
> 余下 1 条（`test_assembly_step_import_roundtrip__assy`，原挂 `getfixturevalue`）经 ref 证据判定
> **改判 D 类**（`ref:step-roundtrip-drops-part`），故 A 的**余量仍是 0**。
> `op:faceOn` 移入 N2、`op:sweep-sketch-sections` 移入 C 类。§3.5 的 parity 上限相应下调 2 条。

**⑤ `narrow:sphere-angles`（`testCompSolid__tool`）— 已翻（N2-1），且原方案的两条判断都错。**
一次性 Python 捕获（`out/probe-sphere-sweep.py` + `out/probe-sphere-dir.py`）钉死真值：

- **标签条数**：本条写的「该标签实际只有 **1** 条」**只在当时是对的** —— plan 时 manifest 里
  `narrow:sphere-angles` 标的是 **3** 条 `TestCadQuery::testSphereCustom__s / __s0 / __s1`
  （见 §3.2 修订；`23fea76` 才把 `cast` 重标到该标签，于是 N2-1 时点看到 1 条，属**同名不同物**）。
  ⇒ 本节由此推出的「B 减 2」**不成立**，B 的初始值是 **25** 不是 22。几何结论（下面各条）不受影响。
- **「`makeSphere(r)` 是单参」只对了一半**：raw 绑定确实是单参，但**上游 `Solid.makeSphere`
  是 6 参带默认值** —— `makeSphere(radius, pnt=(0,0,0), dir=(0,0,1), angleDegrees1=0, angleDegrees2=90,
  angleDegrees3=360)`，即**默认值给的是「上半球」而不是全球**；`Workplane.sphere` 的默认值却是
  `-90/90/360`（全球）。两者只因为 `Workplane` 始终显式传自己的三元组才一致。
  ⇒ 镜像必须把三个角全部显式传（`{ angle1: 0, angle2: 90, angle3: 120 }`），
  否则会撞上 `Solid.makeSphere` 那套半球默认值。
- **正解不是布尔组合，是回转**：`BRepPrimAPI_MakeSphere` 内部就是「回转子午面」。
  自造 = 子午面 + `revolve(face, dir, a3)`，逐位精确（曲面是同一个球面）。
  半空间布尔（`common` + `halfSpace`）体积也对，但返回 **compound** 且 bbox 带 ±1e-16 噪声、
  边切分不同，故不用。
- **V 域是「两平行圆盘之间的球带」，不是「收拢到球心的圆锥」**（最贵的一条）：
  子午面 = 弧 + 上半径 + 轴向段 + 下半径（曲线梯形），两条半径回转成**平盖**。
  用「连到球心」的三角形，**只在边界落在极点或赤道时才碰巧对**——(0,30,270) 会给出
  π/4 = 0.78539816339745，而上游是 `1.07992247467149`（差 1.375×）。已写成回归钉子
  （`src/sphere-angles.test.ts`），并做了变异对照：把 `cap1/cap2` 改回球心 ⇒ 28 条里 8 条翻红。
- **帧 X 轴随 `dir` 变**（同椭圆主轴那条教训）：U 域从 `gp_Ax2(pnt, dir)` 的 X 起算，
  非全局 X。用 `makeCircleArc` 的 `FirstParameter` 点**实测**（`ax2XAxis`），
  并用 10 组 `dir`（含 (1,1,0)、(1,1,1) 斜向）对拍，体积/质心/bbox 全部 ~1e-15 一致。
- 镜像逐位 PASS：ref `f4/e7/v4` == cand `f4/e7/v4`，volΔ 5.2e-11 %、质心Δ 9.4e-14、bboxΔ 2.4e-16。
- 顺带修正 `src/workplane.ts` 里 `sphere` 的旧 JSDoc——它写着「partial sweeps are not expressible …
  upstream testSphereCustom stays blocked on that」，两半都已过时。

**⑥ `plane`（2 条）— 1 翻 1 判 D，且 §3.2 的两条判断都错、`mark-blocked.ts` 的注释也错。**
一次性 Python 捕获 `out/probe-history-loft.py`（cadquery 2.8.0）：

- **`plane(w, l)` 是有限面，不是无界面**：`BRepBuilderAPI_MakeFace(gp_Pln(O,+Z), -w/2, w/2, -l/2, l/2)`
  ⇒ `plane(1,1)` = `Face f1/e4/w1/v4`，bbox `x[-0.5,0.5] y[-0.5,0.5] z[0,0]`。§3.2 原文「上游是
  `BRepBuilderAPI_MakeFace(gp_Pln)` 的**无界面**；自造只能用有限大面近似」**前提就不成立**
  ⇒ 也**不需要**「先捕获上游无界面的 bbox 真值」——那个真值不存在。所谓「±1e60 冒充」的风险是伪风险。
- **用例正文也被记错**：`mark-blocked.ts` 原注把 `test_history_loft__res` 写成
  `loft([plane(1,1), face(circle(1)).moved(z=1)])`；真身是
  `f1 = plane(1,1) - face(circle(0.1)); f2 = (plane(2,2) - face(circle(0.1))).moved(z=1); res = loft(f1, f2)`
  （1×1 → 2×2 的**带直孔**锥台，vol `2.30191740679744` = 7/3 − π·0.01，`f7/e15/w9/v10`；
  ref 的 ±1e-7 bbox 余量出自 `ThruSections` 自身，`loft(plane(1,1),plane(2,2))` 也带）。
- **`plane` 早已实现**（`src/workplane.ts:5846`，只有无参的 ±1e60 重载故意抛错），所以「free-function
  构造函数缺失」这个 blockedBy 标签是**陈旧误判**。真正缺的是**带孔的多 wire 放样**，而它在
  `test_loft__r6`（早已 ported）里已经解决过：上游的 `solid(side, *sides, top, bot)`（缝合成型）**等价于
  外放样 − 内放样**。⇒ `test_history_loft__res` 用现有算子写出镜像，**零行 src 新代码**即逐位 PASS：
  volΔ `9.6e-14 %`、质心Δ `9.7e-17`、bboxΔ `0`、booleanΔ `0/0`、拓扑 ref `f7/e15/v10` == cand `f7/e15/v10`。
  变异对照：锥台 2×2→1.5×1.5 ⇒ FAIL（vol 32.58 %）；去掉布尔 ⇒ FAIL（vol 1.36 %，boolean `b−a` = π·0.01，
  拓扑退到 `f6/e12/v8`）。
- **`test_name_geometries__assy` 不是几何判据，且 ref 自身不可判 ⇒ 判 D 类**（`comparator:mixed-dim-boolean`）：
  - 它的判据是 **STEP 文本**（`len([l for l in lines if "top_face" in l]) == 2`），题目是
    `Assembly.save(name_geometries=True)` 的**名字传播**，几何比较器**无法表达**；
  - ref 产物连负载都没有：ref harness（`tests/ref-harness/cq_step_plugin.py::_export`）走
    `Assembly.toCompound()` + `Shape.exportStep()`，而 `Shape.exportStep` **没有 `name_geometries` 参数**。
    实测 ref STEP 里 `top_face`/`plane_`/`seg_` 各出现 **0** 次，而三个子件都在（4 个 PRODUCT、
    3 个 `NEXT_ASSEMBLY_USAGE_OCCURRENCE`、1 `ADVANCED_BREP` + 1 `MANIFOLD_SURFACE/OPEN_SHELL` +
    1 `GEOMETRICALLY_BOUNDED_WIREFRAME`）；
  - 独立地，**ref 无法自比**：`compareStepFiles(ref, ref)` 在 `step-compare.js`
    （`kernel.cut(shapeA, shapeB)`）抛 `OcctError: cut: boolean operation failed`。
    已落成可重跑探针 `tests/_probe-mixed-dim-boolean.ts`（+ 变体生成器
    `tests/ref-harness/name-geometries-probe.py`，出到 `out/_diag/`）：
    实测该场景 4 个变体（`v_full` / `v_noface` / `v_noedge` / `v_offfac`）**全部抛**，
    所以**不是**面共面/重合——是**量纲混合的 compound（低维成员嵌在/叠在 3D 成员里）触发的非流形布尔**。
    对照（自比 OK）：纯实体（×2）、纯面（×2）、纯边、成员不相交的 solid+face（×2）、solid+edge
    （`test_faceOn__f2`、`test_constructors__c1`、`test_project__res`）—— 探针末行打印
    `CONFIRMED`。同一抛错的还有已判 D 的 `ref:degenerate-compound-vertex`（`test_loft_to_vertex__c`）。

> **N2-2 结论**：`plane` 标签**清零**（1 翻 ported / 1 判 D），B 类由此 **23 → 余 20**、D 类 **5 → 6**，
> blocked **70 → 69**。**没有新增任何 `src/` 代码** —— 这一项的全部价值是**纠正三处纸面错误**
> （无界面前提、`plane` 缺失、用例正文），并复用既有分解范式。

**⑦ `project`（4 条）— 误判，应归 C 类。** 一次性 Python 捕获 `tests/ref-harness/project-probe.py`
（+ `out/ref/*project*.step` 三条已存在，`probe-ref.ts` 读真值）钉死：

- **本仓根本没有投影原语，且 occt-wasm 的两个"看着像"的名字都是陷阱**：
  - 上游两个重载走 `BRepAlgo_NormalProjection`（`shapes.py:7542`，「法向投影」，本身是
    `SetParams(tol, tol**(2/3), continuity, degree=3, maxseg=30)` 的**近似 B 样条拟合**）与
    `BRepProj_Projection`（`shapes.py:7566`，「柱面投影」精确方向投影）；`Shape.project` 还额外要
    `BRepExtrema_DistShapeShape`（`closest=True` 选最近分支）与 `Face.constructOn`
    （= `BRepBuilderAPI_MakeFace(surface, wires)`）。
  - occt-wasm 的 **`projectEdges(shape, viewOrigin, viewDirection)` 是 HLRBRep 消隐（渲染用）**，
    **不是**曲线投影；**`projectPointOnFace(face, point)` 是正交最近点，没有方向参数**。
    两者都不能替代。`BRepExtrema_DistShapeShape` 也未绑（只有 `distanceBetween`）。
- **§3.2 原判「点→面/边子集本仓可做（`projectPointOnFace/OnEdge` 已绑）」的前提不成立**：
  四条**没有一条是点投影**，全是「曲线/线框/面 → 面」：
  | 用例 | 真实算式 | 实测真值 |
  |---|---|---|
  | `test_project__res` | `project(e, base, (0,1,0))`（**柱面投影**） | Compound **f0/e2/v2**，2 条**闭合 BSPLINE**，各长 `0.629918489093`，bbox x±0.1000001 y±0.5000001 z[0.9,1.1] |
  | `test_project__res_ex` | `Solid.extrudeLinear(t.project(f,(0,0,-1)), (0,0,0.5))`，`t=makeText("T")`、`f=sphere(6).faces("not %PLANE")` | 投影面 = 球面上 1 张 `SPHERE` 面 `e8/v8`；挤出体 **f10/e24/v16**，vol `1.34667158164`（上游断言 `len(Faces())==10` ✅） |
  | `test_project__res_o_ex` | 同上，`makeText("O")`（**带内环**） | 投影面 `e20/v20/**w2**`；挤出体 **f22/e60/v40**，vol `2.22574290145` |
  | `test_text__r9` | `text("CQ",1,spine,cf)`（投影到柱面） | Compound **f2/e5/v8/`w3`**，`geomType` = `CYLINDER` |
- **顺带两条捕获更正**：`func.cylinder(1,2)` 的 1 是**直径**（半径 0.5，同 §3.1.1 ③ 的 `sphere(4)`）——
  这是投影 bbox 为 y±0.5000001 而非 ±1 的唯一原因；`base` 是**圆柱侧面**（`f1/e3/v2`：2 条圆 + 1 条接缝边）。
- **为什么不自造**：① 连上游的法向投影**本身就是 30 段三次 B 样条拟合**，逐位复现需要一个同算法实现，
  不是「算得更准」就能对齐；② `res_o_ex`（内环）与 `test_text__r9`（3 条 wire）还额外需要
  **多 wire 的 face-on-surface**——与 §3.1.1 ③ 是**同一个内核缺口**（`cad.faceOnSurface` 只吃单 wire）；
  ③ 对 1D 复合体，比较器的量纲门禁（体积恒为 0、质心恒为 0）**过松**，用「离散+拟合」凑过去
  属于 §4.5.4 明禁的**「能跑但不等价」冒充**（§7 R3）。
- ⇒ **判 C 类**：缺 `BRepAlgo_NormalProjection` + `BRepProj_Projection` + `BRepExtrema_DistShapeShape`
  + 多 wire 的 face-on-surface。**B 余 20 → 16，C 43 → 47**，blocked 不变（仍 69）。

### 3.2 B 类 · 可自造（**24 条，自有能力层的目标**）

| 标签 | 条 | 自造路径 | 可行性/风险 |
|---|---|---|---|
| **`op:assembly-solve`** | **14** | ~~自研 pure-TS 全局 NLP 求解器（替换 core solver）~~ ⇒ **前提已修正**（见 §N3）：faijs 已自带 `global-solver.js`（纯 TS LM，复刻 CQ `occ_impl/solver.py`），故改为**扩展现有求解器 + 补 cq-compat 兼容层**（补 `PointInPlane`/`PointOnLine`/`FixedPoint`/`FixedAxis`/`FixedRotation` 构造 + 嵌套子装配树）。详见重写后的 §N3 | **高可行性、中工作量**；最大风险在嵌套子装配（P4 集群），其余中低 |
| `narrow:sphere-angles` | ~~3~~ **1** | ~~`makeSphere(r)` 是单参；用**布尔组合**造角度域球面（U 向=两半空间交，V 向=平面切 + 圆盘盖）~~ → 实况：**该标签实际只有 1 条**；`makeSphere(r)` 确实单参，但正解**不是布尔组合**而是**回转**（`makeSphere` 内部就是回转子午面）。见 §3.1.1 ⑤ | ✅ **已翻 2026-10-10**（N2-1）：逐位 PASS f4/e7/v4 |
| `op:project` 2 + `project` 2 | ~~4~~ **0** | ~~**点→面/边**子集本仓可做（`projectPointOnFace/OnEdge` 已绑）；**边→面**用「离散取点 → 逐点投影 → `interpolatePoints` 拟合」近似~~ → 实况：**没有一条是点投影**，四条全是「曲线/线框/面 → 面」，走 `BRepAlgo_NormalProjection` / `BRepProj_Projection`，本仓**一个都没有**（occt-wasm 的 `projectEdges` 是 HLR 消隐、`projectPointOnFace` 是正交无方向 —— 名字陷阱）。见 §3.1.1 ⑦ | ❌ **判 C 类 2026-10-10**（N2-3）：逐位需同算法复现上游那套 30 段拟合；2 条还叠加「多 wire face-on-surface」缺口 |
| `plane` | ~~2~~ **0** | ~~上游是 `BRepBuilderAPI_MakeFace(gp_Pln)` 的**无界面**；自造只能用有限大面近似~~ → 实况：`plane(w,l)` 是**有限** `w×l` 面且**早已实现**；真正缺的是**带孔多 wire 放样**，用 `test_loft__r6` 的「外放样 − 内放样」范式**零行 src 新代码**即逐位 PASS。见 §3.1.1 ⑥ | ✅ **1 条已翻 2026-10-10**（N2-2，`test_history_loft__res`，逐位 PASS `f7/e15/v10`）；另 1 条（`test_name_geometries__assy`）不是几何判据且 ref 不可自比 ⇒ **判 D 类** |
| `export:free-face-in-compound` | 1 | **自造 STEP 写出**：`save.ts` 已经在用 raw occt-wasm XCAF 写装配，扩展到散面 compound 是同构小改；绕开 faijs 导出层 | 高；顺带验证 §1.3 那条宿主过滤能不能被旁路 |

> **B 类期望值**：乐观 ~~24~~ ~~22~~ **16** 条全翻，保守 **14–16 条**。**任何一条都必须先捕获得真值再动手**（§6 判据 3）。
> 两个「保守」来源都已被捕获消掉或改判：`plane` 2 条（1 翻 ported / 1 判 D）、`project` 4 条（**全部判 C**）。
> 现在 B 的剩余全是没有已知近似风险的项，故保守下界贴近乐观值。
>
> **2026-10-10 修订（原文两处算错，以逐标签重算为准）**：
> - 本表原列 **24** 条，`narrow:sphere-angles` **确实是 3 条**（plan 时 manifest 实测就是
>   `TestCadQuery::testSphereCustom__s / __s0 / __s1` 三个变量，**不是** §3.1.1 ⑤ 说的 1 条——
>   ⑤ 看到的 「1 条」是 `23fea76` 把 `cast` 重标到该标签**之后**的快照，属**同名不同物**）；
>   三条 `testSphereCustom` 在 `23fea76` 一次翻完。故 sphere-angles **不减** B 的分母。
> - `op:faceOn` 由 A 类移入（+1）⇒ B 的真实初始值是 **25**（`24 + 1`），不是 22 也不是 23。
>   原文写的 `14 + 1 + 4 + 2 + 1 + 1 = 22` 本身就**算错**（实为 23）。
> - **2026-10-10（N2-3 之后）**：B 已翻 **4**（`narrow:sphere-angles` 3 + `plane` 1），
>   移出 **5**（`plane`/`test_name_geometries__assy` → D；`op:project` 2 + `project` 2 → **C**），**余 16** =
>   `op:assembly-solve` 14 + `export:free-face-in-compound` 1 + `op:faceOn` 1。

### 3.3 C 类 · 真内核缺口（**42 条 → 修正为 43 条 → N2-3 后 47 条，本机无通路**）

| 标签 | 条 | 缺的原语（OCCT 侧） | 能否自造 |
|---|---|---|---|
| `op:project` 2 + `project` 2 | 4 | `BRepAlgo_NormalProjection`（+ `SetParams` 的 30 段拟合语义）+ `BRepProj_Projection` + `BRepExtrema_DistShapeShape` + **多 wire 的 face-on-surface**（`Face.constructOn`）—— **2026-10-10 由 B 类移入**（§3.1.1 ⑦） | ❌ 上游法向投影本身就是近似拟合，逐位需同算法；1D 复合体的量纲门禁过松，用「离散+拟合」凑过属 §4.5.4 明禁的冒充 |
| `op:extrude-until-face` 4 + `op:cutBlind.until-face` 3 | 7 | `BRepIntCurveSurface_Inter`（射线-面求交） | ❌ 需要真求交器。布尔细棒法属近似，**违反「不以精度换可运行性」**，只可作 feature-flagged 降级，不作主路径 |
| `kernel:sweep-multisection-pipe` | 5 | `MakePipeShell::Add` 多次调用（`sweepFull` 仍单 profile） | ❌ |
| `op:sweep-sketch-sections` | 1 | 同上（`testSketch__r6` 就是 `sweep(p, multisection=True)` 两截面；另有 frame-aware `placeSketch`）—— **2026-10-10 由 A 类移入**（§3.1.1 ④） | ❌ |
| `interpPlate` | 5 | `BRepOffsetAPI_MakeFilling` 全参构造 + 点约束 + G1 | ❌（`bsplineSurface` 是控制点近似，语义不同） |
| `op:prism-from-face` | 4 | `BRepFeat_MakePrism`（TKFeat 被 `EXCLUDED_LIBS` 排链） | ❌ |
| `op:assembly-subshape-import` | 4 | XCAF subshape name/color 读回 + `XCAFDoc_LayerTool` | ❌（除非自己写 STEP 解析器，过重） |
| `kernel:boolean-near-coincident-bspline` | 4 | 退化根因在比较器侧（跨仓）+ 输入几何 | ❌（X-2，判卷人不能自己改） |
| `kernel:sweep-aux-spine-mode` | 3 | 内核 CE=true 构造与 OCP 不等价（实测 −12.163%） | ❌ |
| `op:history-subshape` 3 + `history:images` 2 | 5 | `FirstShape/LastShape/Generated/Images` 绑定 | ❌（需 OCCT 内部历史图） |
| `remove` | 1 | `BRepTools_ReShape`（`defeature` 语义不同） | ❌ |
| `op:offset2D-multi-region` | 1 | MakeOffset2D 多区域/自交裁剪 | ❌ |
| `op:splitByFace` | 1 | 按**任意面**切割实体（本仓只有平面切割） | ❌ |
| `kernel:loft-coplanar-sections` | 1 | `ThruSections` 参数面未暴露 | ❌ |
| `kernel:crash-polygon-cutThruAll` | 1 | 疑 WASM trap，未复现定位 | 待诊断 |

### 3.4 D 类 · 不可控（**4 条 → 修正为 6 条**）

原文把 D 写成 4 条、且只列 3 条标签，**两次漏/错**；按 plan 时 manifest 逐标签重算的实况是 **6** 条：

| 标签 | 条 | 来源 | 为什么本仓做不到 |
|---|---|---|---|
| `comparator:open-shell-volume` | 2 | 原文已列 | 判卷人在 `@faicad/cq-compat-compare`（**跨仓**），本仓禁止自行翻 ported |
| `comparator:vertex-degenerate-compound` | 1 | 原文已列 | 同上 |
| `comparator:mixed-dim-boolean` | 1 | **N2-2 新增**（`tests.test_assembly:::test_name_geometries__assy`，原挂 `plane`） | ① 题目是 STEP **文本**里的 `name_geometries` 名字传播，几何比较器无法表达；② ref 产物**根本没有名字负载**（harness 走 `Assembly.toCompound() + Shape.exportStep()`，而 `Shape.exportStep` 无 `name_geometries` 参数，实测 `top_face/plane_/seg_` 各出现 0 次）；③ 独立地 ref 自身不可自比：`compareStepFiles(ref, ref)` 在 `kernel.cut` 抛 `OcctError: boolean operation failed`（量纲混合 compound 的非流形布尔，已用 4 变体二分 + 4 个对照坐实）。见 §3.1.1 ⑥ |
| `ref:degenerate-compound-vertex` | 1 | 原文已列 | ref 侧产物/证据问题 |
| `ref:step-roundtrip-drops-part` | 1 | **原文漏列**（`tests.test_assembly:::test_assembly_step_import_roundtrip__assy`，plan 时挂 `getfixturevalue` 因而被算进 A 类） | ref 的 STEP 往返丢了部件，判据不成立 |

> **实计数 = 6 条用例 / 5 个标签**：`2 + 1 + 1 + 1 + 1 = 6`。
> 上表 `comparator:mixed-dim-boolean` 一行的 ①②③ 是**同一用例的三条独立缺陷**，只算 1 条。
>
> **修订轨迹**：`4`（原文）→ `5`（`f643aac` 补 `ref:step-roundtrip-drops-part`）→ **`6`**（N2-2 把
> `plane`/`name_geometries` 从 B 判入 D）。每一步都用 `0 + B余 + 43 + D = blocked 实测` 反验。

### 3.5 汇总与 parity 上限

```
84 blocked（计划时）
├─ A 本仓值面可做   14  ███ 16.7%   → N1，几乎确定能翻
├─ B 可自造         24  █████ 28.6% → N2/N3/N4，期望 15–18
├─ C 真内核缺口     42  ██████████ 50.0% → N5（工具链）之后才谈
└─ D 不可控          4  █ 4.8%
```

> **2026-10-10 回写（N2-3 后重算，以 plan 时 manifest 逐标签为准）**：A 的范围 12 里 **11 条已翻**、
> 1 条（`test_assembly_step_import_roundtrip__assy`）改判 D 类 ⇒ A 余 **0**。
> 当前 manifest：**69 blocked** = **A 余 0 + B 余 16 + C 47 + D 6** ✅（`0+16+47+6 = 69`）。
> 分类轨迹：B 25 →（N2-2：−1 判 D）24 →（N2-3：−4 判 C）**16**；C 43 → **47**；D 4 → **6**。

> **分母修订（2026-10-10，逐标签重算，取代原文的「B 22 / D 5」）**：原文两处各错一条且方向相反，
> 恰好让 `0 + 22 + 43 + 5 = 70` 靠**抵消**显示为「验算通过」。逐标签重算如下：
>
> | 类 | plan 时 | 声明式移出 | 判入 D | 判入 C | 已翻 | 余（N2-3 后） |
> |---|---|---|---|---|---|---|
> | A | 14 | −2（`op:faceOn`→B、`op:sweep-sketch-sections`→C） | −1（`…roundtrip__assy`） | 0 | −11 | **0** |
> | B | 24 | +1（`op:faceOn`）＝**25** | −1（`…name_geometries__assy`） | −4（`op:project` 2 + `project` 2） | −4（`narrow:sphere-angles` 3 + `plane` 1） | **16** |
> | C | 42 | +1（`op:sweep-sketch-sections`）＝43 | 0 | +4 | 0 | **47** |
> | D | 4 | 0 | +2 | 0 | 0 | **6** |
> | 合计 | 84 | — | — | — | −15 | **69** ✅ |
>
> - **B 的初始值是 25，不是 22/23**：`narrow:sphere-angles` 在 plan 时确实是 **3** 条
>   （`TestCadQuery::testSphereCustom__s/__s0/__s1`），三条在 `23fea76` 一次翻完，故**不减**；
>   `op:faceOn` 由 A 移入 +1 ⇒ `24 + 1 = 25`。原文 `14 + 1 + 4 + 2 + 1 + 1 = 22` 本身就是算错的加法（＝23）。
> - **D 是 6，不是 5**：`ref:step-roundtrip-drops-part`（plan 时挂 `getfixturevalue`，被算进 A）
>   **加上** N2-2 判入的 `comparator:mixed-dim-boolean`（原挂 `plane`，属 B）。
> - **翻转总数 = 15** = A 11 + B 4（84 → 69）。**N2-2/N2-3 两条都只改判、不新增翻转**。

| 场景 | parity |
|---|---|
| 计划时基线（2026-10-07 全量） | **80.00%**（520/650） |
| **实测累计（2026-10-10，已翻 15 条：A 11 + B 4）** | **82.31%**（535/650） |
| + B 余 16 全翻 | **84.77%**（551/650） |
| + C 类 47 条（需完整内核扩展） | **92.00%**（598/650） —— 不现实，仅作天花板参照 |
| + D 类 6 条 | 92.92%（604/650） —— 本仓做不到（跨仓/证据不足，见 §3.4） |

> **2026-10-10 重算**：原表各行（532 / 547 / 554 / 597 / 602）由过期分母（B 22 / D 5）推出，已作废。
> 现按 `parity = (520 + 已翻) / 650` 且 **B 25 / C 43 / D 6** 重算如上。
> 分母纪律：**BLOCKED 计入分母**；`compare.ts` 的 `compared = pass + passNt + fail` 不含 ERROR，
> 故 `pass+passNt+fail+blocked = 650` 才对（refCases 实测 650，且 `parity = (pass+passNt)/refCaseCount`）。
> 校验链：`520 + 15 + 20 + 43 + 6 = 604`（= 650 − 46）。
> ⚠ **这是投影不是实测**：按本文口径 `parity = (520 + 已翻)/650`，前提是「每条已翻的 blocked 都会变成
> PASS 或 PASS-NT」。真值只能由 **N0-3 全量重扫**给出（§7 R1）。另记一条**既有**口径毛刺：
> `out/report-final.json` 的 `counts` 是 `500+20+18+1+112 = 651`，而 `refCases` = 650、`out/ref/*.step` = **651** 个
> —— 基线自身有 1 条对不上，**与本次改动无关**，此处仅登记。

---

## 4. 关于「自己的扩展库」（正面回答）

### 4.1 faijs-gears 模板解剖（实测 `D:\Faicad\faijs\packages\faijs-gears`）

| 维度 | faijs-gears 的做法 | 对本仓的启示 |
|---|---|---|
| 包形态 | `@faicad/faijs-gears`，`peer { @faicad/faijs ^0.30.0, occt-wasm ^5.6.0 }`，零 runtime deps | 扩展库**不把 faijs 当依赖打包，只当宿主** |
| 内核访问 | 自建 `src/kernel/gears.ts`，注释写明「**faijs-gears only imports from here; it must not touch occt-wasm directly**」，对外只暴露 `getGearKernel()` | **直调面必须有唯一收口**，不能散落 |
| faijs 面 | 只吃根入口：`BrepHandle` / `Result` / `ok` / `err` / `CONTRACT_VERSION` / `initOcctWasm` | 根入口够用 ⇒ 深子路径是可收敛的**技术债**，不是必需 |
| 类型护栏 | 自声明 `GearKernel = Omit<BrepEngineApi,…> & {…}`，并用探针测试断言每个方法在活内核上存在 | 内核升级改签名会**先红**，而不是运行时 `undefined is not a function` |

⇒ **结论：这条路径是通的，且有现成的纪律可抄。** 本仓已经有一半在做（`save.ts` 直调 raw XCAF 写 STEP、`parametricCurve` 用 `approximatePoints` 自建曲线），缺的是**收口**。

### 4.2 本仓当前对 faijs 的依赖面（实测 import 清单）

| faijs 子路径 | 用途 | 根入口是否可替代 | 脆弱性 |
|---|---|---|---|
| `@faicad/faijs`（根） | `createRuntime` / `registerOcctBrepEngine` / `getKernel` / `initOcctWasm` / `BrepHandle` / `Result` | — | 低（公开面） |
| `@faicad/faijs/occt-kernel/occtKernel` | `getKernel` / `OcctKernel` 类型 | ✅ 根已导出 `getKernel`/`initOcctWasm` | **可消除** |
| `@faicad/faijs/shape` | `brepOf/getSlot/ensureSlot/hasBrep/compound` | ❌ 根未导出 | 中（Shape 载体，绕不开） |
| `@faicad/faijs/brep/handle-bridge` | `getBrepApi` | ❌ | 中 |
| `@faicad/faijs/brep/brep-ops`、`/brep/engine/{primitives,types}`、`/brep/text/*` | 变换、文本成实体、类型 | 部分（`translateBrep/rotateBrep/…` 在根） | 中 |
| `@faicad/faijs/api/{api-namespace,brep-mirror/topologyFns,cadquery-selectors,chamfer-math,assembly/types}` | 命名空间注册、内省镜像、选择器、倒角数学 | ❌ | 中高 |
| `@faicad/faijs/mesh/{types,rigid-transform}`、`/runtime-state`、`/sdk`、`/identity` | 类型、位姿、后端、`asPartName` | 部分（`/runtime-state` 的 `getBackends` 已由根 `export * from env-agnostic` 覆盖） | 中 |
| `@faicad/faijs-extra/editor-ops` | `assembly` op（**装配求解现在委托给 core**） | ❌ | **高**（`op:assembly-solve` 14 条全压在这里） |
| `@faicad/faijs-sketch` | 草图 | ❌ | 中 |
| **faijs 宿主 CLI 导出策略** | parity 的 STEP 产出 | ❌ | **高**（§1.3 的 2D 过滤就是它改的） |

> **一句话风险**：本仓有 **10+ 个深子路径** + **2 个外部宿主策略**（CLI 导出、core 求解器）。faijs 每次 minor 升级都可能单方面改写本仓的 PASS 集合，而本仓**无权改 core**（既有约束）。

### 4.3 三层划分（建议据此重构）

| 层 | 内容 | 归属 | 能否自造 |
|---|---|---|---|
| **L1 · 宿主层** | 脚本运行时、Shape 载体、字体/IO、CLI | faijs | **不自造**（造了就不是 faijs 生态包了），但要把耦合收进 `src/adapters/faijs.ts` 一处，升级时只改一个文件 |
| **L2 · 自有能力层** | 内核原语组合（sphere-angles / 投影 / 无界面 / STEP 写出）、**装配求解器**、导出通道 | **本仓自造** | ✅ 这是扩展库的主体 |
| **L3 · 内核层** | OCCT 内部状态（History / XCAF / MakeFilling / MakePipeShell / BRepFeat） | occt-wasm | ❌ 只能 fork |

### 4.4 包形态：**先内后外**（三选一的判据）

| 方案 | 形态 | 优点 | 代价 | 判据 |
|---|---|---|---|---|
| **A（推荐，先做）** | 本仓内子路径：`src/kernel/` + `src/solver/`，经 `@faicad/faijs-cadquery/ext` 导出 | 零发布成本、复用现有 563 镜像与 parity 尺子、改动可逐条回归 | 不能单独发版 | 现在就做 |
| **B** | 新包 `@faicad/faijs-cadquery-ext`（仿 faijs-gears，peer `occt-wasm` + 只吃 faijs 根入口） | 独立版本、可被第三方单独消费 | 需建仓/发布/`file:` 联调，parity 链路要重新接线 | 当 ext 层出现**外部消费方**时 |
| **C** | 共享内核扩展 `@faicad/cq-kernel-ext`，供 faijs-cadquery + faijs-freecad 共用 | 一次投入两份收益（freecad 也是 peer `occt-wasm ^5.6.0` 直调） | 跨仓协作 + 版本 lockstep 成本 | 当 freecad 侧确认要复用同一批原语时 |

> **推荐 A → B/C**：本轮先在仓内把层建起来（N2），等 B/C 的触发条件出现再拆。**不要为了「有个扩展包」而拆包**——拆包本身不解锁任何 blocked 条目。

### 4.5 扩展层纪律（抄 faijs-gears，四条硬约束）

1. **唯一直调口**：occt-wasm 只允许出现在 `src/kernel/**`；`workplane.ts` 现有的 `getKernel() as unknown as OcctKernel` 散点全部收敛过去。
2. **能力面自声明 + 探针测试**：`src/kernel/` 导出一个 `CqKernel` 类型（列出所消费的每一个 occt 方法），配一个探针测试断言它们全部存在于活内核 ⇒ 内核升级先红。
3. **只吃 faijs 根入口**：`brepOf/getSlot/getBrepApi` 等绕不开的深子路径，全部封装进 `src/adapters/faijs.ts`，业务代码不得直接 import 深子路径。
4. **不冒充**：自造路径若只能给近似解，必须标 `PASS-NT` 并在 manifest `reason` 写明，或在捕获推翻后回写 blocked。**不许用近似冒充逐位。**

---

## 5. 开发批次（N0 → N6）

批次纪律：每批独立 commit、独立可停；**每批开工先跑一次性 Python 捕获**；捕获推翻本文结论的，**以捕获为准并回写 §3**。

| 批 | 主题 | 预期解锁 | 依赖 |
|---|---|---|---|
| **N0** | **修尺子**（回归 A/B + 全量重扫 + WIP 收口） | 0（恢复可判定性） | 无，**硬前置** |
| **N1** | A 类本仓值面 14 条 | ~12 | N0 |
| **N2** | 自有内核原语层 `src/kernel/` + Sphere/Plane/Project/Export 自造项 | ~6–8 | N0 |
| **N3** | 自有装配求解器 `src/solver/`（14 条） | 0–14 | N0、N2 |
| **N4** | 自有导出通道（摆脱 faijs CLI 策略） | 1 + 防御 §1.3 复发 | N2 |
| **N5** | occt-wasm 工具链（长线，可并行） | 解锁 C 类 42 条的前置 | 无（但本机要装 Rust/emsdk） |
| **N6** | 数据卫生 + 跨仓协作 | 0 | 随时 |

### N0 · 修尺子（**不做完不许谈任何「零回归」**）

| 序 | 项 | 判据 |
|---|---|---|
| N0-1 | §1.3 归因 A/B：把 `@faicad/faijs` 降到 0.30.8 重建 dist，单跑 `TestCQSelectors__testShape__res4`；若绿 ⇒ 确认是 0.30.9 宿主策略变更，写进 reason 并决定「升 `includeHidden`」还是「自造导出」（→N4） | 给出确定的归因，不是「疑似」 |
| N0-2 | 收口 WIP：给 `shapeUnion/Intersect/Difference` 挂 `test_set_ops__*` 镜像 + 变异测试，或判定不成立则回退该改动 | `op:shape-operator-overload` 有明确结论 |
| N0-3 | **全量重扫**：`npm run build` → `npx tsx tests/run-cand.ts` → `npx tsx tests/compare.ts`（~6s/条 × 563 ≈ 1h，后台跑；**跑前先备份 `out/report-final.json`**，`compare.ts` 会覆写 `out/report.json`） | 产出 **2026-10-10 新基线**（PASS/FAIL 集合） |
| N0-4 | 与旧基线做**集合 diff**：`out/diff-baseline.mjs`（已有工具） | 明确「新增绿 / 新红 / 既有红」三张清单；新红必须逐条归因（faijs 升级？本仓提交？ref 漂移？） |
| N0-5 | 把新基线数字回写本文 §1.1，并把三份旧计划的排期标记为「已被本文取代」 | 文档与实测一致 |

### N1 · A 类本仓值面（14 条 → 修正为 12 条，其中 11 条翻 ported + 1 条判 D）

顺序：`getfixturevalue` 5（通道已就绪，最稳）→ `op:shape-operator-overload` 1（WIP）→ `eachpoint/cast/faceOn/pendingWires/extrude-taper-sketch/sweep-sketch-sections` 6 → `op:prism-tilt` 1 → `kernel:ellipse-tall-axis` 1（先做判别探针）。每条：一次性 Python 捕获 → 镜像 → parity 逐位 → 变异测试 → manifest 翻 ported。

> **2026-10-10 状态：N1 收口。** 12 条里 **11 条翻 ported**（4 + 1 + 4 + 1 + 1），第 12 条
> `test_assembly_step_import_roundtrip__assy`（原挂 `getfixturevalue`）**改判 D 类**
> （`ref:step-roundtrip-drops-part`，§3.4）⇒ A 余 0；`op:faceOn` 移交 N2、
> `op:sweep-sketch-sections` 移交 C 类（§3.1.1 ③④）。产出提交：`a56353d`（set ops）、
> `39db559`/`627c67f`（getfixturevalue + eachpoint/pendingWires）、`f14c2ec`（draftPrism 句柄回归修复）、
> `b188cf7`（taper PASS-NT）、`23fea76`（sphere 批）、`eab936d`（prism-tilt + ellipse-tall-axis）。

### N2 · 自有内核原语层（骨架 + 4 个自造项）

> **2026-10-10 状态：N2-0 / N2-1 / N2-2 / N2-3 已落地。**
> - **N2-0**（`a3a2e8b`）：`src/kernel/index.ts`（唯一 `occt-wasm` / faijs occt-kernel 入口，
>   `getCqKernel()` + `CqKernel`）+ `src/adapters/faijs.ts`（`@faicad/faijs` 深子路径收口，纯 re-export）；
>   `workplane.ts` 等 7 个模块的 66+7 处 `getKernel()` 迁到 `getCqKernel()`；
>   新增 `src/kernel.probe.test.ts`（71 个 raw 绑定运行时探针 + 静态边界守卫，已做变异对照）。
> - **N2-1**（见 §3.1.1 ⑤）：`narrow:sphere-angles` 翻 ported（manifest 71 → **70 blocked**），
>   `sphere` 增加 `direct/angle1/angle2/angle3`，走**回转**而非布尔；`src/sphere-angles.test.ts` 28 条。
> - **N2-2**（见 §3.1.1 ⑥）：`plane` **清零** —— 1 条翻 ported（`test_history_loft__res`，**零行 src 新代码**，
>   复用 `test_loft__r6` 的「外放样 − 内放样」范式，逐位 PASS `f7/e15/v10`，两个变异均翻红）；
>   1 条判 D（`test_name_geometries__assy` → `comparator:mixed-dim-boolean`）。
>   manifest **70 → 69 blocked**（573 ported / 69 blocked / 55 skipped）。
> - **N2-3**（见 §3.1.1 ⑦）：`project` 4 条**全部判 C 类** —— 本仓没有投影原语（`BRepAlgo_NormalProjection`
>   / `BRepProj_Projection` / `BRepExtrema_DistShapeShape` 全缺，且 occt-wasm 的 `projectEdges` 是 HLR
>   消隐、`projectPointOnFace` 是正交无方向 —— **名字陷阱**）；四条**没有一条是点投影**，且 2 条叠加
>   「多 wire 的 face-on-surface」内核缺口。blocked 不变（仍 69），B **20 → 16**、C **43 → 47**。
>   捕获脚本已入库：`tests/ref-harness/project-probe.py`。
> - **N2-4 未开工**：`export:free-face-in-compound` 1。
> - 顺带修正：`op:faceOn` 仍是 1 条 blocked（标签未改名，见 §3.1.1 ③），归本批。
>   ⇒ **N2 的 4 个自造项里，只有 `sphere-angles` 与 `plane` 各 1 条真正翻成 ported（共 2 条）；
>   `plane` 的另 1 条判 D、`project` 4 条判 C。§3.2 原估「~6–8 条」偏高。**

| 序 | 项 | 判据 |
|---|---|---|
| N2-0 | 建 `src/kernel/`（唯一 occt 直调口）+ `src/adapters/faijs.ts`（深子路径收口）+ `CqKernel` 类型 + 能力面探针测试；把 `workplane.ts` 的 `getKernel()` 散点迁移过去 | ✅ 零回归（1 failed / 691 passed，唯一红为既有 §1.3）；探针 5/5 绿 |
| N2-1 | `narrow:sphere-angles` 1 条：角度域球面 | ✅ 逐位 PASS f4/e7/v4；10 组角三元组 + 10 组 `dir` 与上游 ~1e-15 对拍；变异 8/28 翻红 |
| N2-2 | `plane` 2 条：**先捕获上游无界面的 bbox/面积真值**，再决定「有限大面」能否过关 | ✅ **结论与判据都推翻**：上游是**有限** `w×l` 面（无界面前提不成立，不需要那个真值）；1 条翻 ported（逐位 PASS `f7/e15/v10`，**零行 src 新代码**，两个变异翻红），1 条不是几何判据且 ref 不可自比 ⇒ 判 D 类。见 §3.1.1 ⑥ |
| N2-3 | `project` 4 条：先做点投影子集（2 条），边→面走离散+拟合并**显式评级** | ❌ **前提不成立、判据也不用**：四条**没有一条是点投影**（全是曲线/线框/面 → 面），本仓**零投影原语**（`projectEdges` 是 HLR 消隐、`projectPointOnFace` 是正交无方向）。⇒ **4 条全部判 C 类**；1D 复合体的量纲门禁过松，用离散+拟合凑过属 §4.5.4 明禁的冒充。见 §3.1.1 ⑦ |
| N2-4 | `export:free-face-in-compound` 1 条：复用 `save.ts` 的 raw XCAF 通路写散面 compound | 7 面全写出（现状只写 6） |

### N3 · 装配求解：扩展现有求解器 + 补兼容层（14 条）

> **前提修正（2026-10-10 复盘）**：原 N3 写「自研 pure-TS 全局 NLP 求解器、替换 core solver；上游 casadi、OCCT 无求解器 ⇒ 算法缺口」。审查代码发现 **faijs 已自带 `@faicad/faijs/api/assembly/solvers/global-solver.js`**（纯 TS LM + 数值雅可比，复刻 CQ `occ_impl/solver.py` 语义；9 类代价项含 `point_in_plane`/`point_on_line`，行 100-119）。因此 N3 **不是从零造求解器**，而是「扩展现有求解器 + 补 cq-compat 兼容层」。真实缺口分四层：
> 1. **cq-compat 缺约束词汇表（主因）**：`src/assembly/assembly.ts` 的 `constraintEx` 只暴露 7 种构造（`AssemblyKind` 行 127-134，switch 行 298-351），缺 CQ 的 `PointInPlane`/`PointOnLine`/`FixedPoint`/`FixedAxis`/`FixedRotation`。
> 2. **faijs global-solver 无 3 个 first-class 世界锚定约束类型**：只有 `point_in_plane`/`point_on_line` 作为 coincident/distance 的**内部副产品**（`pushCoincident` 行 389-414），外部可发射的 switch case（行 190-232）只有 `mate/align/coincident/concentric/distance/angle/parallel/perpendicular/fixed`，没有 `fixedPoint`/`fixedAxis`/`fixedRotation`。
> 3. **嵌套子装配**：`CqAssembly` 是扁平结构（`traverse()` 行 633-635 明示「members 为 Shape 叶子，无嵌套子装配」），`solveGlobal` 入参亦为扁平数组——无法表达 CQ 递归子装配。
> 4. **表达式语法选择器**：`test_expression_grammar__nested_assy` 需要 `constrain` 选择器支持轴/表达式 token。

#### N3-0 · 14 条缺口聚类（决定工作量与解锁顺序）

| 集群 | 条 | 上游约束/结构 | 缺口 | 解法 | 难度 |
|---|---|---|---|---|---|
| P1 `PointInPlane` | 2（`test_PointInPlane_constraint__*`、`test_PointInPlane_3_parts__*`） | `assy.constrain(pnt, plane, 'PointInPlane', param=0)` | cq-compat 无 5 参 DSL；求解器其实能算（point+plane→`point_in_plane`） | 补构造器，转 `coincident`(point, plane) | 低 |
| P2 `PointOnLine` | 3（`test_point_on_line__*`） | `assy.constrain(pnt, line, 'PointOnLine')` | 同上，point→axis | 补构造器，转 `coincident`(point, axis) | 低 |
| P3 `FixedPoint`/`FixedAxis`/`FixedRotation` | 3（`test_unary_constraints__*`） | `assy.constrain("b2","FixedPoint",(0,0,-3))` / `"FixedAxis",(0,1,1)` | cq-compat 无构造器 + 求解器无世界锚定约束类型 | 补构造器 + 给 global-solver 加 3 类型 + 解析器 | 中 |
| P4 嵌套子装配 | 5（`*nested_assy*` / `*subassy*`） | 成员可为子 `Assembly`，`solve()` 递归 | 扁平结构，无树/递归 | cq-compat 建装配树 + 递归求解 | 高 |
| P5 表达式语法 | 1（`test_expression_grammar__nested_assy`） | 选择器含轴/表达式 token | 选择器未覆盖 | 扩展 selectors（与 P4 同批） | 中 |

> **优先解锁项**：`test_constrain__simple_assy`（只用到 `Plane`+`Fixed`，cq-compat 已支持）一旦写镜像很可能已能 PASS，**不必等 N3 全做完**——属 P4 之外的「已有能力项」，可最先翻。14 条目前**全部无 `.fai.js` 镜像**（整类预防性 block），逐条解锁前需先写镜像。

#### N3-1 · 捕获真值（判据前置，§6-3）
复用 §5 的 Python 参考捕获范式，一次性跑 `test_constrain*` / `test_unary_constraints*` / `test_point_on_line*` 共 14 条，冻结每个成员的**终态位姿矩阵**（`loc.wrapped.Transformation()`），不是只有体积——判别量是位姿，不是体积。
- 落点：`out/ref-assembly/<case>.json`（成员名 → 4×4 矩阵 + bbox + volume），含嵌套用例的逐层位姿（P4）。
- 消费方：`compare.ts` 新增 `assemblyPose` 判等通道（位姿逐位 + 三度量）。

#### N3-2 · 补 cq-compat 约束 DSL（P1+P2，解锁 5 条）
- `src/assembly/assembly.ts` 给 `constraintEx` 增 5 参形态 `constraintEx(aPart, aSub, aShape, bPart, bSub, bShape, kind, param?)`，把子形状解析为 EntityRef（vertex→point、face→plane、edge→axis），按 kind 发射 `AssemblyConstraint`：
  - `PointInPlane` → `coincident`(point, plane)，求解器 `pushCoincident` 自动降级为 `point_in_plane`（行 393-398）。
  - `PointOnLine` → `coincident`(point, axis)，降级为 `point_on_line`（行 403-407）。
- 上游 `param` 是沿法向偏移；`pushCoincident` 当前仅 `val=0`，先支持 0，非零留 TODO 并显式评级（避免 §4.5.4 冒充）。
- 同步给 `CqAssembly` 暴露 `constrain(...)` 方法（对齐 CQ `Assembly.constrain`），内部转 `constraintEx` 并入 `constraints`。
- 门禁：构造器单测 + 与真值逐位。

#### N3-3 · 给 faijs global-solver 补 3 个世界锚定约束类型（P3，解锁 3 条）
- `global-solver.js` 的 `termResidual`（行 80-119）+ 约束 switch（行 190-232）增：`fixedPoint`（成员字面点 → 世界系固定点）、`fixedAxis`（成员轴 → 世界系固定方向）、`fixedRotation`（成员固定旋转）；解析器取字面向量（参考 `resolveMarker` 的 point/axis 分支 + 新增字面源）。
- ⚠️ 此项需改 faijs 内核（非本仓）⇒ 优先在**本仓 `src/solver/` 做覆盖式薄封装**（注入自定义约束类型，绕过 core），避免改上游发布链；若覆盖式不可行再走 `@faicad/faijs` PR。
- 门禁：3 类各一个单测 + 与真值逐位。

#### N3-4 · 嵌套子装配树 + 递归求解（P4，解锁 5 条）
- `CqAssembly` 成员允许是子 `CqAssembly`（改 `AssemblyAddArg` 联合类型）；`solve()` 先解子装配得 per-member 局部位姿，再作为整体参与父装配（CQ `Assembly.solve()` 语义：`subAssembly.loc` 叠加）。
- 求解器侧：`solveGlobal` 入参扁平，优先在 **cq-compat 侧递归**（压平为「带父变换的扁平成员列表」后多次调用），不动 faijs 内核。
- `traverse()` 改为真正自底向上遍历（行 633-635 现状是占位）。
- 门禁：5 个嵌套用例逐位 + 既有扁平装配零回归。

#### N3-5 · 表达式语法选择器（P5，1 条）
- `test_expression_grammar__nested_assy` 选择器含轴/表达式 token（如 `'X'`、`'-Y'`、`'#expr'`）。确认 `resolveFaceSelector`/`resolveSolverEntity` 覆盖度；缺则扩展。与 P4 同批（该用例本身嵌套）。

#### N3-6 · 镜像 + 回归（每条解锁的必须）
- 写 14 个 `.fai.js` 镜像（对齐上游 `assy.constrain(...)` DSL，映射到 N3-2/3/4 新 API）。
- `run-cand`/`compare` 增装配位姿判等通道（消费 N3-1 真值）。
- 翻 `tests/manifest.json`（blocked→ported）+ `tests/mark-blocked.ts` 删 BY_KEY。
- 变异测试（承重）：扰动任一约束 ⇒ 终态位姿必须偏离（§6 R 系纪律）。

#### N3-7 · 验收门禁（§6）
- `npm run typecheck` / `lint` / `test` 全绿；`op:assembly-solve` 14 条逐位 PASS；既有装配单测（`assembly-*` 系列）零回归；不冒充（逐位判据 R3）。
- 每解锁一个集群（P1-P5）独立 commit（R6：N3 可独立停/交，不阻塞 N1/N2 主线）。

> **工作量重估**：原 N3 估「数周、从零造求解器」。修正后：求解器已存在，主体是**兼容层 + 3 个约束类型 + 嵌套树**。P1/P2（5 条）+ `simple_assy`（1 条）几乎零求解器改动即可解锁；最大风险在 P4（嵌套，高），P3/P5 中。整体明显小于原计划。

### N4 · 自有导出通道（防御性）

把 parity 的 STEP 产出从 faijs CLI 迁到本仓自持的导出器（kernel 层 `exportStep`/XCAF 直出），**不再受宿主「2D 终端过滤」策略影响**。判据：§1.3 那条边 compound 用例能正常导出；既有 PASS 集合零回归。风险：换了写出器可能与 ref 的 STEP 结构有差异 ⇒ 必须与 comparator 对拍确认不影响三度量。

### N5 · occt-wasm 工具链（长线，解锁 C 类 42 条的前置）

沿用 `2026-10-06-occt-wasm-extension-plan.md` 的 Phase 0（P0-1…P0-6）：`winget install Rustlang.Rustup` → emsdk → `git submodule update --init` → 全量构建 ~1h → **严格对拍**（方法名集合 diff 为空 + 本仓 parity 零回归）。**在 P0-6 通过前，W0–W5 一条都不许动。**

### N6 · 数据卫生 + 跨仓

- 删/归档 `tests/` 顶层 10 个死镜像（先确认与子目录版本无关）。
- 依赖口径：`faijs-extra`/`faijs-sketch` 的 peer 与实装版本对齐，消除 `--legacy-peer-deps` 需求。
- 跨仓接口清单（X-1 metadata-extractor 丢子路径、X-2 comparator 开壳度量、X-3 LayerTool、X-4 未绑原语）保持独立登记，不混入本仓批次。

---

## 6. 验收判据（硬门禁）

1. **零回归**：与 **N0-3 的新基线**取 PASS/FAIL **集合 diff**（不是 parity 数字）。既有 PASS 不许翻红；PASS-NT 算通过但必须在镜像注释 + manifest `reason` 写明差异。
2. **翻 ported 三条件**：① 镜像存在且可跑 ② parity 逐位 ③ 变异测试（改坏关键分支 ⇒ 断言变红）。**没做过变异测试的断言不算验证。**
3. **一次性 Python 捕获优先**（`C:\Users\ylt\cadquery-env\Scripts\python.exe`）。捕获推翻纸面结论 ⇒ **回写本文 §3**（这是 P1-1 / P2-3 / P3-1 / P5-1 / P6-a 五次推翻换来的纪律）。
4. **数据同步**：改判任意一条 ⇒ **同时**更新 `tests/manifest.json`（走 `tests/mark-blocked.ts`）+ `tests/coverage.json`（重算）+ 本文 §1/§3。只改一处会让下一轮重算把结论翻回去。
5. **门禁**：`npm run typecheck`（**必须绿**）/ `npm run lint`（绿）/ `npm test`（只允许已归因的红灯）；新导出必须有 JSDoc。
6. **扩展层纪律**：`src/kernel/` 外不允许出现 `from 'occt-wasm'`；`src/adapters/faijs.ts` 外不允许出现 faijs 深子路径 import。两条用测试冻结。
7. **长任务串行**：一次只跑一个后台任务（`run-cand` 全量 ~1h）；启动下一批前确认上一批 node/kernel 子进程已死。
8. **提交**：显式 `git add <path>`（禁 `-A`）、conventional commits（英文）、过门禁（禁 `--no-verify`）、**禁 `Co-Authored-By`**、**禁 git stash**。

---

## 7. 风险与守卫

| # | 风险 | 守卫 |
|---|---|---|
| **R1** | 用过期尺子宣布「零回归」（§1.1 的 80.00% 是 10-07 的） | N0 列为硬前置；N0-3 未完成前，任何批次不许声称零回归 |
| **R2** | faijs minor 升级单方面改写 PASS 集合（§1.3 已发生一次） | N4 自持导出通道；`src/adapters/faijs.ts` 单点收口；每次升级 peer 必须重跑 N0-3 |
| **R3** | 自造路径「能跑但不等价」被当成解锁（plane / project 边→面 / interpPlate 近似） | 判据要求**逐位**；不达标一律回写 blocked 并写 reason，禁止冒充 |
| **R4** | 为「有个扩展包」而拆包，成本花在发布链路上而非解锁 | §4.4 明确触发条件；本轮只做方案 A |
| **R5** | `kernel:*` 标签沉底无人复核（9 条 testEnclosure 的教训） | 新规：任何 `kernel:` 标签必须附 `reason` 指向探针脚本或 commit，否则不许写入 manifest |
| **R6** | N3 求解器旷日持久拖住整条线 | N3 与 N1/N2 并行、独立 commit，可独立停/独立交付 |
| **R7** | `compare.ts --only` 覆写 `out/report.json`（已踩过一次） | 跑 `--only` 前先备份；全量基线另存 `out/report-baseline-<date>.json` |

---

## 8. 附录 · 本文取证命令（可重跑）

```bash
# 口径
node -e "const m=require('./tests/manifest.json');const v=Object.values(m);
const s={};for(const e of v)s[e.status]=(s[e.status]||0)+1;console.log(v.length,s);
const b={};for(const e of v)if(e.status==='blocked')b[e.blockedBy]=(b[e.blockedBy]||0)+1;
console.log(Object.entries(b).sort((a,c)=>c[1]-a[1]))"

# 门禁
npx eslint src ; npx tsc --noEmit ; npm test

# parity（全量，~1h；跑前备份 out/report-final.json）
npm run build && npx tsx tests/run-cand.ts && npx tsx tests/compare.ts

# 内核扩展通路现状
which rustc cargo emcc cmake ninja ; cd /d/Faicad/occt-wasm && git describe --tags

# faijs 宿主策略归因（§1.3）
grep -n "nothing to export as a 3D part" -B 25 node_modules/@faicad/faijs/dist/node-host/cli.js

# D 类 · comparator:mixed-dim-boolean 复现（§3.1.1 ⑥ / §3.4）
C:/Users/ylt/cadquery-env/Scripts/python.exe tests/ref-harness/name-geometries-probe.py
npx tsx tests/_probe-mixed-dim-boolean.ts   # 末行应打印 CONFIRMED

# C 类 · project 4 条的真值捕获（§3.1.1 ⑦）
C:/Users/ylt/cadquery-env/Scripts/python.exe tests/ref-harness/project-probe.py

# 分类分母反验（§3.5）：0 + B余 + 43 + D 必须等于实测 blocked
node -e "const m=require('./tests/manifest.json');const v=Object.values(m);const s={};for(const e of v)s[e.status]=(s[e.status]||0)+1;console.log(s)"
```

**实测快照（2026-10-10）**：manifest 558/84/55 · 34 标签 · 镜像 563+18 · 单测 680/72 文件（1 红：`TestCQSelectors__testShape__res4`）· lint 绿 · tsc 绿 · parity 基线 80.00%（10-07，未重扫）· Rust/emsdk/cmake 全缺 · occt-wasm clone 仍 v5.3.5。

**实测快照（2026-10-10 · N1 收口后）**：manifest **571/71/55 · 27 标签 · 镜像 585 个 `.fai.js` + 19 个 `.blocked`** · 单测 **686 用例 / 73 文件**（vitest 收集数；仍 1 红：同上）· lint 绿 · tsc 绿 · parity 基线仍 80.00%（10-07，未重扫）。A 类 12 条全翻；余：B 24（含装配求解器 14）· C 43 · D 4。

**实测快照（2026-10-10 · N2-0 骨架 + N2-1 sphere-angles 后）**：manifest **572 ported / 70 blocked / 55 skipped · 26 标签 · 镜像 586 个 `.fai.js` + 19 个 `.blocked`** · 单测 **720 用例 / 76 文件**（仍 1 红：同上 §1.3）· lint 绿 · tsc 绿 · parity 基线仍 80.00%（10-07，未重扫）。分类实况 **A 余 0 · B 余 21 · C 43 · D 5**；N2 余：`plane` 2 · `project` 4 · `export:free-face-in-compound` 1 · `op:faceOn` 1。

**实测快照（2026-10-10 · N2-2 `plane` 后）**：manifest **573 ported / 69 blocked / 55 skipped · 26 标签 · 镜像 587 个 `.fai.js` + 19 个 `.blocked`** · 单测 **720 用例 / 76 文件**（仍 1 红：同上 §1.3）· lint 绿 · tsc 绿 · parity 基线仍 80.00%（10-07，未重扫；**投影** 82.31%）。分类实况 **A 余 0 · B 余 20 · C 43 · D 6**（`0+20+43+6 = 69` ✅）；N2 余：`project` 4 · `export:free-face-in-compound` 1 · `op:faceOn` 1（`plane` 清零）。本轮翻转 1 条（`test_history_loft__res`，零行 src 新代码）；`plane` 的另一条判入 D，并顺带纠正 §3.2/§3.4/§3.5 三处算错的分母。

**实测快照（2026-10-10 · N2-3 `project` 判 C 后）**：manifest **573 ported / 69 blocked / 55 skipped · 26 标签 · 镜像 587 个 `.fai.js` + 19 个 `.blocked`** · 单测 **720 用例 / 76 文件**（仍 1 红：同上 §1.3）· lint 绿 · tsc 绿 · tsc/lint 未因本轮变动（**纯判定 + 文档**，零 `src/` 改动）· parity 基线仍 80.00%（10-07，未重扫；**投影** 82.31%）。分类实况 **A 余 0 · B 余 16 · C 47 · D 6**（`0+16+47+6 = 69` ✅）；N2 余：`export:free-face-in-compound` 1 · `op:faceOn` 1。本轮**零翻转**，全部价值是**把 4 条从 B 判入 C**（避免按 §4.5.4 明禁的「离散+拟合冒充」去解锁），并留下可重跑的捕获 `tests/ref-harness/project-probe.py`。

**实测快照（2026-10-10 · N2-4 `export:free-face-in-compound` 闭合 + N3 前提复盘后）**：manifest **574 ported / 68 blocked / 55 skipped · 26 标签** · 单测 **720 用例 / 76 文件**（仍 1 红：§1.3 `TestCQSelectors__testShape__res4`，与本次无关）· lint 绿 · tsc 绿。分类实况 **A 余 0 · B 余 15**（`op:assembly-solve` 14 + `op:faceOn` 1）· **C 47 · D 6**（`0+15+47+6 = 68` ✅）。**N3 前提复盘**：faijs 已自带 `global-solver.js`，`op:assembly-solve` 由「从零造求解器」改为「扩展现有求解器 + 补兼容层」，§N3 已重写（缺口聚类 P1-P5、工作量重估下调）。
