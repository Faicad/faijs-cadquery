// Experiment: replicate CQ solver.py's exact parameterization for
// test_unary_constraints (b2 only; b1 locked) and run LM to full convergence.
// CQ: variables T (3), R (3, m-parameterization); final quat = map(R + R0),
// map((a,b,c)) = (2a/(1+m), 2b/(1+m), 2c/(1+m), (1-m)/(1+m)), m = a²+b²+c².
// R0 = (0,0,0) (b2 loc has no rotation), T0 = (0,0,4).
// Costs: FixedPoint → point_cost val=0 (3 comps, /scale);
//        FixedAxis  → axis_cost  val=0 (3 comps, d1-d2);
//        penalty 1e-16 · sumsqr(T/scale, R).

const T0 = [0, 0, 4]
const WORLD_P = [0, 0, -3]
const WORLD_D = normalize([0, 1, 1])
const LOCAL_D = [0, 0, 1] // b2 >Z face normal (local)

function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n]
}
// m-parameterization (a,b,c) → quaternion (x,y,z,w) — exact CQ formula
function mapQuat(r) {
  const m = r[0] * r[0] + r[1] * r[1] + r[2] * r[2]
  return [2 * r[0] / (m + 1), 2 * r[1] / (m + 1), 2 * r[2] / (m + 1), (1 - m) / (m + 1)]
}
function quatToMat(q) {
  const [x, y, z, w] = q
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ]
}
function rotDir(R, d) {
  return [
    R[0] * d[0] + R[1] * d[1] + R[2] * d[2],
    R[3] * d[0] + R[4] * d[1] + R[5] * d[2],
    R[6] * d[0] + R[7] * d[1] + R[8] * d[2],
  ]
}

function residuals(x, scale) {
  const T = [x[0], x[1], x[2]]
  const R = [x[3], x[4], x[5]]
  const q = mapQuat(R)
  const M = quatToMat(q)
  // point cost: (Transform(b2 center local (0,0,0)) - world)/scale
  const pa = rotDir(M, [0, 0, 0]).map((v, i) => v + T0[i] + T[i])
  const r0 = [(pa[0] - WORLD_P[0]) / scale, (pa[1] - WORLD_P[1]) / scale, (pa[2] - WORLD_P[2]) / scale]
  // axis cost val=0: d1 - d2
  const d1 = rotDir(M, LOCAL_D)
  const r1 = [d1[0] - WORLD_D[0], d1[1] - WORLD_D[1], d1[2] - WORLD_D[2]]
  // penalty
  const r2 = [
    (1e-8) * T[0] / scale, (1e-8) * T[1] / scale, (1e-8) * T[2] / scale,
    (1e-8) * R[0], (1e-8) * R[1], (1e-8) * R[2],
  ]
  return [...r0, ...r1, ...r2]
}

function lmSolve(scale) {
  const x = [0, 0, 0, 1e-2, 1e-2, 1e-2]
  let lambda = 1e-3
  const evalR = (xx) => residuals(xx, scale)
  let r = evalR(x)
  const objOf = (rr) => 0.5 * rr.reduce((s, v) => s + v * v, 0)
  let obj = objOf(r)
  for (let iter = 0; iter < 200000; iter++) {
    const m = r.length
    const n = 6
    // numerical Jacobian (central diff)
    const J = new Array(m * n).fill(0)
    for (let c = 0; c < n; c++) {
      const h = 1e-7
      const xp = x.slice(); xp[c] += h
      const xm = x.slice(); xm[c] -= h
      const rp = evalR(xp); const rm = evalR(xm)
      for (let row = 0; row < m; row++) J[row * n + c] = (rp[row] - rm[row]) / (2 * h)
    }
    // JtJ + lambda*diag, solve via Gaussian elimination
    const JtJ = Array.from({ length: n * n }, () => 0)
    const Jtr = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0
        for (let k = 0; k < m; k++) s += J[k * n + i] * J[k * n + j]
        JtJ[i * n + j] = s
      }
      let s2 = 0
      for (let k = 0; k < m; k++) s2 += J[k * n + i] * r[k]
      Jtr[i] = s2
    }
    for (let i = 0; i < n; i++) JtJ[i * n + i] *= (1 + lambda)
    // solve JtJ step = -Jtr
    const A = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => JtJ[i * n + j]), -Jtr[i]])
    for (let col = 0; col < n; col++) {
      let piv = col
      for (let rr2 = col + 1; rr2 < n; rr2++) if (Math.abs(A[rr2][col]) > Math.abs(A[piv][col])) piv = rr2
      ;[A[col], A[piv]] = [A[piv], A[col]]
      const d = A[col][col]
      for (let j = col; j <= n; j++) A[col][j] /= d
      for (let rr2 = 0; rr2 < n; rr2++) {
        if (rr2 === col) continue
        const f = A[rr2][col]
        for (let j = col; j <= n; j++) A[rr2][j] -= f * A[col][j]
      }
    }
    const step = A.map((row) => row[n])
    const xTry = x.map((v, i) => v + step[i])
    const rTry = evalR(xTry)
    const objTry = objOf(rTry)
    if (objTry < obj) {
      x.splice(0, 6, ...xTry)
      r = rTry
      obj = objTry
      lambda = Math.max(lambda / 3, 1e-14)
    } else {
      lambda *= 4
      if (lambda > 1e10) break
    }
    // no step-tolerance early stop: drive to the true penalized minimum
  }
  return { x, obj, q: mapQuat([x[3], x[4], x[5]]), T: [T0[0] + x[0], T0[1] + x[1], T0[2] + x[2]], m: x[3] ** 2 + x[4] ** 2 + x[5] ** 2 }
}

const CQ_QUAT = [-0.382542979, 0.010367196, 0.025028625, 0.923540448]
for (const scale of [1, 5]) {
  const res = lmSolve(scale)
  const dq = res.q.map((v, i) => v - CQ_QUAT[i])
  console.log(`scale=${scale} obj=${res.obj.toExponential(2)}`)
  console.log('  quat   ', res.q.map((v) => v.toFixed(9)).join(', '))
  console.log('  d(CQ)  ', dq.map((v) => v.toExponential(2)).join(', '))
  console.log('  T final', res.T.map((v) => v.toFixed(9)).join(', '))
}
