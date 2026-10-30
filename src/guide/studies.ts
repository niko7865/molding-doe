import { fitGateFreeze, fitPlateau, fitPowerDecay, freezeWithin, type FreezeFit, type PlateauFit, type PowerDecayFit } from '../stats/curves'
import type { Guide } from '../study/schema'

/**
 * The six scientific molding studies. Each returns plain numbers plus a suggestion; all advisory.
 * Inputs and outputs are metric; the UI converts for display.
 */

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** Below this R² a fit is shown but the result falls back to the raw points. */
export const MIN_FIT_R2 = 0.9

/** Fitted times are rounded up to the 0.1 s a press is set in, which errs on the safe side. */
const upToTenth = (t: number) => Math.ceil(t * 10 - 1e-9) / 10

/** Where a study's result came from: the fitted curve, or the measured points step by step. */
export type ResultBasis = 'fit' | 'data'

// 1. Viscosity curve -------------------------------------------------------------------------

export interface ViscosityPoint {
  speed: number
  fillTime: number
  /** Plastic pressure, bar. */
  pressure: number
  /** Proportional to 1 / fill time. */
  shearRate: number
  /** Relative viscosity: plastic pressure × fill time (bar·s). */
  viscosity: number
  /** Drop from the previous (slower) point, as a fraction of its viscosity. */
  drop: number | null
  /** Viscosity on the fitted curve at this speed. */
  fitted?: number
}

export interface ViscosityResult {
  points: ViscosityPoint[]
  /** Slowest speed from which every further step changes viscosity by less than the threshold. */
  flatFrom: number | null
  /** Viscosity = floor + k · speed^(−m), when fitting is on and at least four speeds are in. */
  fit: PowerDecayFit | null
  basis: ResultBasis
}

/** Slowest of `speeds` from which every further step changes `values` by less than `threshold`. */
function levelsOffFrom(speeds: number[], values: number[], threshold: number): number | null {
  if (speeds.length < 3) return null
  let from: number | null = null
  for (let i = speeds.length - 2; i >= 0; i--) {
    if (Math.abs((values[i] - values[i + 1]) / values[i]) < threshold) from = speeds[i]
    else break
  }
  return from
}

/** Default step-to-step viscosity change, in percent, below which the curve counts as level. */
export const DEFAULT_FLAT_THRESHOLD = 10

export function viscosityCurve(v: NonNullable<Guide['viscosity']>): ViscosityResult {
  const threshold = (v.threshold ?? DEFAULT_FLAT_THRESHOLD) / 100
  const raw = v.rows
    .filter((r) => finite(r.speed) && finite(r.fillTime) && finite(r.pressure) && r.fillTime! > 0)
    .map((r) => ({ speed: r.speed!, fillTime: r.fillTime!, pressure: r.pressure! * v.ratio }))
    .sort((a, b) => a.speed - b.speed)
  const points: ViscosityPoint[] = raw.map((r, i) => {
    const viscosity = r.pressure * r.fillTime
    const prev = i > 0 ? raw[i - 1].pressure * raw[i - 1].fillTime : null
    return { ...r, shearRate: 1 / r.fillTime, viscosity, drop: prev === null ? null : (prev - viscosity) / prev }
  })
  const speeds = points.map((p) => p.speed)
  const fit = v.fit === false || new Set(speeds).size < 4 ? null : fitPowerDecay(speeds, points.map((p) => p.viscosity))
  // Shear thinning means viscosity falls with speed; anything else is not a curve to level off.
  if (fit && fit.r2 >= MIN_FIT_R2 && fit.k > 0) {
    const fitted = speeds.map(fit.predict)
    return { points: points.map((p, i) => ({ ...p, fitted: fitted[i] })), flatFrom: levelsOffFrom(speeds, fitted, threshold), fit, basis: 'fit' }
  }
  return { points, flatFrom: levelsOffFrom(speeds, points.map((p) => p.viscosity), threshold), fit, basis: 'data' }
}

// 2. Cavity balance --------------------------------------------------------------------------

export interface BalanceResult {
  /** Mean fill-only weight per cavity (null where no shots were weighed). */
  means: (number | null)[]
  shots: number
  /** (heaviest − lightest) / heaviest × 100. */
  imbalance: number | null
  heaviest: number | null
  lightest: number | null
}

