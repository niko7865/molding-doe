/**
 * Derringer–Suich desirability functions. Each response maps to d ∈ [0, 1]; the overall
 * desirability is their importance-weighted geometric mean, so any unacceptable response
 * (d = 0) makes the whole setting unacceptable.
 */
export type Goal =
  | { kind: 'maximize'; low: number; high: number }
  | { kind: 'minimize'; low: number; high: number }
  | { kind: 'target'; low: number; target: number; high: number }
  | { kind: 'none' }

export interface ResponseGoal {
  goal: Goal
  /** Shape: 1 is linear; >1 insists on getting close to the ideal; <1 is easier to satisfy. */
  weight?: number
  /** Relative importance, 1–5. */
  importance?: number
}

export function desirability(y: number, rg: ResponseGoal): number {
  const w = rg.weight ?? 1
  const g = rg.goal
  switch (g.kind) {
    case 'none':
      return 1
    case 'maximize':
      if (y <= g.low) return 0
      if (y >= g.high) return 1
      return ((y - g.low) / (g.high - g.low)) ** w
    case 'minimize':
      if (y >= g.high) return 0
      if (y <= g.low) return 1
      return ((g.high - y) / (g.high - g.low)) ** w
    case 'target':
      if (y < g.low || y > g.high) return 0
      if (y <= g.target) return g.target === g.low ? 1 : ((y - g.low) / (g.target - g.low)) ** w
      return g.high === g.target ? 1 : ((g.high - y) / (g.high - g.target)) ** w
  }
}

/**
 * How far a prediction is from being acceptable, in units of the goal's range; 0 when acceptable.
 * Gives the optimizer a slope to follow where every desirability is 0.
 */
export function shortfall(y: number, rg: ResponseGoal): number {
  const g = rg.goal
  if (g.kind === 'none') return 0
  const span = Math.max(Math.abs(g.high - g.low), 1e-12)
  if (g.kind === 'maximize') return Math.max(0, g.low - y) / span
  if (g.kind === 'minimize') return Math.max(0, y - g.high) / span
  return (Math.max(0, g.low - y) + Math.max(0, y - g.high)) / span
}

export function overallDesirability(ds: number[], goals: ResponseGoal[]): number {
  let sumR = 0
  let logSum = 0
  for (let i = 0; i < ds.length; i++) {
    if (goals[i].goal.kind === 'none') continue
    const r = goals[i].importance ?? 1
    if (ds[i] <= 0) return 0
    sumR += r
    logSum += r * Math.log(ds[i])
  }
  return sumR === 0 ? 1 : Math.exp(logSum / sumR)
}
