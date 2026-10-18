/** Turning raw per-cavity entries into the values a model is fitted to. */

export interface CavitySummary {
  mean: number | null
  /** Sample standard deviation across cavities; null with fewer than two values. */
  sd: number | null
  count: number
}

export function summarizeCavities(values: (number | null)[]): CavitySummary {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x))
  const n = v.length
  if (n === 0) return { mean: null, sd: null, count: 0 }
  const mean = v.reduce((a, b) => a + b, 0) / n
  if (n < 2) return { mean, sd: null, count: n }
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1))
  return { mean, sd, count: n }
}

/** Fraction defective from a count of bad shots out of the shots inspected. */
export function fractionDefective(defective: number, shots: number): number {
  if (shots <= 0) throw new Error('Shots inspected must be positive')
  return Math.min(1, Math.max(0, defective / shots))
}

/**
 * True when a defect response never varies (always 0 or always the same rating), in which case
 * a model can't learn anything from it and the analysis should say so.
 */
export function isAllOrNothing(values: number[]): boolean {
  return values.length > 0 && values.every((v) => v === values[0])
}

/** Actual value ↔ coded value, where low → −1 and high → +1. */
export function toCoded(value: number, low: number, high: number): number {
  return (2 * value - (low + high)) / (high - low)
}

export function fromCoded(coded: number, low: number, high: number): number {
  return (low + high) / 2 + (coded * (high - low)) / 2
}
