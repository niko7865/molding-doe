/** Probability distributions needed for ANOVA, t tests, intervals and normal plots. */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betaContinuedFraction(a, b, x)) / a
  return 1 - (Math.exp(lnFront) * betaContinuedFraction(b, a, 1 - x)) / b
}

/** P(T > t) for Student's t with df degrees of freedom, two-sided: P(|T| > |t|). */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0
  return incompleteBeta(df / (df + t * t), df / 2, 0.5)
}

export function tCdf(t: number, df: number): number {
  const tail = tTwoSidedP(t, df) / 2
  return t >= 0 ? 1 - tail : tail
}

/** Upper-tail probability P(F > f) for the F distribution. */
export function fSurvival(f: number, df1: number, df2: number): number {
  if (f <= 0) return 1
  if (!Number.isFinite(f)) return 0
  return incompleteBeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2)
}

function erfc(x: number): number {
  // Chebyshev fit (Numerical Recipes erfcc), fractional error < 1.2e-7: ample for plots and p-values.
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2)
}

/** Inverse standard normal CDF (Acklam's algorithm, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - plow) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Quantile of Student's t: the value t with P(T ≤ t) = p. */
export function tQuantile(p: number, df: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p < 0.5) return -tQuantile(1 - p, df)
  // Bracket and bisect on the monotone CDF; 200 halvings is far below double precision.
  let lo = 0
  let hi = Math.max(1, normalQuantile(p) * 2)
  while (tCdf(hi, df) < p) hi *= 2
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
