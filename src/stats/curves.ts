/**
 * Nonlinear least-squares fits for the molding studies.
 *
 * Every model here is linear in all but one parameter (θ), so each fit searches θ and solves the
 * linear parameters exactly at every step (variable projection). That needs no starting guess and
 * cannot wander off the way a general solver can on a handful of noisy points.
 */

export interface CurveFit {
  /** Linear coefficients for the basis at the best θ. */
  coef: number[]
  theta: number
  /** Coefficient of determination on the original y scale. */
  r2: number
  /** Residual standard deviation (n − p degrees of freedom). */
  se: number
  predict: (x: number) => number
}

/** Least squares for y ≈ Σ coef·basis(x); null when the basis columns are degenerate. */
function linearFit(xs: number[], ys: number[], basis: (x: number) => number[]): { coef: number[]; sse: number } | null {
  const rows = xs.map(basis)
  const p = rows[0].length
  // Normal equations; p is at most 2 here, so solve directly.
  const a = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)))
  const b = Array.from({ length: p }, (_, i) => rows.reduce((s, r, k) => s + r[i] * ys[k], 0))
  let coef: number[]
  if (p === 1) {
    if (!(Math.abs(a[0][0]) > 1e-300)) return null
    coef = [b[0] / a[0][0]]
  } else {
    const det = a[0][0] * a[1][1] - a[0][1] * a[1][0]
    if (!(Math.abs(det) > 1e-12 * Math.abs(a[0][0] * a[1][1]))) return null
    coef = [(b[0] * a[1][1] - b[1] * a[0][1]) / det, (a[0][0] * b[1] - a[1][0] * b[0]) / det]
  }
  const sse = rows.reduce((s, r, k) => s + (ys[k] - r.reduce((t, v, i) => t + v * coef[i], 0)) ** 2, 0)
  return Number.isFinite(sse) ? { coef, sse } : null
}

/**
 * Fits y ≈ Σ coef·basis(θ, x), searching θ over [lo, hi] on a grid then refining with golden section.
 * `log` searches θ on a log scale (for positive θ such as a time constant).
 */
export function fitSeparable(
  xs: number[],
  ys: number[],
  basis: (theta: number, x: number) => number[],
  range: [number, number],
  log = false,
): CurveFit | null {
  const n = xs.length
  if (n < 3 || n !== ys.length) return null
  const to = (u: number) => (log ? Math.exp(u) : u)
  const [ulo, uhi] = log ? [Math.log(range[0]), Math.log(range[1])] : range
  const sseAt = (u: number) => linearFit(xs, ys, (x) => basis(to(u), x))?.sse ?? Infinity
  const steps = 200
  let best = 0
  let bestSse = Infinity
  const grid = Array.from({ length: steps + 1 }, (_, i) => ulo + ((uhi - ulo) * i) / steps)
  grid.forEach((u, i) => {
    const s = sseAt(u)
    if (s < bestSse) [best, bestSse] = [i, s]
  })
  if (!Number.isFinite(bestSse)) return null
  // Golden section on the bracket around the best grid point.
  let a = grid[Math.max(0, best - 1)]
  let b = grid[Math.min(steps, best + 1)]
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = sseAt(c)
  let fd = sseAt(d)
  for (let i = 0; i < 60; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - g * (b - a)
      fc = sseAt(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + g * (b - a)
      fd = sseAt(d)
    }
  }
  const u = fc < fd ? c : d
  const theta = to(u)
  const lin = linearFit(xs, ys, (x) => basis(theta, x))
  if (!lin) return null
  const mean = ys.reduce((s, y) => s + y, 0) / n
  const sst = ys.reduce((s, y) => s + (y - mean) ** 2, 0)
  const p = lin.coef.length + 1
  const predict = (x: number) => basis(theta, x).reduce((s, v, i) => s + v * lin.coef[i], 0)
  return {
    coef: lin.coef,
    theta,
    r2: sst > 0 ? 1 - lin.sse / sst : 1,
    se: n > p ? Math.sqrt(lin.sse / (n - p)) : 0,
    predict,
  }
}

/**
 * y = floor + k · x^(−m) (x > 0, m > 0 for a falling curve). Power-law shear thinning that levels
 * off at `floor`: relative viscosity against injection speed.
 */
export interface PowerDecayFit extends CurveFit {
  floor: number
  k: number
  m: number
}

export function fitPowerDecay(xs: number[], ys: number[]): PowerDecayFit | null {
  if (xs.length < 4 || xs.some((x) => !(x > 0))) return null
  // Scale x so x^(−m) stays near 1 whatever the speed units.
  const ref = Math.max(...xs)
  const f = fitSeparable(xs, ys, (m, x) => [1, (x / ref) ** -m], [0.02, 6], true)
  return f && { ...f, floor: f.coef[0], k: f.coef[1] * ref ** f.theta, m: f.theta }
}

/**
 * Gate freeze-off: the frozen layer in the gate grows with √t and closes it at t_f; until then
 * melt keeps packing in at a rate that falls with the square of the open gap. Integrated, the part
 * weight is y = sealed − c · t_f · (w³/3 − w⁴/4) with w = 1 − √(min(t, t_f)/t_f), flat from t_f on.
 * Unlike an exponential it has a sharp knee and does not overshoot the sealed weight.
 */
export interface FreezeFit extends CurveFit {
  sealed: number
  c: number
  /** Time the gate closes completely. */
  tf: number
}

const freezeShape = (tf: number, t: number) => {
  const w = 1 - Math.sqrt(Math.min(Math.max(t, 0), tf) / tf)
  return tf * (w ** 3 / 3 - w ** 4 / 4)
}

export function fitGateFreeze(xs: number[], ys: number[]): FreezeFit | null {
  if (xs.length < 4 || xs.some((x) => x < 0)) return null
  const last = Math.max(...xs)
  if (!(last > 0)) return null
  const f = fitSeparable(xs, ys, (tf, t) => [1, -freezeShape(tf, t)], [last / 50, last * 20], true)
  return f && { ...f, sealed: f.coef[0], c: f.coef[1], tf: f.theta }
}

/** First time at which a freeze fit is within `tol` of its sealed weight. */
export function freezeWithin(f: FreezeFit, tol: number): number {
  if (f.c * freezeShape(f.tf, 0) <= tol) return 0
  let [lo, hi] = [0, f.tf]
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f.c * freezeShape(f.tf, mid) > tol) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * y = plateau − gap · e^(−(x − x0)/τ), x0 the first x. Exponential approach to a plateau: rising
 * when gap > 0, falling when gap < 0; gap is the fitted distance from the plateau at x0.
 */
export interface PlateauFit extends CurveFit {
  plateau: number
  gap: number
  tau: number
  x0: number
}

export function fitPlateau(xs: number[], ys: number[]): PlateauFit | null {
  if (xs.length < 4) return null
  const lo = Math.min(...xs)
  const span = Math.max(...xs) - lo
  if (!(span > 0)) return null
  // Shift x so the basis stays well scaled whatever the time origin.
  const f = fitSeparable(xs, ys, (tau, x) => [1, -Math.exp(-(x - lo) / tau)], [span / 100, span * 20], true)
  if (!f) return null
  return { ...f, plateau: f.coef[0], gap: f.coef[1], tau: f.theta, x0: lo }
}

/** Points along a fitted curve for drawing. */
export function sampleCurve(predict: (x: number) => number, from: number, to: number, n = 60): { x: number; y: number }[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / n
    return { x, y: predict(x) }
  })
}