export function cavityBalance(b: NonNullable<Guide['balance']>, cavities: number): BalanceResult {
  const means = Array.from({ length: cavities }, (_, c) => {
    const v = b.rows.map((r) => r[c]).filter(finite)
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null
  })
  const known = means.flatMap((m, c) => (m === null ? [] : [{ m, c }]))
  if (known.length < 2) return { means, shots: 0, imbalance: null, heaviest: null, lightest: null }
  const hi = known.reduce((a, x) => (x.m > a.m ? x : a))
  const lo = known.reduce((a, x) => (x.m < a.m ? x : a))
  return {
    means,
    shots: b.rows.filter((r) => r.some(finite)).length,
    imbalance: hi.m > 0 ? ((hi.m - lo.m) / hi.m) * 100 : null,
    heaviest: hi.c,
    lightest: lo.c,
  }
}

/** Default allowable cavity imbalance, in percent. */
export const DEFAULT_ALLOWABLE_IMBALANCE = 5

/** Good within the allowable imbalance, poor beyond twice it. */
export function balanceVerdict(imbalance: number, allowable = DEFAULT_ALLOWABLE_IMBALANCE): 'good' | 'watch' | 'poor' {
  return imbalance <= allowable ? 'good' : imbalance <= 2 * allowable ? 'watch' : 'poor'
}

// 3. Pressure drop ---------------------------------------------------------------------------

export interface PressureDropResult {
  segments: { segment: string; pressure: number; drop: number }[]
  /** Last segment's pressure as a fraction of the press maximum. */
  usage: number | null
  verdict: 'ok' | 'tight' | 'limited' | null
}

export function pressureDrop(p: NonNullable<Guide['pressureDrop']>, maxPressure: number | undefined): PressureDropResult {
  const rows = p.rows.filter((r) => finite(r.pressure)).map((r) => ({ segment: r.segment, pressure: r.pressure! * p.ratio }))
  const segments = rows.map((r, i) => ({ ...r, drop: r.pressure - (i > 0 ? rows[i - 1].pressure : 0) }))
  const last = segments.at(-1)?.pressure
  const usage = last !== undefined && maxPressure ? last / maxPressure : null
  return { segments, usage, verdict: usage === null ? null : usage >= 0.9 ? 'limited' : usage >= 0.8 ? 'tight' : 'ok' }
}

// 4. Gate seal -------------------------------------------------------------------------------

export interface GateSealResult {
  points: { time: number; weight: number }[]
  /** First hold time after which the weight stays within the tolerance of its maximum. */
  sealTime: number | null
  /** Seal time plus a margin of 10% (at least 0.5 s). */
  suggested: number | null
  /** The weight was still rising at the longest hold time tested. */
  stillRising: boolean
  /** Gate freeze-off curve, when fitting is on and at least four hold times are in. */
  fit: FreezeFit | null
  basis: ResultBasis
  /** Seal time the fit predicts beyond the longest hold time tested. */
  predicted: number | null
}

/** Default weight change, in percent of the maximum, within which the gate counts as sealed. */
export const DEFAULT_SEAL_TOLERANCE = 0.1

export function gateSeal(g: NonNullable<Guide['gateSeal']>): GateSealResult {
  const points = g.rows
    .filter((r) => finite(r.time) && finite(r.weight))
    .map((r) => ({ time: r.time!, weight: r.weight! }))
    .sort((a, b) => a.time - b.time)
  const none = { sealTime: null, suggested: null, stillRising: false, fit: null, basis: 'data' as const, predicted: null }
  if (points.length < 3) return { points, ...none }
  const fraction = (g.tolerance ?? DEFAULT_SEAL_TOLERANCE) / 100
  const withMargin = (t: number) => upToTenth(t + Math.max(0.5, t * 0.1))
  const fit = g.fit === false || new Set(points.map((p) => p.time)).size < 4 ? null : fitGateFreeze(points.map((p) => p.time), points.map((p) => p.weight))
  if (fit && fit.r2 >= MIN_FIT_R2 && fit.c > 0) {
    // Sealed once the fitted weight is within the tolerance of the sealed weight.
    const t = upToTenth(Math.max(points[0].time, freezeWithin(fit, fit.sealed * fraction)))
    const last = points.at(-1)!.time
    if (t > last) return { points, ...none, stillRising: true, fit, basis: 'fit', predicted: t }
    return { points, sealTime: t, suggested: withMargin(t), stillRising: false, fit, basis: 'fit', predicted: null }
  }
  const max = Math.max(...points.map((p) => p.weight))
  const tol = max * fraction
  let idx = points.length - 1
  while (idx > 0 && points.slice(idx - 1).every((p) => p.weight >= max - tol)) idx--
  const n = points.length
  const stillRising = idx === n - 1 && points[n - 1].weight - points[n - 2].weight > tol
  if (stillRising) return { points, ...none, stillRising, fit }
  const sealTime = points[idx].time
  return { points, ...none, sealTime, suggested: withMargin(sealTime), fit }
}

