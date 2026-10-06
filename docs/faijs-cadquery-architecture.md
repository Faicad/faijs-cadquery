# faijs-cadquery 技术实现原理分析

> 本文基于以下源码快照撰写（2026-10-06）：
> - `@faicad/faijs-cadquery` v0.29.5（本仓库，`C:\my\Faicad\faijs-cadquery`）
> - `@faicad/faijs` `packages/core`、`@faicad/faijs-gears` v0.30.4（`C:\my\Faicad\faijs`）
>
> 涉及行号均标注为 `文件:行`，便于对照源码。

## 0. 总览：两件事、两层“翻译”

本项目要回答两个问题，分别落在两套机制上：

1. **CadQuery（Python）建模代码如何变成 faijs（JavaScript/TypeScript）代码？**
   —— 由本仓库的**定向转译器**完成：`scripts/dump_ast.py`（Python → AST JSON）+ `src/transpile.ts`（AST JSON → `.fai.js`）。
2. **`.fai.js` 运行时如何调用库函数（`@faicad/faijs-cadquery`、`@faicad/faijs-gears` 等）？**
   —— 由 `@faicad/faijs` 的 **CadRuntime 库装载与注册机制**完成：`import` 元数据 → `libLoader` → `registerLib` →（按需）`compatOp` 提升。

先建立 faijs 的分层心智模型（见 `../faijs/README.zh.md`）：

| 层 | 位置 | 职责 |
|---|---|---|
| L0 文本层 | `packages/core/src/lang/` | `faijs` 是**合法的 JavaScript 子集**，**无控制流**（无 `if`/`for`/`while`/`try`、无动态 `import()`）；脚本经 acorn 解析、编译为零 import 的 ESM，由 JS VM 执行（不用 `eval`/`new Function`） |
| L1 几何层 | `packages/core/src/brep/` + `src/mesh/` | 每个 op 有 BREP（OCCT）与 mesh（manifold-3d）路径，`ops/dispatcher.ts` 静态分派 |
| L2 编排层 | `packages/core/src/cad-runtime/` | `CadRuntime` + `HostPorts`，负责库注册、执行、输出收集 |
| L3 宿主层 | `packages/core/src/node-host/`、`browser-host/` | Node CLI、浏览器 demo，实现 `LibLoader` 等端口 |

本仓库 `@faicad/faijs-cadquery` 是 **CadQuery 2.8.0 的 API 兼容层**，几何运算跑在 `occt-wasm` 内核上；它**不是** CadQuery 本身，而是把 CadQuery 的 `Workplane`/Assembly 表面移植成 faijs 可消费的库。

---

## 1. CadQuery 建模代码如何翻译为 faijs 代码

### 1.1 两段式流水线：Python AST → JSON → JS

```
CadQuery .py ──python ast──▶ AST JSON ──transpile.ts──▶ .fai.js
              (dump_ast.py)                 (遍历 JSON 节点)
```

- **取 AST**：`scripts/transpile-file.ts:16` 通过 `execFileSync('python', [dump_ast.py, pyPath])` 调用 Python；`scripts/dump_ast.py:7` 用标准库 `ast.parse` 解析源码，`_serialize()`（`dump_ast.py:7-17`）把语法树递归转成带 `_type` 字段的 JSON。
- **生成 JS**：`src/transpile.ts:94` 的 `transpile(ast, config, partName)` 递归遍历 JSON 节点，输出 `.fai.js` 文本。
- **入口**：`scripts/transpile-file.ts` 是 CLI（用法 `npx tsx scripts/transpile-file.ts <input.py> <output.fai.js> [partName]`）。

> 定位提醒：源码头部明确 “Not a general Python transpiler — targeted at CadQuery scripts”（`src/transpile.ts:12`）。它只覆盖 CadQuery 项目中实际出现的模式，不是通用 Python → JS 转译。

### 1.2 `import` 与库入口的处理

转译器**丢弃所有 Python import**，并在文件头**固定注入**一个 faijs 库入口：

- `transpileStmt` 对 `Import` / `ImportFrom` 直接返回 `null`（`src/transpile.ts:153-155`），即 `import cadquery as cq`、`import math`、`import config` 都不会出现在产物里。
- 文件头固定写入 `import * as cq from '@faicad/faijs-cadquery'`（`src/transpile.ts:103`）。

