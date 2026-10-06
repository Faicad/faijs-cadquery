# faijs 脚本中的 `cq.*` API 参考

> 对象：`.fai.js` 脚本里的 `cq` 命名空间，即 `@faicad/faijs-cadquery` 的根导出面。
> 版本基准：`@faicad/faijs-cadquery` v0.29.5（`src/index.ts`）。
> 相关：架构与翻译原理见 [`faijs-cadquery-architecture.md`](./faijs-cadquery-architecture.md)。

## 1. `cq.*` 到底是什么

### 1.1 它是“库命名空间的本地别名”，不是一个类

脚本里写的：

```js
import * as cq from '@faicad/faijs-cadquery'
```

`cq` 只是这次 import 的**本地绑定名**（`localName`），可以是任意名字（`import * as cadquery`、`import * as g` 都行）。它指向一个**普通的 ESM 命名空间对象**，里面是一堆函数。

它**不是** Python 里的 `import cadquery as cq`：Python 的 `cq` 下是类与方法（`cq.Workplane(...).box(...)`），而 faijs 的 `cq` 下是**独立函数**，没有方法链。

### 1.2 范式：Workplane 作为第一个参数

CadQuery 是链式方法：

```python
cq.Workplane("XY").box(100, 80, 10).faces(">Z").workplane().hole(5)
```

faijs 展开成独立函数，第一个参数是 `Workplane`（见 `src/index.ts:9-14` 的用法示例）：

```js
let wp = cq.Workplane('XY')
wp = await cq.box(wp, 100, 80, 10)
wp = cq.faces(wp, '>Z')
wp = await cq.workplane(wp)
wp = await cq.hole(wp, 5)
let shape = cq.val(wp)
```

要点：

- **Workplane 是不可变容器**：除少数就地工具外，op 返回**新的 Workplane**，所以要 `wp = cq.xxx(wp, ...)` 接收返回值。
- **`wp` 首参**：绝大多数函数签名是 `(wp, ...args)`；也有少量“自由构造/工具”不以 `wp` 开头（如 `Workplane()`、`vertex()`、`compound()`、`solid()`、`plane()`、`Location()`）。
- **同步/异步混合**：涉及内核几何运算的 op 多为 `async`（需 `await`）；纯栈操作（`faces`/`edges`/`tag`/`faces`/`workplaneFromTagged`/`val` 等）是同步的。以函数签名里的返回值 `Promise<Workplane>` 为准。
- **这是为转译和受限 JS 子集设计的**：`.fai.js` 无方法链，转译器把 CadQuery 的方法链改写为这种形态（见架构文档 §1.3）。

### 1.3 它如何被脚本“看见”

- 宿主通过 `CadRuntime.registerLib('cq', ns, { packageName: '@faicad/faijs-cadquery' })` 注册（测试见 `src/faijs-cadquery.test.ts:19`）；生产环境由 CLI 依 import 自动装载。
- 本包 `package.json:47-49` 声明 `"faijs": { "autoLift": false }`：即**不做语句级 op 提升、不携带 `DUAL_OP_META`**。它的函数以 faijs `Workplane`/`Shape` 为受众，原样注册。
- 因此 `cq.*` 与内置的 `cad.*`（`@faicad/faijs` 默认命名空间）是**两个并列的命名空间**：`cq.*` 提供 CadQuery 语义，`cad.*` 提供 faijs 原生 op。

### 1.4 与 CadQuery 的对应关系

| CadQuery（Python） | faijs（`cq.*`） |
|---|---|
| `cq.Workplane("XY")` | `cq.Workplane('XY')` |
| `wp.box(w, d, h)` | `cq.box(wp, w, d, h)` |
| `wp.faces(">Z")` | `cq.faces(wp, '>Z')` |
| `wp.val()` | `cq.val(wp)`（返回 faijs `Shape`） |
| `wp.export("x.step")` | 丢弃，导出交给 faijs CLI |

---

## 2. 调用范式（推荐顺序）

```
构造 Workplane ──▶ 选面/边 ──▶ 定位到工作平面 ──▶ 造 2D 轮廓或直接 3D op
      ──▶ 组合/布尔/特征 ──▶ val()/vals() 取出 Shape ──▶ 引擎导出
```

完整示例（含自由构造与布尔）：

