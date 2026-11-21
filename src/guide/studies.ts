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
  /** Proportional to 1 / fill time (1/s). */
  shearRate: number
  /** Relative viscosity: plastic pressure × fill time (bar·s). */
  viscosity: number
  /** Drop from the previous (slower) point, as a fraction of its viscosity. */
  drop: number | null
  /** Viscosity on the fitted curve at this speed. */
  fitted?: number
  /** Peak pressure is within 5% of the press maximum, so the press could not hold speed. */
  pressureLimited?: boolean
}

export type ViscosityAxis = 'speed' | 'shear'

export interface ViscosityResult {
  points: ViscosityPoint[]
  /** Horizontal axis used for sorting, fitting, and level-off: injection speed or effective shear rate (1/s). */
  xAxis: ViscosityAxis
  /** Slowest speed (or lowest shear rate when xAxis === 'shear') from which viscosity changes by less than the threshold. */
  flatFrom: number | null
  /** When xAxis === 'shear', the corresponding injection speed (mm/s) at `flatFrom`, interpolated from usable points. */
  flatSpeed: number | null
  /** Viscosity = floor + k · x^(−m), when fitting is on and at least four usable points are in. */
  fit: PowerDecayFit | null
  basis: ResultBasis
}

/** Standard relative x multiplier (+50%) used on the fitted curve so row spacing does not move the result. */
export const FIT_SPEED_STEP = 1.5

/** Slowest of `xs` from which every further step changes `values` by less than `threshold` (and doesn't trend upward). */
function levelsOffFrom(xs: number[], values: number[], threshold: number): number | null {
  if (xs.length < 3) return null
  if (values.at(-1)! > values[0]) return null
  let from: number | null = null
  for (let i = xs.length - 2; i >= 0; i--) {
    const drop = (values[i] - values[i + 1]) / values[i]
    if (drop < threshold && drop > -threshold) from = xs[i]
    else break
  }
  return from
}

/**
 * Lowest x in [minX, maxX] where increasing x by FIT_SPEED_STEP (+50%) drops
 * fitted viscosity by less than `threshold`. Independent of how closely the user spaced rows.
 */
function fittedFlatFrom(fit: PowerDecayFit, minX: number, maxX: number, threshold: number): number | null {
  const c = 1 - FIT_SPEED_STEP ** -fit.m
  if (threshold >= c) return minX
  if (!(fit.floor > 0)) return null
  const exact = ((fit.k * (c - threshold)) / (threshold * fit.floor)) ** (1 / fit.m)
  if (!Number.isFinite(exact) || exact > maxX) return null
  const rounded = exact >= 10 ? Math.ceil(exact - 1e-9) : exact >= 1 ? upToTenth(exact) : Math.ceil(exact * 100 - 1e-9) / 100
  return Math.max(minX, Math.min(maxX, rounded))
}

/** Linearly interpolates injection speed at a target shear rate from sorted usable points. */
function speedAtShear(points: ViscosityPoint[], shear: number): number | null {
  if (!points.length) return null
  if (shear <= points[0].shearRate) return points[0].speed
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (shear <= b.shearRate) {
      const span = b.shearRate - a.shearRate
      if (!(span > 0)) return b.speed
      const t = (shear - a.shearRate) / span
      return a.speed + t * (b.speed - a.speed)
    }
  }
  return points.at(-1)!.speed
}

/** Default viscosity change, in percent, below which the curve counts as level. */
export const DEFAULT_FLAT_THRESHOLD = 10