结论：**该转译器只面向 `cq` 这一个库**。如果源脚本依赖别的第三方库（例如 `faijs-gears`），转译器不会代你生成对应 import —— 这类场景需要手工编写 `.fai.js`（见 §3.5 的 `gear-demo.fai.js`）。

### 1.3 核心改写：方法链 → “Workplane 作首参的独立函数”

这是本项目 API 形态最关键的设计。CadQuery 是**链式方法调用**：

```python
wp = cq.Workplane("XY").box(100, 80, 10).faces(">Z").workplane().hole(5)
```

而 faijs 兼容层导出的是**独立函数**，`Workplane` 作为第一个参数（`src/index.ts:17` 起导出 `box/sphere/faces/hole/...`），因此产物是嵌套函数调用：

```js
let result = cq.val(cq.hole(cq.workplane(cq.faces(cq.box(cq.Workplane('XY'), 100, 80, 10), '>Z')), 5))
```

为什么？因为 `.fai.js` 是受限 JS 子集且转译器要处理任意链；把方法转成纯函数后，链的每一步都是普通表达式，转译与执行都更可控。

实现要点（`src/transpile.ts:371-535` 的 `transpileMethodCall`）：

- **递归下降**：对 receiver 递归 `transpileExpr`，于是链 `a.b().c()` 自然展开为 `cq.c(cq.b(a))`（`transpile.ts:371`）。
- **构造特判**：`cq.Workplane("XY")` 原样保留（`transpile.ts:400`）。
- **结果读取特判**：`wp.val()` → `cq.val(wp)`、`wp.vals()` → `cq.vals(wp)`（`transpile.ts:407-411`）。
- **关键字参数**：Python kwargs 合成为 JS 对象字面量，如 `wp.rect(w, h, forConstruction=True)` → `cq.rect(wp, w, h, { forConstruction: true })`（`transpile.ts:419-424`）；`wp.workplane(offset=...)` → `cq.workplane(wp, { offset })`（`transpile.ts:442-445`）；`wp.transformed(offset=(x,y,z))` → `cq.transformed(wp, { offset: [...] })`（`transpile.ts:414-417`）。
- **导出特判**：`wp.export("file.step")` 被丢弃为 `null`（`transpile.ts:405`）——导出由 faijs CLI 负责。
- **通用兜底**：任何未显式列举的方法都走 `cq.${method}(receiver, args...)`（`transpile.ts:534`），保证新 op 无需逐一改转译器。

### 1.4 库/工具函数的处理（math、config）

- **`math` → `Math`**：`transpileName` 把标识符 `math` 映射为 `Math`（`src/transpile.ts:300-307`）；对 `math.radians` / `math.degrees` 做内联换算（调用形态下生成 `arg * Math.PI / 180`，见 `transpile.ts:393-397`），其余 `math.sqrt/cos/sin/...` 直接映射 `Math.*`。
- **`config.py` 常量/函数内联**：`scripts/transpile-file.ts:29-35` 会在输入文件同目录查找 `config.py`，用 `extractConfig()`（`transpile.ts:47-79`）抽出顶层常量（单目标 `Assign`）与函数（`FunctionDef`），作为“内联表”传入：
  - 常量引用 `config.FOO` → 直接替换成字面量（`transpile.ts:321-323`、`transpile.ts:388-390`）；
  - `config.fn(args)` → 内联为一个全局 `async function fn(...)` 并调用（`transpile.ts:382-385`，函数体生成见 `transpile.ts:227-234`）。
  这样 `.fai.js` 产物是**自包含**的，不依赖 Python 运行时。

### 1.5 表达式、控制流与语法映射