```js
import * as cq from '@faicad/faijs-cadquery'

let base = cq.Workplane('XY')
let b = await cq.box(base, 40, 30, 5)

let cut = cq.Workplane('XY')
cut = await cq.cylinder(cut, 10, 3)

let part = await cq.cut(b, cut)
let pocket = await cq.faces(part, '>Z')
pocket = await cq.workplane(pocket)
pocket = await cq.rect(pocket, 10, 10)
part = await cq.cutBlind(pocket, 2)

let shape = cq.val(part)   // faijs Shape，交给引擎做 BREP/STEP
```

---

## 3. API 总览

`@faicad/faijs-cadquery` 根命名空间（`src/index.ts`）公开面分为六组：

| 组 | 前缀/形态 | 说明 |
|---|---|---|
| Workplane 建模层 | `cq.xxx` | 最大的一组，CadQuery `Workplane` 语义，`wp` 首参 |
| Sketch 草图层 | `cq.sketchXxx` | 带 `sketch` 前缀（避免与 Workplane 同名 op 冲突） |
| Shape 域 | `cq.xxxOf` / `cq.makeCompound` … | 直接操作 CadQuery `Shape`（`CqShape`） |
| 选择器类 | `cq.TypeSelector` … | CadQuery `selectors.py` 对象选择器类 |
| Plane 变换 | `cq.toLocalCoords` … | `Plane.toLocalCoords` / `mirrorInPlane` 语义 |
| 类型 | `WorkplaneType` / `CqShape` … | 仅 TS 类型，脚本运行期无实体 |

---

## 4. Workplane 建模层（`cq.*`）

### 4.1 容器与栈

| 函数 | 说明 |
|---|---|
| `cq.Workplane(plane?)` | 构造栈；`plane` 可为 `'XY'/'YZ'/'XZ'`、`Shape` 或另一 `Workplane`（`src/workplane.ts:959`） |
| `cq.CQ(obj?)` | `Workplane` 的别名构造（`workplane.ts:974`） |
| `cq.add(wp, obj)` | 把 `Shape`/`Workplane`/数组压入栈（`workplane.ts:1029`） |
| `cq.val(wp)` | 取栈顶单个 `Shape \| null`（`workplane.ts:6066`） |
| `cq.vals(wp)` | 取栈内全部 `Shape[]`（`workplane.ts:6080`） |
| `cq.all(wp)` | 栈转 `Workplane[]`（`workplane.ts:6095`） |
| `cq.first(wp)` / `cq.last(wp)` / `cq.item(wp, i)` | 取第 1 / 最后 / 第 i 个（`workplane.ts:6108/6119/6136`） |
| `cq.end(wp, n=1)` | 回退栈（`workplane.ts:6165`） |
| `cq.findSolid(wp)` | 找到实心体（`workplane.ts:6203`） |
| `cq.partAt(wp, i)` | 取第 i 个 part（`workplane.ts:7233`） |
| `cq.size(wp)` | 栈元素个数（`workplane.ts:2559`） |
| `cq.bboxSize(wp)` | 包围盒尺寸 `[x,y,z]`（`workplane.ts:2577`） |
| `cq.tag(wp, name)` | 给当前对象打标签（`workplane.ts:4204`） |
| `cq.workplaneFromTagged(wp, name)` | 切回标签对象（`workplane.ts:4224`） |
| `cq.copyWorkplane(wp, obj)` | 拷贝平面（`workplane.ts:4519`） |
| `cq.combine(wp)` | 合并栈内对象（`workplane.ts:5418`） |
| `cq.clean(wp, tol?)` | 清理/缝合（`workplane.ts:2592`） |
| `cq.consolidateWires(wp)` | 归并线框（`workplane.ts:2610`） |
| `cq.sortStack(wp, key)` / `cq.stackFilter` / `cq.stackMap` / `cq.stackApply` / `cq.sort` | 栈级函数式操作（`workplane.ts:6276/6235/6246/6259/2629`） |

### 4.2 3D 实体原语与自由构造