export function viscosityCurve(v: NonNullable<Guide['viscosity']>, maxPressure?: number): ViscosityResult {
  const threshold = (v.threshold ?? DEFAULT_FLAT_THRESHOLD) / 100
  const xAxis: ViscosityAxis = v.xAxis ?? 'speed'
  const xOf = (p: { speed: number; shearRate: number }) => (xAxis === 'shear' ? p.shearRate : p.speed)
  const raw = v.rows
    .filter((r) => finite(r.speed) && finite(r.fillTime) && finite(r.pressure) && r.fillTime! > 0)
    .map((r) => ({ speed: r.speed!, fillTime: r.fillTime!, shearRate: 1 / r.fillTime!, pressure: r.pressure! * v.ratio }))
    .sort((a, b) => xOf(a) - xOf(b) || a.speed - b.speed)
  const points: ViscosityPoint[] = raw.map((r, i) => {
    const viscosity = r.pressure * r.fillTime
    const prev = i > 0 ? raw[i - 1].pressure * raw[i - 1].fillTime : null
    const pressureLimited = maxPressure !== undefined && r.pressure >= 0.95 * maxPressure
    return { ...r, viscosity, drop: prev === null ? null : (prev - viscosity) / prev, pressureLimited }
  })
  // Exclude pressure-limited points from the fit and level-off check when enough reliable points remain.
  const reliable = points.filter((p) => !p.pressureLimited)
  const active = reliable.length >= 3 ? reliable : points
  const xs = active.map(xOf)
  const fit = v.fit === false || new Set(xs).size < 4 ? null : fitPowerDecay(xs, active.map((p) => p.viscosity))
  // Shear thinning means viscosity falls with speed / shear rate; anything else is not a curve to level off.
  if (fit && fit.r2 >= MIN_FIT_R2 && fit.k > 0) {
    const flatFrom = fittedFlatFrom(fit, xs[0], xs.at(-1)!, threshold)
    return {
      points: points.map((p) => ({ ...p, fitted: fit.predict(xOf(p)) })),
      xAxis,
      flatFrom,
      flatSpeed: flatFrom === null ? null : xAxis === 'shear' ? speedAtShear(active, flatFrom) : flatFrom,
      fit,
      basis: 'fit',
    }
  }
  const flatFrom = levelsOffFrom(xs, active.map((p) => p.viscosity), threshold)
  return {
    points,
    xAxis,
    flatFrom,
    flatSpeed: flatFrom === null ? null : xAxis === 'shear' ? speedAtShear(active, flatFrom) : flatFrom,
    fit,
    basis: 'data',
  }
}

// 2. Cavity balance --------------------------------------------------------------------------

export interface BalanceResult {
  /** Mean fill-only weight per cavity (null where no shots were weighed). */
  means: (number | null)[]
  /** Individual finite fill-only shot weights per cavity. */
  shotsPerCavity: number[][]
  shots: number
  /** (heaviest − lightest) / heaviest × 100. */
  imbalance: number | null
  heaviest: number | null
  lightest: number | null
}