// 5. Cooling time ----------------------------------------------------------------------------

export interface CoolingResult {
  points: { time: number; value: number }[]
  /** Shortest cooling time from which every longer time is in spec (or stable without a spec). */
  shortest: number | null
  basis: 'spec' | 'stable' | null
  /** Value = plateau − gap · e^(−(t − t0)/τ), when fitting is on and at least four times are in. */
  fit: PlateauFit | null
  /** Whether `shortest` comes from the fitted curve or the measured points. */
  source: ResultBasis
  /** Shortest time the fit predicts beyond the longest time tested. */
  predicted: number | null
}

/** Settled once within this fraction of the change seen over the times tested. */
export const STABLE_FRACTION = 0.05

/** First time from which the fitted curve stays in spec (or settled); null if it never does. */
function fittedShortest(f: PlateauFit, c: NonNullable<Guide['cooling']>, hasSpec: boolean): number | null {
  // Time at which the remaining gap to the plateau shrinks to `room` (≥ 0).
  const reach = (room: number) => (room <= 0 ? null : Math.abs(f.gap) <= room ? f.x0 : f.x0 + f.tau * Math.log(Math.abs(f.gap) / room))
  if (!hasSpec) return reach(STABLE_FRACTION * Math.abs(f.gap))
  if ((c.specLow !== undefined && f.plateau < c.specLow) || (c.specHigh !== undefined && f.plateau > c.specHigh)) return null
  // Rising curves approach from below, so only the low limit can be broken; falling ones only the high.
  if (f.gap > 0) return c.specLow === undefined ? f.x0 : reach(f.plateau - c.specLow)
  return c.specHigh === undefined ? f.x0 : reach(c.specHigh - f.plateau)
}

export function coolingTime(c: NonNullable<Guide['cooling']>): CoolingResult {
  const points = c.rows
    .filter((r) => finite(r.time) && finite(r.value))
    .map((r) => ({ time: r.time!, value: r.value! }))
    .sort((a, b) => a.time - b.time)
  if (points.length < 3) return { points, shortest: null, basis: null, fit: null, source: 'data', predicted: null }
  const hasSpec = c.specLow !== undefined || c.specHigh !== undefined
  const basis = hasSpec ? 'spec' : 'stable'
  const fit = c.fit === false || new Set(points.map((p) => p.time)).size < 4 ? null : fitPlateau(points.map((p) => p.time), points.map((p) => p.value))
  if (fit && fit.r2 >= MIN_FIT_R2 && fit.tau > 0 && fit.gap !== 0) {
    const exact = fittedShortest(fit, c, hasSpec)
    const t = exact === null ? null : upToTenth(exact)
    const last = points.at(-1)!.time
    if (t === null) return { points, shortest: null, basis, fit, source: 'fit', predicted: null }
    if (t > last) return { points, shortest: null, basis, fit, source: 'fit', predicted: t }
    return { points, shortest: t, basis, fit, source: 'fit', predicted: null }
  }
  const ok = hasSpec
    ? (v: number) => (c.specLow === undefined || v >= c.specLow) && (c.specHigh === undefined || v <= c.specHigh)
    : (() => {
        const values = points.map((p) => p.value)
        const range = Math.max(...values) - Math.min(...values)
        const final = values.at(-1)!
        return (v: number) => Math.abs(v - final) <= STABLE_FRACTION * range
      })()
  let idx = points.length
  while (idx > 0 && ok(points[idx - 1].value)) idx--
  return { points, shortest: idx < points.length ? points[idx].time : null, basis, fit, source: 'data', predicted: null }
}

