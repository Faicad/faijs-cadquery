// source: test_free_functions.py::test_text (var r7)
// r7 = text("CQ", 1, spine)
//
// The free-function SPINE overload (`occ_impl/shapes.py:6772`), which cq-compat
// exposes as `textOnSpine` (the flat overload keeps the `text` name, mirroring
// the Workplane method it is transliterated from):
//
//   spine = _get_one_wire(spine)         -> must resolve to exactly ONE edge
//   L     = spine.Length()
//   for el in text(txt, size, font, ...).Faces():
//       pos = el.BoundingBox().center.x  -> the glyph box centre in string space
//       el.moved(-pos).moved(rx=-90 if planar else 0, ry=-90)
//         .moved(spine.locationAt(pos / L))
//   _normalize(compound(rv))             -> a single glyph unwraps to the face
//
// `pos` is NEGATIVE for a glyph that sits left of the string origin (here the
// "C" of "CQ"), so `pos / L` is a negative normalised distance and the frame is
// evaluated on a parameter BELOW `first` — see `src/spine-frame.ts`.
//
// `font` is spelled out even though upstream omits it (its default is Arial,
// resolved through OCC's font manager); cq-compat falls back to the engine's
// bundled face when no font is named, and naming it is what makes the two agree.
// Upstream's `halign`/`valign` default to "center", which is also our default.
//
// PARITY STATUS: this mirror is manifest-pinned `blocked` with
// `blockedBy: comparator:open-shell-volume`, NOT because anything is missing but
// because the comparator cannot grade a 2-D result — see the long note in
// tests/mark-blocked.ts. Measured against the ref: bbox 5.5e-13, every face
// normal identical, glyph area exact (the ref STEP is OCC's coarsened outline,
// f2/e12/v12 vs our f2/e49/v49, so it reads `PASS-NT` topologically and `FAIL`
// on the open-shell volume probe). See tests/compare-one.mjs output in the
// roadmap's N4 record.
//
// The `spine` is `cylinder(10, 10).moved(rz=180).edges("<Z")` — see
// test_text__c.fai.js for the free `cylinder(d, h)` → `(height, radius)` note.
import * as cq from '@faicad/faijs-cadquery'
let cylinder0 = await cq.cylinder(cq.Workplane('XY'), 10, 5, { centered: [true, true, false] })
let turned = await cq.rotate(cylinder0, [0, 0, 1], 180)
let spine = cq.val(cq.edges(turned, '<Z'))
let result = await cq.textOnSpine('CQ', 1, spine, { font: 'Arial' })