| CadQuery / Python | 产物 JS | 位置 |
|---|---|---|
| `def f(x)` | `async function f(x) { ... }` | `transpile.ts:227-234` |
| cq/config 调用（**函数体内**） | 前缀 `await` | `transpile.ts:357-360` |
| `True` / `False` | `true` / `false` | `transpile.ts:544` |
| 二元运算 `a ** b` | `a ** b`（含 `+ - * / %` 等） | `transpile.ts:553-564` |
| 比较/布尔运算 | `===`、`&&`、`\|\|` 等 | `transpile.ts:269-291` |
| 列表推导 `[e for x in xs]` | `xs.map((x) => e)` | `transpile.ts:612-623` |
| `.vertices()[a:b]` | `cq.vertices(wp, { slice: [a, b] })` | `transpile.ts:580-599` |
| `.vertices()[-1]` | `cq.vertices(wp, { index: -1 })` | `transpile.ts:596-598` |
| 关键字参数 / `*args` | `{ k: v }` / `...value` | `transpile.ts:537-551` |

`if __name__ == "__main__":`、`if True or ...`、`"..." not in globals()` 这类“展示/主程序保护”会被识别并丢弃（`transpile.ts:173-212`）。

### 1.6 终端提取：`let result = cq.val(...)`

`transpile()` 记录模块体**最后一次单目标赋值**的变量名（`transpile.ts:124-137`），并在文件末尾追加：

```js
let result = cq.val(<lastAssignName>)
```

（`src/transpile.ts:140-144`）。这与 parity 用例的镜像约定一致：**镜像脚本末行必须是 `let result = cq.val(...)`**，且变量名与参考用例的 `__var__` 对齐（见 `src/mirror-export-convention.test.ts`）。

### 1.7 目标 `.fai.js` 的真实形态（镜像脚本样例）

转译产物与 parity 镜像脚本共享同一套 API 形态。真实镜像脚本 `tests/test_free_functions/test_box__s.fai.js`：

```js
import * as cq from '@faicad/faijs-cadquery'
let s = await cq.box(cq.Workplane(), 1, 1, 1, { centered: [true, true, false] })
let result = cq.val(s)
```

`cq.val()` 返回 faijs 核心的 `Shape | null`（`src/workplane.ts:6066`），即把 Workplane 内部的几何栈“取出”成引擎可识别的 Shape。

> ⚠️ 注意区分两种 await 语义：
> - 转译器只在**函数体（`ctx.inFunction`）内**为 cq/config 调用补 `await`（`transpile.ts:357-360`）；模块顶层直接调用不加。因此该转译器更适配“建模逻辑写在 Python `def` 里”的脚本。
> - `tests/**/*.fai.js` 镜像脚本是 **parity 用例，人工维护**，不是转译器逐字产物；它们顶层用了 `await`，是因为被调用的 cq 函数本身是 `async`（见 §2.4 的 autoLift=false）。

---

## 2. `.fai.js` 运行时如何处理库函数调用

本仓的代码要真正跑起来，依赖 `@faicad/faijs` 的库装载与注册机制。下面按调用时间线拆解。

### 2.1 脚本 import → 引擎识别“这是库”

faijs 脚本形如：

```js
import * as cq from '@faicad/faijs-cadquery'
import * as gears from '@faicad/faijs-gears'
```

脚本被解析后，`import` 会形成元数据（`kind: 'namespace'`、`localName`、`packageName`、`specifier`）。宿主里各库的绑定名（statement-level binding）就是 `localName`（如 `cq`、`gears`）。

### 2.2 自动装载：`autoLoadLibsFromImports`

`CadRuntime.execute` 前会调用 `autoLoadLibsFromImports()`（`packages/core/src/cad-runtime/runtime.ts:1221-1255`）：

1. 只处理 `kind === 'namespace'` 的 import；跳过相对 specifier（多文件通道）。
2. 若 `localName` 已注册则跳过（宿主注入优先，不覆盖）。
3. 调用 `ports.libLoader.loadLib(packageName ?? specifier)` 拿到库的导出对象。
4. 调用 `this.registerLib(localName, ns, { autoLift, packageName })`（`runtime.ts:1249-1252`）。
5. 装载失败 → 返回带 `failedAt` 的 `ExecutionResult`，报 “import specifier … cannot be auto-loaded”。

`LibLoader` 契约见 `packages/core/src/cad-runtime/ports.ts:187-212`；它挂在 `HostPorts.libLoader`（`ports.ts:250`）。

### 2.3 Node CLI 的库解析：短名归一 + 逐库 autoLift

