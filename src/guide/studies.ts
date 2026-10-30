import type { Guide } from '../study/schema'

/**
 * The six scientific molding studies. Each returns plain numbers plus a suggestion; all advisory.
 * Inputs and outputs are metric; the UI converts for display.
 */

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

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
}

export interface ViscosityResult {
  points: ViscosityPoint[]
  /** Slowest speed from which every further step changes viscosity by less than the threshold. */
  flatFrom: number | null
}

export const FLAT_THRESHOLD = 0.1

export function viscosityCurve(v: NonNullable<Guide['viscosity']>): ViscosityResult {
  const raw = v.rows
    .filter((r) => finite(r.speed) && finite(r.fillTime) && finite(r.pressure) && r.fillTime! > 0)
    .map((r) => ({ speed: r.speed!, fillTime: r.fillTime!, pressure: r.pressure! * v.ratio }))
    .sort((a, b) => a.speed - b.speed)
  const points: ViscosityPoint[] = raw.map((r, i) => {
    const viscosity = r.pressure * r.fillTime
    const prev = i > 0 ? raw[i - 1].pressure * raw[i - 1].fillTime : null
    return { ...r, shearRate: 1 / r.fillTime, viscosity, drop: prev === null ? null : (prev - viscosity) / prev }
  })
  let flatFrom: number | null = null
  if (points.length >= 3) {
    for (let i = points.length - 2; i >= 0; i--) {
      if (Math.abs(points[i + 1].drop!) < FLAT_THRESHOLD) flatFrom = points[i].speed
      else break
    }
  }
  return { points, flatFrom }
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
}

/** Default weight change, in percent of the maximum, within which the gate counts as sealed. */
export const DEFAULT_SEAL_TOLERANCE = 0.1

export function gateSeal(g: NonNullable<Guide['gateSeal']>): GateSealResult {
  const points = g.rows
    .filter((r) => finite(r.time) && finite(r.weight))
    .map((r) => ({ time: r.time!, weight: r.weight! }))
    .sort((a, b) => a.time - b.time)
  if (points.length < 3) return { points, sealTime: null, suggested: null, stillRising: false }
  const max = Math.max(...points.map((p) => p.weight))
  const tol = (max * (g.tolerance ?? DEFAULT_SEAL_TOLERANCE)) / 100
  let idx = points.length - 1
  while (idx > 0 && points.slice(idx - 1).every((p) => p.weight >= max - tol)) idx--
  const n = points.length
  const stillRising = idx === n - 1 && points[n - 1].weight - points[n - 2].weight > tol
  if (stillRising) return { points, sealTime: null, suggested: null, stillRising }
  const sealTime = points[idx].time
  return { points, sealTime, suggested: sealTime + Math.max(0.5, sealTime * 0.1), stillRising }
}

// 5. Cooling time ----------------------------------------------------------------------------

export interface CoolingResult {
  points: { time: number; value: number }[]
  /** Shortest cooling time from which every longer time is in spec (or stable without a spec). */
  shortest: number | null
  basis: 'spec' | 'stable' | null
}

export const STABLE_FRACTION = 0.05

export function coolingTime(c: NonNullable<Guide['cooling']>): CoolingResult {
  const points = c.rows
    .filter((r) => finite(r.time) && finite(r.value))
    .map((r) => ({ time: r.time!, value: r.value! }))
    .sort((a, b) => a.time - b.time)
  if (points.length < 3) return { points, shortest: null, basis: null }
  const hasSpec = c.specLow !== undefined || c.specHigh !== undefined
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
  return { points, shortest: idx < points.length ? points[idx].time : null, basis: hasSpec ? 'spec' : 'stable' }
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
