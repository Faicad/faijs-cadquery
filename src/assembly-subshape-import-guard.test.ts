/**
 * importStep: 具名子形状回读 —— **冻结守卫（P5-1 捕获推翻 → blocked）**。
 *
 * 计划 §3.1 A 组原假设：occt-wasm XCAF `getSubShapes` + `getLabelInfo.name/hasColor`
 * 能从 STEP 回读 CadQuery `Assembly.addSubshape` 注册的 face/wire（name + color）。
 *
 * 一次性捕获（2026-10-06）**推翻**该假设，实证如下：
 *  1. 夹具 `fixtures/data/step-metadata/cq-subshape-assy.step` 由 CadQuery 2.8.0
 *     `Assembly.addSubshape` + `export()` 生成；`grep` STEP 文本确认子形状名
 *     （`cube_1_top_face` / `cylinder_bottom_face` / `cylinder_bottom_wire` / `2_faces`）
 *     **确实写进了 STEP 文件**（作为 representation-item name）。
 *  2. 但 occt-wasm 5.6 `importXCAFFromSTEP` 读回后，子形状标签的
 *     `getLabelInfo(sub).name` 全为空、`hasColor` 全为 false（XCAF 树 dump 见
 *     `scripts/probe-subshape-dump.mts`：cube_1 原型 1 条子形状、cyl_1 原型 2 条，
 *     均 name=""、color=no）。component/product 名能读、subshape 名读不到。
 *  3. **上游 CadQuery 2.8.0 自身 `Assembly.importStep`（classmethod）读回同一 STEP
 *     也只有 `name="top_level"`、`members=[]`、`_subshape_names={}`** —— 子形状名/色
 *     经 STEP 往返后连上游都读不回。属 occt-wasm reader 不把 representation-item 名
 *     映射到 subshape 标签 `TDataStd_Name` 的缺口，与 P5-3 layer 同类。
 *
 * ⇒ P5-1 的子形状 name/color 经 STEP 回读在 occt-wasm 5.6 **不可行**。本守卫冻结
 * 当前行为（`asm.subshapes === {}`），并保留成员名/色往返作为 import 路径回归；
 * 待 occt-wasm 暴露 subshape 名/色读通道（或 reader 修正）后，此守卫应翻红、提示
 * 解锁 `op:assembly-subshape-import` 4 条 manifest。
 *
 * 真值夹具：`scripts/probe-subshape-import.py`（不进 CI）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setupNativeKernel } from './gear-test-harness'
import { importStep } from './assembly/save'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): string =>
  resolve(here, '../fixtures/data/step-metadata', name)

beforeAll(async () => {
  await setupNativeKernel()
})

describe('importStep: named subshape read-back is NOT available via STEP (P5-1 guard)', () => {
  it('import path still round-trips member name/color (regression guard)', async () => {
    const asm = await importStep(fixture('cq-subshape-assy.step'))
    expect(asm.name).toBe('top_level')
    expect(asm.members.map((m) => m.name).sort()).toEqual(['cube_1', 'cyl_1'])
    const byName = Object.fromEntries(asm.members.map((m) => [m.name, m.color]))
    // cube_1 green, cyl_1 blue（线性 RGB，与上游一致）
    expect(byName.cube_1).toEqual([0, 1, 0])
    expect(byName.cyl_1).toEqual([0, 0, 1])
  })

  it('subshape name/color read-back is frozen as unavailable (capture-refuted, occt-wasm 5.6)', async () => {
    const asm = await importStep(fixture('cq-subshape-assy.step'))
    // 子形状名/色经 STEP 往返后连上游 CadQuery 2.8.0 都读不回 —— 冻结为空。
    // 一旦 occt-wasm 暴露 subshape 名/色读通道，此断言应翻红、提示解锁 P5-1。
    expect(asm.subshapes).toEqual({})
  })
})
