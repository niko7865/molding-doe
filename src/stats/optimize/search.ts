import { seededRandom } from '../rng'
import { desirability, overallDesirability, shortfall, type ResponseGoal } from './desirability'

export interface Region {
  /** Coded [min, max] per factor: the tested range, normally [-1, 1] or [-α, α]. */
  bounds: [number, number][]
  /** Optional spherical limit in coded units (rotatable CCDs are only supported inside radius α). */
  radius?: number
}

export interface OptimizeInput {
  /** One predictor per response, taking coded factor settings. */
  predict: ((x: number[]) => number)[]
  goals: ResponseGoal[]
  region: Region
  /** Coded value to hold a factor at, or null to let it vary. */
  fixed?: (number | null)[]
  seed?: number
}

export interface OptimumResult {
  x: number[]
  desirability: number
  individual: number[]
  predicted: number[]
}

function project(x: number[], region: Region, fixed: (number | null)[]): number[] {
  let p = x.map((v, j) => fixed[j] ?? Math.min(region.bounds[j][1], Math.max(region.bounds[j][0], v)))
  if (region.radius !== undefined) {
    const free = p.map((v, j) => (fixed[j] === null ? v : 0))
    const fixedNorm2 = p.reduce((a, v, j) => a + (fixed[j] === null ? 0 : v * v), 0)
    const room = Math.sqrt(Math.max(0, region.radius ** 2 - fixedNorm2))
    const norm = Math.sqrt(free.reduce((a, v) => a + v * v, 0))
    if (norm > room && norm > 0) p = p.map((v, j) => (fixed[j] === null ? (v * room) / norm : v))
  }
  return p
}

/** Nelder–Mead simplex maximizing f, with every vertex projected into the region. */
function nelderMead(f: (x: number[]) => number, start: number[], step: number, proj: (x: number[]) => number[], iterations = 300): number[] {
  const n = start.length
  let simplex = [start, ...Array.from({ length: n }, (_, i) => proj(start.map((v, j) => (j === i ? v + (v + step > 1 ? -step : step) : v))))]
  let values = simplex.map(f)
  for (let it = 0; it < iterations; it++) {
    const idx = values.map((_, i) => i).sort((a, b) => values[b] - values[a])
    simplex = idx.map((i) => simplex[i])
    values = idx.map((i) => values[i])
    if (Math.abs(values[0] - values[n]) < 1e-10 && it > 20) break
    const centroid = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((a, p) => a + p[j], 0) / n)
    const move = (t: number) => proj(centroid.map((c, j) => c + t * (simplex[n][j] - c)))
    const reflected = move(-1)
    const fr = f(reflected)
    if (fr > values[0]) {
      const expanded = move(-2)
      const fe = f(expanded)
      ;[simplex[n], values[n]] = fe > fr ? [expanded, fe] : [reflected, fr]
    } else if (fr > values[n - 1]) {
      ;[simplex[n], values[n]] = [reflected, fr]
    } else {
      const contracted = move(0.5)
      const fc = f(contracted)
      if (fc > values[n]) {
        ;[simplex[n], values[n]] = [contracted, fc]
      } else {
        simplex = simplex.map((p, i) => (i === 0 ? p : proj(p.map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])))))
        values = simplex.map(f)
      }
    }
  }
  return simplex[values.indexOf(Math.max(...values))]
}

/**
 * Finds the factor settings with the highest overall desirability inside the tested region:
 * a coarse grid and random starts, then Nelder–Mead from the best few. Deterministic for a given seed.
 */
export function optimize(input: OptimizeInput): OptimumResult {
  const k = input.region.bounds.length
  const fixed = input.fixed ?? new Array(k).fill(null)
  const proj = (x: number[]) => project(x, input.region, fixed)
  const evaluate = (x: number[]) => {
    const predicted = input.predict.map((p) => p(x))
    const individual = predicted.map((y, i) => desirability(y, input.goals[i]))
    return { predicted, individual, desirability: overallDesirability(individual, input.goals) }
  }
  // Where nothing is acceptable yet, climb toward acceptability instead of staring at a flat zero.
  const score = (x: number[]) => {
    const e = evaluate(x)
    if (e.desirability > 0) return e.desirability
    return -e.predicted.reduce((a, y, i) => a + shortfall(y, input.goals[i]), 0)
  }

  const free = [...Array(k).keys()].filter((j) => fixed[j] === null)
  const levels = free.length <= 4 ? 5 : free.length <= 6 ? 3 : 2
  const starts: number[][] = []
  const total = levels ** free.length
  for (let i = 0; i < total && starts.length < 5000; i++) {
    const x = new Array(k).fill(0)
    let r = i
    for (const j of free) {
      const [lo, hi] = input.region.bounds[j]
      x[j] = lo + ((r % levels) / (levels - 1)) * (hi - lo)
      r = Math.floor(r / levels)
    }
    starts.push(proj(x))
  }
  const random = seededRandom(input.seed ?? 1)
  for (let i = 0; i < 30; i++) starts.push(proj(input.region.bounds.map(([lo, hi]) => lo + random() * (hi - lo))))

  const best = starts
    .map((x) => ({ x, s: score(x) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
  let winner = best[0].x
  let winnerScore = best[0].s
  for (const { x } of best) {
    const refined = free.length ? nelderMead(score, x, 0.25, proj) : x
    const s = score(refined)
    if (s > winnerScore) {
      winner = refined
      winnerScore = s
    }
  }
  return { x: winner, ...evaluate(winner) }
}