export function cavityBalance(b: NonNullable<Guide['balance']>, cavities: number): BalanceResult {
  const shotsPerCavity = Array.from({ length: cavities }, (_, c) => b.rows.map((r) => r[c]).filter(finite))
  const means = shotsPerCavity.map((v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null))
  const known = means.flatMap((m, c) => (m === null ? [] : [{ m, c }]))
  if (known.length < 2) return { means, shotsPerCavity, shots: 0, imbalance: null, heaviest: null, lightest: null }
  const hi = known.reduce((a, x) => (x.m > a.m ? x : a))
  const lo = known.reduce((a, x) => (x.m < a.m ? x : a))
  return {
    means,
    shotsPerCavity,
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
  /** True when a later segment has a lower cumulative pressure than the one before it. */
  nonIncreasing: boolean
}

export function pressureDrop(p: NonNullable<Guide['pressureDrop']>, maxPressure: number | undefined): PressureDropResult {
  const rows = p.rows.filter((r) => finite(r.pressure)).map((r) => ({ segment: r.segment, pressure: r.pressure! * p.ratio }))
  const segments = rows.map((r, i) => ({ ...r, drop: r.pressure - (i > 0 ? rows[i - 1].pressure : 0) }))
  const last = segments.at(-1)?.pressure
  const usage = last !== undefined && maxPressure ? last / maxPressure : null
  const nonIncreasing = segments.some((s, i) => i > 0 && s.drop < 0)
  return { segments, usage, verdict: usage === null ? null : usage >= 0.9 ? 'limited' : usage >= 0.8 ? 'tight' : 'ok', nonIncreasing }
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
  const n = points.length
  // Anchor at the last point within tolerance of the maximum so slight downward noise at the end doesn't shift seal time.
  let end = n - 1
  while (end > 0 && points[end].weight < max - tol) end--
  let idx = end
  while (idx > 0 && points[idx - 1].weight >= max - tol) idx--
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
  /** True when a spec is given and even the shortest cooling time tested was already inside spec. */
  unbracketed: boolean
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
  if (points.length < 3) return { points, shortest: null, basis: null, fit: null, source: 'data', predicted: null, unbracketed: false }
  const hasSpec = c.specLow !== undefined || c.specHigh !== undefined
  const basis = hasSpec ? 'spec' : 'stable'
  const fit = c.fit === false || new Set(points.map((p) => p.time)).size < 4 ? null : fitPlateau(points.map((p) => p.time), points.map((p) => p.value))
  if (fit && fit.r2 >= MIN_FIT_R2 && fit.tau > 0 && fit.gap !== 0) {
    const exact = fittedShortest(fit, c, hasSpec)
    const t = exact === null ? null : upToTenth(exact)
    const last = points.at(-1)!.time
    if (t === null) return { points, shortest: null, basis, fit, source: 'fit', predicted: null, unbracketed: false }
    if (t > last) return { points, shortest: null, basis, fit, source: 'fit', predicted: t, unbracketed: false }
    const unbracketed = hasSpec && exact !== null && exact <= points[0].time + 1e-9
    return { points, shortest: t, basis, fit, source: 'fit', predicted: null, unbracketed }
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
  const shortest = idx < points.length ? points[idx].time : null
  return { points, shortest, basis, fit, source: 'data', predicted: null, unbracketed: hasSpec && idx === 0 }
}

// 6. Process window --------------------------------------------------------------------------

export interface WindowResult {
  good: { temp: number; hold: number }[]
  bad: { temp: number; hold: number; outcome: string }[]
  /** Largest defect-free box of good settings: the process window, and a starting point for DOE ranges. */
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
  const ts = [...new Set(good.map((g) => g.temp))].sort((a, b) => a - b)
  const hs = [...new Set(good.map((g) => g.hold))].sort((a, b) => a - b)
  if (ts.length < 2 || hs.length < 2) return none
  const full: Box = { temp: [ts[0], ts.at(-1)!], hold: [hs[0], hs.at(-1)!] }
  if (!bad.some((b) => inside(b, full))) return { good, bad, temp: full.temp, hold: full.hold, trimmed: false }

  // Exact search over all defect-free rectangles spanned by good settings: maximizes enclosed good
  // points, breaking ties by largest normalized area and then closeness to the good-point centroid.
  const tSpan = full.temp[1] - full.temp[0]
  const hSpan = full.hold[1] - full.hold[0]
  const meanT = good.reduce((a, g) => a + g.temp, 0) / good.length
  const meanH = good.reduce((a, g) => a + g.hold, 0) / good.length
  let best: { box: Box; count: number; area: number; dist: number } | null = null
  for (let i1 = 0; i1 < ts.length; i1++) {
    for (let i2 = i1 + 1; i2 < ts.length; i2++) {
      for (let j1 = 0; j1 < hs.length; j1++) {
        for (let j2 = j1 + 1; j2 < hs.length; j2++) {
          const box: Box = { temp: [ts[i1], ts[i2]], hold: [hs[j1], hs[j2]] }
          if (bad.some((b) => inside(b, box))) continue
          const count = good.filter((g) => inside(g, box)).length
          const area = ((ts[i2] - ts[i1]) / tSpan) * ((hs[j2] - hs[j1]) / hSpan)
          const dist = Math.hypot(((ts[i1] + ts[i2]) / 2 - meanT) / tSpan, ((hs[j1] + hs[j2]) / 2 - meanH) / hSpan)
          if (
            !best ||
            count > best.count ||
            (count === best.count && (area > best.area + 1e-9 || (Math.abs(area - best.area) <= 1e-9 && dist < best.dist - 1e-9)))
          ) {
            best = { box, count, area, dist }
          }
        }
      }
    }
  }
  if (!best) return { ...none, trimmed: true }
  return { good, bad, temp: best.box.temp, hold: best.box.hold, trimmed: true }
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
      return viscosityCurve(guide!.viscosity!, maxPressure).points.length >= 3 ? 'done' : 'open'
    case 'balance':
      return cavityBalance(guide!.balance!, cavities).imbalance !== null ? 'done' : 'open'
    case 'pressureDrop':
      return pressureDrop(guide!.pressureDrop!, maxPressure).segments.length >= 2 ? 'done' : 'open'
    case 'gateSeal':
      return gateSeal(guide!.gateSeal!).points.length >= 3 ? 'done' : 'open'
    case 'cooling':
      return coolingTime(guide!.cooling!).points.length >= 3 ? 'done' : 'open'
    case 'window':
      return processWindow(guide!.window!).good.length >= 2 ? 'done' : 'open'
  }
}