| 函数 | 说明 |
|---|---|
| `await cq.box(wp, w, d, h, opts?)` | 长方体（`workplane.ts:1064`） |
| `await cq.sphere(wp, radius, opts?)` | 球（`workplane.ts:1333`） |
| `await cq.cylinder(wp, height, radius, opts?)` | 圆柱（`workplane.ts:1515`） |
| `await cq.cone(wp, d1, d2, h, opts?)` | 圆锥/台（`workplane.ts:1598`） |
| `await cq.torus(wp, d1, d2, opts?)` | 圆环（`workplane.ts:1573`） |
| `await cq.wedge(wp, dx, dy, dz, ...)` | 楔体（`workplane.ts:1388`） |
| `await cq.text(wp, txt, fontsize, distance, opts?)` | 3D 文字（`workplane.ts:1145`） |
| `cq.solidMakeCone(r1, r2, h)` | 自由构造圆锥 `Shape`（`workplane.ts:1643`） |
| `cq.solid(...inputs)` | 合并为实心 `Shape`（`workplane.ts:6863`） |
| `cq.solidWithInner(...)` | 带内腔实心（`workplane.ts:6904`） |
| `await cq.addCavity(...)` | 增加腔体（`workplane.ts:6976`） |
| `cq.vertex(x=0, y=0, z=0)` | 构造顶点 `Shape`（`workplane.ts:5597`） |
| `cq.compound(...items)` | 构造 compound `Shape`（`workplane.ts:5614`） |
| `cq.imprint(...shapes)` | 印记（`workplane.ts:5650`） |

### 4.3 2D 草图（在当前工作平面上）

| 函数 | 说明 |
|---|---|
| `cq.rect(wp, w, h, opts?)` | 矩形（`workplane.ts:1695`） |
| `cq.circle(wp, radius)` | 圆（`workplane.ts:1759`） |
| `cq.ellipse(wp, x_radius, y_radius)` | 椭圆（`workplane.ts:1788`） |
| `cq.polygon(wp, n, d)` | 正多边形（`workplane.ts:1819`） |
| `cq.slot2D(wp, length, diameter, angle?)` | 槽（`workplane.ts:7958`） |
| `cq.moveTo(wp, x=0, y=0)` / `cq.move2D(wp, xDist, yDist)` | 移动当前点（`workplane.ts:2310/2326`） |
| `cq.lineTo(wp, x, y, forConstruction?)` | 连线到点（`workplane.ts:2340`） |
| `cq.line(wp, xDist, yDist, forConstruction?)` | 相对画线（`workplane.ts:2352`） |
| `cq.vLine/hLine/vLineTo/hLineTo(wp, ..., forConstruction?)` | 水平/垂直直线（`workplane.ts:2365/2377/2389/2401`） |
| `cq.polyline(wp, pts, forConstruction?, includeCurrent?)` | 折线（`workplane.ts:2418`） |
| `cq.close(wp)` | 闭合（`workplane.ts:2483`） |
| `cq.wire(wp, forConstruction?)` | 生成线框（`workplane.ts:2445`） |
| `cq.threePointArc/sagittaArc/radiusArc/tangentArcPoint(...)` | 各类圆弧（`workplane.ts:2130/2150/2184/2212`） |
| `cq.spline(wp, ...)` / `cq.bezier(wp, ...)` | 样条/贝塞尔（`workplane.ts:2237/2512`） |
| `cq.splineWire3D(...)` | 3D 样条线（`workplane.ts:7274`） |
| `cq.polarLine(wp, distance, angle)` / `cq.polarLineTo(...)` | 极坐标线（`workplane.ts:7896/7911`） |
| `cq.rarray(wp, xSpacing, ySpacing, xCount, yCount)` | 矩形阵列点（`workplane.ts:1664`） |
| `cq.polarArray(wp, ...)` | 极坐标阵列（`workplane.ts:7855`） |
| `cq.pushPoints(wp, pts)` / `cq.center(wp, x, y)` | 压入点阵（`workplane.ts:4880/4869`） |
| `cq.faceFromPoints(wp, pts)` | 由点集成面（`workplane.ts:6746`） |
| `await cq.face(wp)` / `cq.plane(w, l)` | 面 / 辅助平面（`workplane.ts:5453/5578`） |

### 4.4 拉伸 / 旋转 / 扫掠 / 放样 / 偏移