Node 宿主的 `LibLoader` 实现位于 `packages/core/src/node-host/cli.ts:84-116`：

- **短名/全名归一**：`CLI_SHORT_NAMES`（`cli.ts:53-58`）把短名映射到 `@faicad/*` 全名：
  `faijs-cadquery → @faicad/faijs-cadquery`、`faijs-gears → @faicad/faijs-gears`、`sheetmetal`、`faijs-fasteners`。
  仅允许 `@faicad/` 前缀（`cli.ts:51, 87-89`），避免误装同名陌生人包。
- **动态 import**：`(await import(pkg))`（`cli.ts:90`）。
- **逐库 autoLift**：`readLibAutoLift()`（`cli.ts:68-77`）读取该库 `package.json` 的 `faijs.autoLift` 字段；未声明则返回 `undefined`，回落运行时推断。

浏览器宿主则是静态映射表（Vite/Rollup 需静态可分析），例如 demo 的 `LOCAL_LIBS`（`packages/demo/main.ts:131-135`）。

### 2.4 `registerLib`：契约校验 + 提升决策

`CadRuntime.registerLib`（`packages/core/src/cad-runtime/runtime.ts:462-486`）：

```
registerLib(binding, ns, { default, autoLift, packageName, borrow })
  ① assertContractVersion(ns)          // 版本校验
  ② lift = autoLift ?? !hasDualOp(ns)  // 提升决策
  ③ admitted = lift ? admitCompatLib(ns, {borrow}) : ns
  ④ libs[binding] = admitted；记录 libIds / specifierToBinding / defaultNs
```

- **契约版本**：库可导出 `contractVersion`；引擎 `CONTRACT_VERSION = 3`（`runtime-state.ts:116`）。`assertContractVersion`（`runtime-state.ts:132-138`）规定：**未声明则跳过**，声明了就必须等于 3，否则抛错（不静默降级）。
  - `@faicad/faijs-gears` 导出了 `contractVersion`（`faijs-gears/src/index.ts:52`），因此受严格校验；
  - `@faicad/faijs-cadquery` 目前**未导出** `contractVersion`，故走“跳过校验”分支。
- **autoLift 推断**：`hasDualOp(ns)`（`define-op.ts:521-524`）判断命名空间里是否有函数携带 `DUAL_OP_META`。
  - 有 dual-op（如内置 `cad` 库）→ `lift = false`；
  - 全是裸函数（如 `faijs-gears`、`sheetmetal`）→ `lift = true` → 经 `compatOp` 提升（`runtime.ts:444-450`）。

`@faicad/faijs-cadquery` 在自己的 `package.json` 里显式声明了：

```json
"faijs": { "autoLift": false }
```

原因是它与 pure-faijs 库不同：它的函数以 **faijs `Workplane` / `Shape` 为受众**，若被 compat 边界整体提升，`borrowDeep` 会把实参里的 faijs Shape 换成 brepjs 借用视图，破坏其内部借面逻辑（`cli.ts:60-65, 195-201`）。`autoLift=false` 让它**原样注册**，脚本直接调用。

内置 `cad` 库则通过 `createRuntimeWithCad` 注册为默认命名空间（`createRuntimeWithCad.ts:24-30`）：

```ts
rt.registerLib('cad', createApiNamespace(), { default: true, packageName: '@faicad/faijs' })
```

### 2.5 “裸函数库”提升：`admitCompatLib` + `compatOp`

当 `lift = true` 时，`admit-compat-lib.ts:65-82` 的 `admitCompatLib` 逐项处理导出对象：

- 非函数（如 `contractVersion`）原样透传；
- 已带 `DUAL_OP_META` 的函数原样透传；
- **其余裸函数**用 `compatOp(fn, { name, outputs: fn.outputs, naming, borrow })` 包裹。

`compatOp`（`packages/core/src/api/internal/compat-op.ts`）建立在 `defineOp` 之上，做三步桥接（`compat-op.ts:14-27`）：

