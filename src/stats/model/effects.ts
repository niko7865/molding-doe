import { fSurvival, normalQuantile, tQuantile } from '../distributions'

export interface LenthResult {
  /** Pseudo standard error of the effects. */
  pse: number
  /** Margin of error: effects beyond this are significant individually at level α. */
  me: number
  /** Simultaneous margin of error, controlling for testing all effects at once. */
  sme: number
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Lenth's method (Lenth, 1989) for judging effects in an unreplicated two-level design,
 * where there are no degrees of freedom left for error.
 */
export function lenth(effects: number[], alpha = 0.05): LenthResult {
  const abs = effects.map(Math.abs)
  const s0 = 1.5 * median(abs)
  const trimmed = abs.filter((a) => a < 2.5 * s0)
  const pse = 1.5 * median(trimmed.length ? trimmed : abs)
  const m = effects.length
  const d = m / 3
  const me = tQuantile(1 - alpha / 2, d) * pse
  const gamma = (1 + Math.pow(1 - alpha, 1 / m)) / 2
  const sme = tQuantile(gamma, d) * pse
  return { pse, me, sme }
}

export interface PlotPoint {
  value: number
  /** Theoretical normal (or half-normal) quantile for this rank. */
  quantile: number
  index: number
}

/** Half-normal plot positions for |effects|, smallest first. */
export function halfNormalPoints(effects: number[]): PlotPoint[] {
  const m = effects.length
  return effects
    .map((e, index) => ({ value: Math.abs(e), index }))
    .sort((a, b) => a.value - b.value)
    .map((pt, i) => ({ ...pt, quantile: normalQuantile(0.5 + (0.5 * (i + 1 - 0.5)) / m) }))
}

/** Normal probability plot positions (Blom-style (i − ½)/n), smallest first. */
export function normalPoints(values: number[]): PlotPoint[] {
  const n = values.length
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value)
    .map((pt, i) => ({ ...pt, quantile: normalQuantile((i + 1 - 0.5) / n) }))
}

export interface CurvatureTest {
  factorialMean: number
  centerMean: number
  ss: number
  /** F against pure error from the center points; null with fewer than two centers. */
  f: number | null
  p: number | null
  dfError: number
}

/**
 * Single-degree-of-freedom test for curvature in a two-level design with center points
 * (Montgomery §6.8): compares the factorial-point average with the center average.
 */
export function curvatureTest(factorial: number[], center: number[]): CurvatureTest | null {
  const nf = factorial.length
  const nc = center.length
  if (!nf || !nc) return null
  const yf = factorial.reduce((a, b) => a + b, 0) / nf
  const yc = center.reduce((a, b) => a + b, 0) / nc
  const ss = (nf * nc * (yf - yc) ** 2) / (nf + nc)
  const dfError = nc - 1
  if (dfError < 1) return { factorialMean: yf, centerMean: yc, ss, f: null, p: null, dfError }
  const msPe = center.reduce((a, v) => a + (v - yc) ** 2, 0) / dfError
  const f = msPe > 0 ? ss / msPe : null
  return { factorialMean: yf, centerMean: yc, ss, f, p: f === null ? null : fSurvival(f, 1, dfError), dfError }
}