| 函数 | 说明 |
|---|---|
| `await cq.extrude(wp, height, combine?, opts?)` | 拉伸（`workplane.ts:2939`） |
| `await cq.revolve(wp, angleDegrees=360, axisStart?, axisEnd?, ...)` | 旋转成型（`workplane.ts:3440`） |
| `await cq.loft(wp, ...rest)` | 放样（`workplane.ts:3561`） |
| `await cq.sweep(wp, ...)` | 扫掠（`workplane.ts:7312`） |
| `await cq.twistExtrude(wp, angle, height, opts?)` | 扭转拉伸（`workplane.ts:6681`） |
| `await cq.offset(wp, t, opts?)` | 实体 3D 偏移（`workplane.ts:5941`） |
| `await cq.offset2D(wp, d, opts?)` | 2D 偏移（`workplane.ts:7505`） |
| `await cq.helix(wp, pitch, height, radius, ...)` | 螺旋线（`workplane.ts:6575`） |

### 4.5 布尔与组合

| 函数 | 说明 |
|---|---|
| `await cq.union(wp, other, opts?)` | 并（`workplane.ts:5390`） |
| `await cq.cut(wp, other, opts?)` | 差（`workplane.ts:5430`） |
| `await cq.intersect(wp, other, opts?)` | 交（`workplane.ts:5669`） |
| `await cq.cutEach(wp, item, opts?)` | 逐点切除（`workplane.ts:4696`） |
| `await cq.eachpoint(wp, item, opts?)` | 逐点操作（`workplane.ts:4742`） |
| `await cq.solidFromFaces(wp, faces, opts?)` | 由面缝合实体（`workplane.ts:6792`） |
| `await cq.planarCap(wp, faces, plane, opts?)` | 平面封盖（`workplane.ts:7059`） |
| `await cq.splineFace(wp, grid, opts)` | B-spline 网格面（`workplane.ts:6492`） |
| `await cq.splitFace(wp, plane, keep?)` | 按平面切面（`workplane.ts:6618`） |

### 4.6 特征（孔 / 圆角 / 倒角 / 抽壳 / 分割 / 截面）

| 函数 | 说明 |
|---|---|
| `await cq.hole(wp, diameter, depth?)` | 孔（`workplane.ts:3805`） |
| `await cq.cboreHole(wp, diameter, cboreDiameter, cboreDepth, ...)` | 沉头孔（`workplane.ts:3845`） |
| `await cq.cskHole(wp, diameter, cskDiameter, cskAngle, ...)` | 锥沉孔（`workplane.ts:3883`） |
| `await cq.threadedHole(wp, diameterOrFastener, depth?)` | 螺纹孔（`workplane.ts:3917`） |
| `await cq.cutBlind(wp, depth, opts?)` | 盲切（`workplane.ts:3621`） |
| `await cq.cutThruAll(wp)` | 通切（`workplane.ts:3746`） |
| `await cq.fillet(wp, radius)` | 圆角（按已选边）（`workplane.ts:5706`） |
| `await cq.chamfer(wp, length, length2?)` | 倒角（`workplane.ts:5749`） |
| `await cq.shell(wp, thickness)` | 抽壳（按已选面）（`workplane.ts:5866`） |
| `await cq.split(wp, point?, normal?, opts?)` | 分割（`workplane.ts:7185`） |
| `await cq.section(wp, height=0, normal?)` | 截面（`workplane.ts:7246`） |

### 4.7 选择

| 函数 | 说明 |
|---|---|
| `cq.faces(wp, sel)` | 选面，字符串语法如 `'>Z'`、`'|Z'`、`'#Z'`（`workplane.ts:4175`） |
| `cq.edges(wp, sel?)` | 选边；`sel` 可为字符串或 `{ slice:[a,b] }` / `{ index }`（`workplane.ts:4249`） |
| `cq.vertices(wp, sel?)` | 选顶点（`workplane.ts:4289`） |
| `cq.solids(wp)` / `cq.wires(wp)` / `cq.compounds(wp)` / `cq.shells(wp)` | 按类型取子形状（`workplane.ts:4496/7591/7614/7634`） |
| `await cq.faceCompound(wp, sel)` / `await cq.edgeCompound(wp, sel)` | 面/边 compound（`workplane.ts:5005/5061`） |
| `cq.siblings(start, ctxShape, kind, level, ...)` | 兄弟子形状（`workplane.ts:4090`） |

### 4.8 定位与变换