1. **borrowDeep（入向内借）**：深度遍历实参，把 faijs `Shape` 换成 brepjs 借用视图（零拷贝）；类实例/库私有句柄原样透传（`compat-op.ts:83-91`）。`borrow: false` 用于 faijs 原生库（如 sheetmetal）。
2. **调用 + unwrap**：调用库函数；若是异步（返回 `Promise<Result<…>>`）先 await，再经共享的 `unwrapResult` 解包——`err` 变成带 op 名的执行错误（`compat-op.ts:103-105`）。
3. **adoptOut（出向收编）**：把顶层句柄或 `outputs` 声明的字段（单个句柄或句柄数组）经 `adoptEntity` 收编为 faijs Shape（注销 finalizer + `fromHandle`），（`compat-op.ts:120-133`）。

**多输出契约**：库函数可挂 `fn.outputs = ['a','b',...]`，`admitCompatLib` 只认这一个名字（`admit-compat-lib.ts:12, 76`；`compat-op.ts:122-131`）。`faijs-gears` 的齿轮对/轮系正是用它声明逐件输出（见 §3.4）。

### 2.6 调用执行：命名空间成员访问

注册完成后，脚本里的 `cq.box(...)` / `gears.spurGear(...)` 在 DirectExecutor 中经 `__ns.<binding>.<callee>(...)` 调用（`cad-runtime/direct-executor.ts:154, 930`），实参按“库函数签名 = .fai.js 源码形态”的约定传入。

至此，两条链闭合：

```
CadQuery .py ──transpile──▶ .fai.js ──parse──▶ import 元数据
                                              │
                                   autoLoadLibsFromImports
                                              │
                        libLoader.loadLib ──▶ registerLib ──▶（按需 compatOp 提升）
                                              │
                                    脚本执行 __ns.<binding>.<callee>
                                              │
                                      输出收编为 faijs Shape ──▶ BREP/STEP 导出
```

---

## 3. faijs-gears 实现分析

`faijs-gears` 是本仓 API 兼容层之外的**独立齿轮扩展库**：把 CadQuery 的 `cq_gears`（直齿/斜齿/人字/齿条/蜗杆/锥齿/行星轮系等）逐字移植到 faijs。包名 `@faicad/faijs-gears`，v0.30.4。

### 3.1 定位与依赖

`faijs-gears/package.json`：

- `peerDependencies`: `@faicad/faijs`、`occt-wasm`；`dependencies` 为空；
- devDependencies 用 `file:../core` / `file:../cq-compat-compare` 走 monorepo 源码，发布后由 peer 提供。

它对 `@faicad/faijs-cadquery` **没有依赖**：早期齿轮原语层曾住在本仓（`packages/faijs-cadquery` 的 kernel 层），2026-10-02 迁到 `faijs-gears/src/kernel/`，本仓不再导出（见 `src/index.ts:294-297` 注释）。

### 3.2 三块结构：公共 API / 数学 / 原始内核原语

```
faijs-gears/src/
  index.ts            公共 API（15 个齿轮工厂 + contractVersion）
  profile.ts          纯数学：齿廓与齿面点阵（不碰内核）
  math.ts             向量/几何工具
  spur_gear.ts …      各齿轮的实体构造（齿面 → sew → solid）
  spline-face.ts      齿面建面策略
  features.ts         bore / hub / spokes / chamfer 等特征
  kernel/
    index.ts          内核原语导出
    gears.ts          原始 occt-wasm 能力面（getGearKernel 单例）
```

**数学与内核严格分离**：`profile.ts` 头部明确“只做纯数学，不碰内核”（`profile.ts:4`），输出点集可与 Python 侧逐点比对（`profile.test.ts`）。

### 3.3 kernel 层：唯一的 occt-wasm 访问点

齿轮齿面是 B-spline 补片（由 (u,v) 点阵构成）再缝合，普通 `Workplane` op 不暴露这些原语，因此需要裸内核能力。

- `getGearKernel()`（`kernel/gears.ts:106-111`）内部 `initOcctWasm()`，进程级**单例**：句柄是同一内核 arena 的索引，绝不能跨实例。
- `GearKernel` 类型（`kernel/gears.ts:35-93`）在 `BrepEngineApi` 之上声明本移植实际消费的方法（`bsplineSurface` / `approximatePoints` / `interpolatePoints` / `sew` / `makeSolid` / `healWire` / `loft` 等）。
- 硬约束：**faijs-gears 只从 `kernel/` 导入，不得直接触碰 occt-wasm**（`kernel/gears.ts:9-11`）。probe 测试会断言每个方法在活内核上存在，内核升级改名时立即变红，而不是运行期 `undefined is not a function`。

