import { fractionalFactorialDesign } from './fractional'
import { fullFactorial } from './fullFactorial'
import type { BaseDesign } from './types'

/**
 * rotatable: α = (factorial runs)^¼, so prediction variance depends only on distance from the center.
 * face-centered: α = 1, so every point stays inside the low/high box (useful when the levels are hard limits).
 */
export type AlphaKind = 'rotatable' | 'face-centered'

/** Factorial portion: full for k ≤ 4, a resolution V or better half fraction for k = 5, 6. */
function factorialPortion(k: number): number[][] {
  if (k <= 4) return fullFactorial(k)
  if (k === 5) return fractionalFactorialDesign(5, ['E=ABCD']).points.map((p) => p.coded)
  if (k === 6) return fractionalFactorialDesign(6, ['F=ABCDE']).points.map((p) => p.coded)
  throw new Error('Central composite designs are available for 2 to 6 factors')
}

export function centralCompositeDesign(k: number, alphaKind: AlphaKind = 'rotatable'): BaseDesign {
  if (k < 2) throw new Error('Central composite designs need at least 2 factors')
  const factorial = factorialPortion(k)
  const alpha = alphaKind === 'face-centered' ? 1 : Math.pow(factorial.length, 0.25)
  const points: BaseDesign['points'] = factorial.map((coded) => ({ coded, kind: 'factorial' }))
  for (let j = 0; j < k; j++) {
    for (const s of [-1, 1]) {
      const coded = new Array(k).fill(0)
      coded[j] = s * alpha
      points.push({ coded, kind: 'axial' })
    }
  }
  return { type: 'central-composite', k, points, alpha, generators: k === 5 ? ['E=ABCD'] : k === 6 ? ['F=ABCDE'] : undefined }
}
