/**
 * 一次性诊断：dump STEP 装配的 XCAF 树（roots / assembly / component / prototype /
 * subshape），确认 CadQuery 导出的具名子形状是否进了 XCAF。
 * 用法：npx tsx scripts/probe-subshape-dump.mts <fixture.step>
 */
import { readFileSync } from 'node:fs'
import { initOcctWasm } from '@faicad/faijs/occt-kernel/occtKernel'
import type { XCAFDocument, LabelTag } from 'occt-wasm'

const path = process.argv[2]
if (!path) {
  console.error('usage: probe-subshape-dump.mts <fixture.step>')
  process.exit(2)
}

const buffer = readFileSync(path)
const stepText = new TextDecoder().decode(new Uint8Array(buffer))

const rawKernel = (await initOcctWasm()) as unknown as {
  importXCAFFromSTEP(stepData: string): XCAFDocument
}
const doc = rawKernel.importXCAFFromSTEP(stepText)

function dump(label: LabelTag, depth: number): void {
  const info = doc.getLabelInfo(label)
  const pad = '  '.repeat(depth)
  const shape = info.shapeHandle ? 'shape=yes' : 'shape=no'
  const color = info.hasColor ? `color=[${info.color.join(',')}]` : 'color=no'
  console.log(
    `${pad}L${info.labelId} name=${JSON.stringify(info.name)} isAssembly=${info.isAssembly} ${shape} ${color}`,
  )
  if (info.isAssembly) {
    for (const child of doc.getChildren(label)) dump(child, depth + 1)
    return
  }
  const proto = doc.getReferredLabel(label)
  if (proto != null) {
    const pInfo = doc.getLabelInfo(proto)
    console.log(
      `${pad}  ->proto L${pInfo.labelId} name=${JSON.stringify(pInfo.name)} isAssembly=${pInfo.isAssembly} ` +
        `shape=${pInfo.shapeHandle ? 'yes' : 'no'}`,
    )
    const subs = doc.getSubShapes(proto)
    console.log(`${pad}  ->proto getSubShapes count=${subs.length}`)
    for (const sub of subs) {
      const sInfo = doc.getLabelInfo(sub)
      const sColor = sInfo.hasColor ? `color=[${sInfo.color.join(',')}]` : 'color=no'
      console.log(
        `${pad}    sub L${sInfo.labelId} name=${JSON.stringify(sInfo.name)} ` +
          `shape=${sInfo.shapeHandle ? 'yes' : 'no'} ${sColor}`,
      )
    }
  } else {
    const subs = doc.getSubShapes(label)
    console.log(`${pad}  (no proto) getSubShapes count=${subs.length}`)
    for (const sub of subs) {
      const sInfo = doc.getLabelInfo(sub)
      const sColor = sInfo.hasColor ? `color=[${sInfo.color.join(',')}]` : 'color=no'
      console.log(
        `${pad}    sub L${sInfo.labelId} name=${JSON.stringify(sInfo.name)} ` +
          `shape=${sInfo.shapeHandle ? 'yes' : 'no'} ${sColor}`,
      )
    }
  }
  // also dump direct children of this label (component may carry subshape children)
  const kids = doc.getChildren(label)
  if (kids.length) {
    console.log(`${pad}  directChildren=${kids.length}`)
    for (const k of kids) dump(k, depth + 1)
  }
}

const roots = doc.getRoots()
console.log(`ROOTS=${roots.length}`)
for (const r of roots) dump(r, 0)

doc.close()