### 3.4 公共 API：参数逐字沿用 + `Promise<Result>` + `fn.outputs`

`index.ts` 的每个导出函数（`faijs-gears/src/index.ts:81-319`）遵循统一形态：

- **参数名逐字沿用 Python**：`module` / `teeth_number` / `width` / `helix_angle` / `pressure_angle` …（`profile.ts:7-9, 31-41`），使 `regression_test_cases.json` 零转换直接喂入。
- **统一执行包装 `run()`**（`index.ts:63-70`）：`await getGearKernel()` 后在 `try/catch` 里跑构建，成功 `ok(...)`、失败 `err(message)`，返回 `Promise<Result<T, string>>`。
- **单体齿轮**返回 `BrepHandle`（如 `spurGear`，`index.ts:81-85`）；
- **齿轮对 / 轮系**返回**具名记录**并挂 `fn.outputs`：
  ```ts
  ;(bevelGearPair as { outputs?: string[] }).outputs = ['gear', 'pinion']      // index.ts:190
  ;(planetaryGearset as { outputs?: string[] }).outputs = ['sun', 'planets', 'ring'] // index.ts:302
  ```
  这样兼容层（§2.5 的 `adoptOut`）能逐件收编，宿主据此逐件导出 STEP。
- **契约版本**：`export const contractVersion = CONTRACT_VERSION`（`index.ts:52`），使 `registerLib` 严格校验。

**实体构造流程**（以 `spur_gear.ts:1-15` 的注释为准）：

```
① 4 段齿廓 → 4 个齿面（spline-face 三方案可切换）
② 每个齿面绕 Z 旋转 tau*i → z 个齿共 4z 个面
③ 取位于 z=0 / z=width 的边 → 组线 → 成平面盖面（planarCapAtZ，spur_gear.ts:57-82）
④ sew(faces, shell_sewing_tol) → makeSolid(shell)
```

其中 `cq` 的 `Wire.combine(edges, tol)` 在 faijs 侧用 `makeWire + healWire(wire, tol)` 复现，容差沿用同一 `wire_comb_tol`（`spur_gear.ts:13-14, 75`）。所有容差常量逐字保留自 Python（`profile.ts:17-28` 的 `GEAR_BASE_CONSTANTS`）。

### 3.5 如何供 faijs 脚本调用（端到端）

脚本侧（真实示例 `packages/demo/examples/gear-demo.fai.js`）：

```js
import * as gears from '@faicad/faijs-gears'

let g1 = gears.spurGear({ module: 2, teeth_number: 24, width: 8 })
let g2 = gears.spurGear({ module: 2, teeth_number: 12, width: 8 })
let m1 = cad.translate(g2, { offset: [36 * MM, 0 * MM, 0 * MM] })
let u1 = cad.union(g1, m1)
```

运行链路：

1. **解析 import** → 元数据 `{ kind:'namespace', localName:'gears', packageName:'@faicad/faijs-gears' }`（全名，或短名 `faijs-gears`，由 CLI 归一）。
2. **自动装载** → `libLoader.loadLib('@faicad/faijs-gears')` 动态 `import()` 包，拿到命名空间。
3. **注册** → `registerLib('gears', ns, {...})`：
   - `ns.contractVersion === 3` → 通过校验；
   - 未声明 `faijs.autoLift` → 推断 `!hasDualOp(ns) === true` → **提升**；
   - `admitCompatLib` 用 `compatOp` 包裹每个齿轮工厂，`borrow` 取默认 `true`。
4. **调用** `gears.spurGear({...})`：
   - 参数是普通对象（不含 faijs Shape），`borrowDeep` 无实际影响；
   - `compatOp` 内部 await 返回的 `Promise<Result<BrepHandle>>` 并 unwrap；
   - 返回的 `BrepHandle` 经 `adoptEntity` 收编为 faijs `Shape`。
   - 因此脚本里**直接** `let g1 = gears.spurGear({...})` 即可，无需手动 await/`.value`。
