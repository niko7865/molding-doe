import { describe, expect, it } from 'vitest'
import { fractionalFactorialDesign } from '../designs/fractional'
import { fullFactorial } from '../designs/fullFactorial'
import { fitModel } from './fit'
import { factorialTerms, standardTerms, termName } from './terms'

describe('fitModel', () => {
  it('drops terms aliased in a fractional factorial', () => {
    const x = fractionalFactorialDesign(4, ['D=ABC']).points.map((p) => p.coded)
    const y = x.map((r) => 10 + 3 * r[0] - 2 * r[1] + r[0] * r[1])
    const fit = fitModel({ x, y, terms: standardTerms(4, 'interactions') })
    // AB=CD, AC=BD, AD=BC: the later member of each pair is dropped.
    expect(fit.terms.map((t) => termName(t))).toEqual(['A', 'B', 'C', 'D', 'AB', 'AC', 'AD'])
    expect(fit.aliased.map((t) => termName(t))).toEqual(['BC', 'BD', 'CD'])
    expect(fit.coefficients.find((c) => c.name === 'AB')!.estimate).toBeCloseTo(1, 12)
  })

  it('separates a block effect from the factor effects', () => {
    const base = fullFactorial(3)
    const blocks = base.map((r) => (r[0] * r[1] * r[2] > 0 ? 2 : 1))
    // Block 2 reads 5 units high; factors have effects 4 (A) and -6 (B).
    const y = base.map((r, i) => 50 + 2 * r[0] - 3 * r[1] + (blocks[i] === 2 ? 5 : 0))
    const fit = fitModel({ x: base, y, terms: standardTerms(3, 'linear'), blocks })
    expect(fit.coefficients.find((c) => c.name === 'A')!.effect).toBeCloseTo(4, 12)
    expect(fit.coefficients.find((c) => c.name === 'B')!.effect).toBeCloseTo(-6, 12)
    expect(fit.anova.blocks!.ss).toBeCloseTo(50, 9)
    expect(fit.anova.residual.ss).toBeCloseTo(0, 9)
    // Predictions are at the average block.
    expect(fit.predict([0, 0, 0]).fit).toBeCloseTo(52.5, 9)
  })

  it('reports diagnostics that add up', () => {
    const base = fullFactorial(2)
    const x = [...base, ...base, [0, 0], [0, 0]]
    const y = [10, 14, 11, 16, 10.4, 13.6, 11.2, 15.8, 12.6, 13.1]
    const fit = fitModel({ x, y, terms: factorialTerms(2) })
    const sum = fit.residuals.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(0, 9)
    expect(fit.leverage.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 9) // trace of the hat matrix = p
    expect(fit.predRSquared).not.toBeNull()
    expect(fit.predRSquared!).toBeLessThan(fit.rSquared)
    expect(fit.cooks.every((c) => c !== null && c >= 0)).toBe(true)
  })
})
