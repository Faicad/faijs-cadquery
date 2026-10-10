// source: test_cad_objects.py::TestCadObjects::testCompoundCenter (var s)
// s = Workplane("XY").rect(2.0, 3.0, forConstruction=True).vertices()
//       .cyl(0.25, 0.5)
// where `cyl` is a one-off plugin:
//   def cylinders(self, radius, height):
//       c = Solid.makeCylinder(radius, height, Vector())
//       return self.eachpoint(lambda loc: c.located(loc), True).union()
// So: a 0.25-radius / 0.5-high cylinder (z 0..0.5, i.e. makeCylinder is NOT
// z-centred) placed at each of the four rect vertices and fused. The `.fai.js`
// subset has no function literals, so the lambda cannot be mirrored — the
// eachpoint OBJECT form (`eachpoint(vertices, cylinder, {combine:true})`) is
// the faithful equivalent and exercises the real op.
// ref anchor: vol=0.39269908169872403 (=4*pi*0.25^2*0.5), com (0,0,0.25), f12/e12/v8
import * as cq from '@faicad/faijs-cadquery'
let s = cq.Workplane('XY')
let w = cq.rect(s, 2.0, 3.0, { forConstruction: true })
let v = cq.vertices(w)
let cyl = await cq.cylinder(cq.Workplane(), 0.5, 0.25, { centered: [true, true, false] })
let r = await cq.eachpoint(v, cyl, { combine: true })
let result = cq.val(r)