5. **下游消费** → `g1` 是 faijs Shape，可被内置 `cad.translate` / `cad.union` 继续组合（如上例），并最终导出 STEP。

对比体验：

| 库 | `package.json` `faijs.autoLift` | 是否经 compatOp 提升 | 脚本侧调用特征 |
|---|---|---|---|
| `@faicad/faijs`（内置 `cad`） | 未声明（有 dual-op） | 否 | 原生 op，`cad.union(g1, m1)` |
| `@faicad/faijs-cadquery` | 显式 `false` | 否 | 函数以 faijs `Workplane`/`Shape` 为受众；调用多为 `async`，产物需 `cq.val(...)` |
| `@faicad/faijs-gears` | 未声明（全裸函数） | **是**（`borrow: true`） | 直接返回 Shape，可被 `cad.*` 消费 |
| `@faicad/sheetmetal` | （faijs 原生，`borrow: false`） | **是**（禁用输入借用） | 直接消费 core Shape |

---

## 4. 关键结论与源码索引

### 4.1 一句话结论

- **翻译**：本仓提供的是**定向** Python→`.fai.js` 转译器（`dump_ast.py` + `transpile.ts`），核心是把 CadQuery 方法链改写为“Workplane 作首参的独立函数调用”，并内联 `math`/`config`、丢弃 import、末尾提取 `cq.val(...)`。
- **库函数调用**：由 `@faicad/faijs` 运行时统一承载——`import` 元数据触发自动装载 → `registerLib` 校验/注册 → 裸函数库经 `compatOp` 提升并收编输出为 faijs Shape。`faijs-gears` 是这条通道的标准范例。

### 4.2 源码索引

**本仓库（faijs-cadquery）**

| 主题 | 位置 |
|---|---|
| Python→AST JSON | `scripts/dump_ast.py:7-25` |
| 取 AST / 读 config.py | `scripts/transpile-file.ts:16-50` |
| 转译入口 / 文件头 import | `src/transpile.ts:94-146` |
| 方法链改写 | `src/transpile.ts:371-535` |
| math / config 内联 | `src/transpile.ts:300-326, 382-397` |
| 函数体 await 规则 | `src/transpile.ts:357-360` |
| 切片 / 列表推导 / 关键字 | `src/transpile.ts:537-623` |
| 独立函数导出面 | `src/index.ts:17-144` |
| `val()` 返回 Shape | `src/workplane.ts:6066` |
| `faijs.autoLift=false` | `package.json:47-49` |
| 镜像脚本样例 | `tests/test_free_functions/test_box__s.fai.js` |

**faijs core（`../faijs/packages/core`）**

| 主题 | 位置 |
|---|---|
| 契约版本 / `assertContractVersion` | `src/runtime-state.ts:116, 132-138` |
| `registerLib` | `src/cad-runtime/runtime.ts:462-486` |
| `hasDualOp` 推断 | `src/define-op.ts:521-524` |
| 自动装载 import | `src/cad-runtime/runtime.ts:1221-1255` |
| `LibLoader` 契约 | `src/cad-runtime/ports.ts:187-212` |
| CLI 短名归一 / autoLift | `src/node-host/cli.ts:51-116` |
| `admitCompatLib` | `src/cad-runtime/admit-compat-lib.ts:65-82` |
| `compatOp` 三步桥 | `src/api/internal/compat-op.ts:83-133` |
| 内置 cad 注册 | `src/cad-runtime/createRuntimeWithCad.ts:24-30` |

**faijs-gears（`../faijs/packages/faijs-gears`）**

| 主题 | 位置 |
|---|---|
| 公共 API / contractVersion | `src/index.ts:52, 63-70, 81-319` |
| `fn.outputs` 多输出 | `src/index.ts:190, 258, 275, 302, 319` |
| 内核单例 / 能力面 | `src/kernel/gears.ts:35-93, 106-111` |
| 参数逐字沿用 / 常量 | `src/profile.ts:7-9, 17-28, 31-41` |
| 实体构造流程 | `src/spur_gear.ts:1-15, 57-82` |
| 脚本调用示例 | `packages/demo/examples/gear-demo.fai.js` |