| 函数 | 说明 |
|---|---|
| `await cq.translate(wp, v)` | 平移（`workplane.ts:4895`） |
| `await cq.rotate(wp, axis, angle)` | 绕轴旋转（`workplane.ts:4911`） |
| `await cq.mirror(wp, mirrorPlane?, basePointVector?, union?)` | 镜像（`workplane.ts:4960`） |
| `await cq.mirrorX(wp)` / `await cq.mirrorY(wp)` | 便捷镜像（`workplane.ts:7809/7820`） |
| `await cq.moved(wp, ...locs)` / `await cq.move(wp, ...locs)` | 按 Location 复制/移动（`workplane.ts:5344/5380`） |
| `await cq.rotateAboutCenter(wp, ...)` | 绕中心旋转（`workplane.ts:7926`） |
| `await cq.transformed(wp, { offset?, rotate? })` | 偏移+欧拉旋转（`workplane.ts:6379`） |
| `cq.Location(...)` / `cq.isLocation(v)` / `cq.composeLocations(a,b)` | Location 构造/判定/合成（`workplane.ts:5137/5120/5177`） |
| `cq.setColor(wp, color)` | 设置颜色（`workplane.ts:6438`） |

---

## 5. Sketch 草图层（`cq.sketchXxx`）

CadQuery `Sketch` 语义，导出名统一加 `sketch` 前缀以避开 Workplane 同名 op（见 `src/index.ts:155-209`）。签名形态为 `(sk, ...)`。

**基础图元**：`sketchCreate()`、`sketchRect(sk,w,h,opts?)`、`sketchCircle(sk,r,opts?)`、`sketchEllipse`、`sketchPolygon`、`sketchRegularPolygon(sk,r,n)`、`sketchSlot`、`sketchTrapezoid`、`sketchOffset`、`sketchHull`、`sketchHullFromPoints`。

**边/面构造**：`sketchPush`、`sketchEdge`、`sketchFace`、`sketchSegment`、`sketchArc`、`sketchSpline`、`sketchBezier`、`sketchClose`、`sketchAssemble`。

**选择**：`sketchFaces`、`sketchWires`、`sketchEdges`、`sketchVertices`、`sketchSelect`、`sketchTag`、`sketchReset`。

**读写**：`sketchVal`（`ShapeHandle`）、`sketchVals`、`sketchArea`、`sketchFaceCount`。

**组合与复制**：`sketchAdd`、`sketchSubtract`、`sketchRarray`、`sketchParray`、`sketchDistribute`、`sketchMoved`、`sketchLocated`、`sketchCopy`、`sketchDelete`、`sketchReplace`。

**特征与约束**：`sketchFillet`、`sketchChamfer`、`sketchClean`、`sketchConstrain`、`sketchSolve`、`sketchFinalize`、`sketchDispose`。

**成体**：`sketchExtrude(sk, height)` → `ShapeHandle`。

Workplane 侧的桥接：`cq.sketch(wp)`、`cq.placeSketch(wp, ...sks)`、`cq.sketchFinish(sk, wp)`（`src/index.ts:137-140`）。

---

## 6. Shape 域（`cq.*Of` 等）

直接操作 CadQuery `Shape`（`CqShape`）/ `ShapeHandle`（`src/index.ts:229-253`）：

| 函数 | 说明 |
|---|---|
| `cq.wrapShape(kind, handle)` / `cq.borrowShape(...)` / `cq.unwrapShape(s)` / `cq.disposeShape(s)` | 句柄包装/借用/解包/释放 |
| `cq.makeCompound(shapes)` | 构造 Compound |
| `cq.facesOf(s)` / `cq.wiresOf(s)` | 面/线框子形状 |
| `cq.faceMakePlane(...)` / `cq.faceMakeSplineApprox(points, tol?)` | 建平面/样条面 |
| `cq.boundingBoxOf(s)` / `cq.volumeOf(s)` / `cq.areaOf(s)` / `cq.lengthOf(s)` | 包围盒/体积/面积/长度 |
| `cq.centerOfMassOf(s)` / `cq.centerOf(s)` / `cq.radiusOf(s)` | 质心/中心/半径 |
| `cq.shapeTypeOf(s)` / `cq.geomTypeOf(s)` / `cq.isValidShape(s)` | 类型/几何类型/有效性 |