// 6. Process window --------------------------------------------------------------------------

export interface WindowResult {
  good: { temp: number; hold: number }[]
  bad: { temp: number; hold: number; outcome: string }[]
  /** Box around the good settings, shrunk until no defective setting is inside: the process window, and a starting point for DOE ranges. */
  temp: [number, number] | null
  hold: [number, number] | null
  /** The box had to shrink to leave defects out. */
  trimmed: boolean
}

type Box = { temp: [number, number]; hold: [number, number] }
const inside = (p: { temp: number; hold: number }, b: Box) => p.temp >= b.temp[0] && p.temp <= b.temp[1] && p.hold >= b.hold[0] && p.hold <= b.hold[1]

export function processWindow(w: Pick<NonNullable<Guide['window']>, 'rows'>): WindowResult {
  const rows = w.rows.filter((r) => finite(r.temp) && finite(r.hold)).map((r) => ({ temp: r.temp!, hold: r.hold!, outcome: r.outcome }))
  const good = rows.filter((r) => r.outcome === 'good')
  const bad = rows.filter((r) => r.outcome !== 'good')
  const none = { good, bad, temp: null, hold: null, trimmed: false }
  if (good.length < 2) return none
  let box: Box = {
    temp: [Math.min(...good.map((g) => g.temp)), Math.max(...good.map((g) => g.temp))],
    hold: [Math.min(...good.map((g) => g.hold)), Math.max(...good.map((g) => g.hold))],
  }
  let trimmed = false
  // Pull in the side that loses the fewest good settings until no defect is left inside.
  for (let guard = 0; guard < 100; guard++) {
    const b = bad.find((x) => inside(x, box))
    if (!b) break
    trimmed = true
    const options: Box[] = []
    const temps = good.map((g) => g.temp)
    const holds = good.map((g) => g.hold)
    const above = (v: number[], t: number) => v.filter((x) => x > t)
    const below = (v: number[], t: number) => v.filter((x) => x < t)
    if (above(temps, b.temp).length) options.push({ ...box, temp: [Math.min(...above(temps, b.temp)), box.temp[1]] })
    if (below(temps, b.temp).length) options.push({ ...box, temp: [box.temp[0], Math.max(...below(temps, b.temp))] })
    if (above(holds, b.hold).length) options.push({ ...box, hold: [Math.min(...above(holds, b.hold)), box.hold[1]] })
    if (below(holds, b.hold).length) options.push({ ...box, hold: [box.hold[0], Math.max(...below(holds, b.hold))] })
    const valid = options.filter((o) => o.temp[0] < o.temp[1] && o.hold[0] < o.hold[1])
    if (!valid.length) return { ...none, trimmed }
    const kept = (o: Box) => good.filter((g) => inside(g, o)).length
    box = valid.reduce((a, o) => (kept(o) > kept(a) ? o : a))
  }
  if (box.temp[0] >= box.temp[1] || box.hold[0] >= box.hold[1]) return { ...none, trimmed }
  return { good, bad, temp: box.temp, hold: box.hold, trimmed }
}

// Status -------------------------------------------------------------------------------------

export type GuideKey = keyof Guide
export type GuideStatus = 'done' | 'skipped' | 'open'

/** Done once the study has enough data for its suggestion. */
export function guideStatus(guide: Guide | undefined, key: GuideKey, cavities: number, maxPressure?: number): GuideStatus {
  const g = guide?.[key]
  if (!g) return 'open'
  if (g.skipped) return 'skipped'
  switch (key) {
    case 'viscosity':
      return viscosityCurve(guide!.viscosity!).points.length >= 3 ? 'done' : 'open'
    case 'balance':
      return cavityBalance(guide!.balance!, cavities).imbalance !== null ? 'done' : 'open'
    case 'pressureDrop':
      return pressureDrop(guide!.pressureDrop!, maxPressure).segments.length >= 1 ? 'done' : 'open'
    case 'gateSeal':
      return gateSeal(guide!.gateSeal!).points.length >= 3 ? 'done' : 'open'
    case 'cooling':
      return coolingTime(guide!.cooling!).points.length >= 3 ? 'done' : 'open'
    case 'window':
      return processWindow(guide!.window!).good.length >= 2 ? 'done' : 'open'
  }
}
