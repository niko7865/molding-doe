import { tQuantile } from '../distributions'

export interface ConfirmationResult {
  observedMean: number
  n: number
  /** Interval the mean of n confirmation runs should fall in if the model holds. */
  interval: [number, number]
  inside: boolean
}

/**
 * Checks confirmation runs at a chosen setpoint: the mean of n new observations should fall
 * within ŷ ± t·√(MSE·(1/n + h)), where h = x'(X'X)⁻¹x at that setpoint (Montgomery §11.3).
 */
export function confirmationCheck(
  predicted: number,
  leverage: number,
  mse: number,
  dfError: number,
  observed: number[],
  confidence = 0.95,
): ConfirmationResult {
  const n = observed.length
  if (n === 0) throw new Error('Enter at least one confirmation result')
  if (dfError < 1) throw new Error('The model has no error degrees of freedom, so it cannot give an interval')
  const mean = observed.reduce((a, b) => a + b, 0) / n
  const half = tQuantile(1 - (1 - confidence) / 2, dfError) * Math.sqrt(mse * (1 / n + leverage))
  const interval: [number, number] = [predicted - half, predicted + half]
  return { observedMean: mean, n, interval, inside: mean >= interval[0] && mean <= interval[1] }
}