---

## 7. 选择器类（对象选择器）

CadQuery `selectors.py` 的对象选择器类（`src/index.ts:259-271`）。TS 无 `&`/`+`/`-` 运算符重载，**二元组合选择器必须显式构造**：

- 类型/方向：`TypeSelector`、`DirectionSelector`
- 位置：`NearestToPointSelector`、`NearestToShapeSelector`、`BoxSelector`
- 第 N 个：`NthSelector`（抽象基类）、`CenterNthSelector`、`LengthNthSelector`、`AreaNthSelector`、`RadiusNthSelector`
- 字符串语法：`StringSyntaxSelector`
- 组合：`AndSelector`（`&`）、`SumSelector`（`+`）、`SubtractSelector`（`-`）、`InverseSelector`（`~`）

---

## 8. Plane 坐标变换

CadQuery `Plane.toLocalCoords` / `mirrorInPlane` 语义（`src/index.ts:281-288`）：

| 函数 | 说明 |
|---|---|
| `cq.toLocalCoords(plane, shape)` / `cq.toWorldCoords(plane, shape)` | 世界↔局部坐标 |
| `cq.mirrorInPlane(plane, shape, axis?)` | 在平面内镜像 |
| `cq.toLocalCoordsVec(plane, v)` / `cq.mirrorInPlaneVec(plane, v)` | 对纯向量版本 |

---

## 9. 类型导出（TS only）

`WorkplaneType`、`RGB`、`CqLocation`、`TaggedWorkplane`、`CombineMode`、`HAlign`、`VAlign`（`src/index.ts:145-153`）；`Pt3`、`CqShape`、`Selector`、`CqBBox`；`CqPlane`；`Vec3`。这些只在 TypeScript 编译期存在，`.fai.js` 运行期无实体。

---

## 10. 使用注意

1. **必须接返回值**：Workplane op 返回新容器，`cq.box(wp, ...)` 不改变原 `wp`；正确写法 `wp = await cq.box(wp, ...)`。
2. **`await` 只用于异步 op**：`faces`/`edges`/`tag`/`val` 等同步函数不要加 `await`（虽然加了通常无害）；判定标准是签名返回值是否为 `Promise<...>`。
3. **`val` vs `vals`**：`cq.val(wp)` 取单个 `Shape | null`，`cq.vals(wp)` 取全部；终态交给引擎的是 `Shape`。
4. **无方法链、无运算符重载**：`wp.faces()` 必须写 `cq.faces(wp)`；选择器 `&`/`+`/`-` 必须用 `AndSelector`/`SumSelector`/`SubtractSelector` 显式构造。
5. **与 `cad.*` 并存**：`cq.*` 是 CadQuery 兼容层，`cad.*` 是 faijs 原生 op；同一脚本可同时使用（如 `cq.val(...)` 得到的 `Shape` 可传给 `cad.*`，`faijs-gears` 的输出也可传给 `cq.*`，前提是它们都是 faijs `Shape`）。
6. **`autoLift=false` 的后果**：`cq.*` 不是语句级 op，不会被 `compatOp` 提升，因此不参与 `DUAL_OP_META` 的语句边界/能力分派；它的输入输出必须都是 faijs `Shape`/`Workplane`。
7. **部分内部工具未导出**：`src/workplane.ts` 内的 `draft`、`filterByPredicate`、`sortByKey`、`textOnSpine`、`dispose`、`asBrepShape` 等**不在根命名空间**（未出现在 `src/index.ts` 的导出里），脚本侧不可直接用。

---

## 11. 源码索引

| 主题 | 位置 |
|---|---|
| 根命名空间导出面 | `src/index.ts:17-297` |
| Workplane 核心实现 | `src/workplane.ts`（6000+ 行） |
| `val` / `vals` | `src/workplane.ts:6066/6080` |
| Sketch 层 | `src/sketch.ts`；导出别名 `src/index.ts:159-209` |
| Shape 域 | `src/shape-class.ts` |
| 对象选择器 | `src/object-selectors.ts` |
| Plane 变换 | `src/plane.ts` |
| 脚本入口/注册示例 | `.fai.js` 头部 `import * as cq from '@faicad/faijs-cadquery'`；测试注册见 `src/faijs-cadquery.test.ts:19` |