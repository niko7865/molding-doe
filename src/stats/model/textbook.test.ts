/**
 * Worked examples from Montgomery, Design and Analysis of Experiments (8th ed.).
 * These pin the engine to published results, not to its own output.
 */
import { describe, expect, it } from 'vitest'
import { fullFactorial } from '../designs/fullFactorial'
import { curvatureTest, lenth } from './effects'
import { fitModel } from './fit'
import { factorialTerms, standardTerms, termName } from './terms'

// Example 6.1, plasma etch: A = gap, B = gas flow, C = RF power, two replicates, standard order.
const ETCH = [
  [550, 604],
  [669, 650],
  [633, 601],
  [642, 635],
  [1037, 1052],
  [749, 868],
  [1075, 1063],
  [729, 860],
]

// Example 6.2, filtration rate: unreplicated 2^4, standard order.
const FILTRATION = [45, 71, 48, 65, 68, 60, 80, 65, 43, 100, 45, 104, 75, 86, 70, 96]

describe('Montgomery Example 6.1 (plasma etch 2^3, n = 2)', () => {
  const base = fullFactorial(3)
  const x = [...base, ...base]
  const y = [...ETCH.map((r) => r[0]), ...ETCH.map((r) => r[1])]
  const fit = fitModel({ x, y, terms: factorialTerms(3) })
  const effect = (name: string) => fit.coefficients.find((c) => c.name === name)!.effect!

  it('estimates the effects', () => {
    expect(effect('A')).toBeCloseTo(-101.625, 9)
    expect(effect('B')).toBeCloseTo(7.375, 9)
    expect(effect('C')).toBeCloseTo(306.125, 9)
    expect(effect('AC')).toBeCloseTo(-153.625, 9)
  })

  it('reproduces the ANOVA', () => {
    const ss = (name: string) => fit.anova.terms.find((r) => r.source === name)!.ss
    expect(ss('A')).toBeCloseTo(41310.5625, 6)
    expect(ss('C')).toBeCloseTo(374850.0625, 6)
    expect(ss('AC')).toBeCloseTo(94402.5625, 6)
    expect(fit.anova.residual.ss).toBeCloseTo(18020.5, 6)
    expect(fit.anova.residual.df).toBe(8)
    expect(fit.anova.total.ss).toBeCloseTo(531420.9375, 6)
    const a = fit.anova.terms.find((r) => r.source === 'A')!
    expect(a.f).toBeCloseTo(18.34, 2)
    expect(a.p).toBeCloseTo(0.0027, 4)
  })

  it('has pure error equal to the residual for the full model', () => {
    expect(fit.anova.lackOfFit).toBeNull()
  })
})

describe('Montgomery Example 6.2 (filtration rate, unreplicated 2^4)', () => {
  const x = fullFactorial(4)
  const full = fitModel({ x, y: FILTRATION, terms: factorialTerms(4) })
  const effects = full.coefficients.filter((c) => c.term).map((c) => [termName(c.term!), c.effect!] as const)
  const effect = Object.fromEntries(effects)

  it('estimates all fifteen effects with no error degrees of freedom', () => {
    expect(full.dfError).toBe(0)
    expect(full.mse).toBeNull()
    expect(full.coefficients[0].estimate).toBeCloseTo(70.0625, 9)
    expect(effect.A).toBeCloseTo(21.625, 9)
    expect(effect.B).toBeCloseTo(3.125, 9)
    expect(effect.C).toBeCloseTo(9.875, 9)
    expect(effect.D).toBeCloseTo(14.625, 9)
    expect(effect.AC).toBeCloseTo(-18.125, 9)
    expect(effect.AD).toBeCloseTo(16.625, 9)
    expect(effect.ABCD).toBeCloseTo(1.375, 9)
  })

  it("flags the same effects as Lenth's method", () => {
    const l = lenth(effects.map((e) => e[1]))
    expect(l.pse).toBeCloseTo(2.625, 9)
    expect(l.me).toBeCloseTo(6.748, 3)
    expect(l.sme).toBeGreaterThan(l.me)
    const active = effects.filter(([, e]) => Math.abs(e) > l.me).map(([n]) => n)
    expect(active.sort()).toEqual(['A', 'AC', 'AD', 'C', 'D'])
  })

  it('fits the reduced model A, C, D, AC, AD', () => {
    const terms = factorialTerms(4).filter((t) => ['A', 'C', 'D', 'AC', 'AD'].includes(termName(t)))
    const fit = fitModel({ x, y: FILTRATION, terms })
    expect(fit.anova.residual.ss).toBeCloseTo(195.125, 6)
    expect(fit.anova.total.ss).toBeCloseTo(5730.9375, 6)
    expect(fit.dfError).toBe(10)
    expect(fit.rSquared).toBeCloseTo(0.96594, 4)
    expect(fit.adjRSquared).toBeCloseTo(0.94891, 4)
    const ss = Object.fromEntries(fit.anova.terms.map((r) => [r.source, r.ss]))
    expect(ss.A).toBeCloseTo(1870.5625, 6)
    expect(ss.C).toBeCloseTo(390.0625, 6)
    expect(ss.D).toBeCloseTo(855.5625, 6)
    expect(ss.AC).toBeCloseTo(1314.0625, 6)
    expect(ss.AD).toBeCloseTo(1105.5625, 6)
    // Every run has distinct settings of all four factors, so there is no pure error.
    expect(fit.anova.pureError).toBeNull()
  })
})

describe('Montgomery Example 6.6 (curvature test, 2^2 with 5 center points)', () => {
  it('finds no curvature', () => {
    const c = curvatureTest([39.3, 40.9, 40.0, 41.5], [40.3, 40.5, 40.7, 40.2, 40.6])!
    expect(c.factorialMean).toBeCloseTo(40.425, 9)
    expect(c.centerMean).toBeCloseTo(40.46, 9)
    expect(c.ss).toBeCloseTo(0.0027, 4)
    expect(c.dfError).toBe(4)
    expect(c.f).toBeCloseTo(0.0027 / 0.043, 2)
    expect(c.p!).toBeGreaterThan(0.5)
  })
})

describe('Montgomery Example 11.2 (CCD, chemical process yield)', () => {
  const a = Math.SQRT2
  const x = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
    [a, 0], [-a, 0], [0, a], [0, -a],
  ]
  const y = [76.5, 77.0, 78.0, 79.5, 79.9, 80.3, 80.0, 79.7, 79.8, 78.4, 75.6, 78.5, 77.0]
  const fit = fitModel({ x, y, terms: standardTerms(2, 'quadratic') })
  const coef = Object.fromEntries(fit.coefficients.map((c) => [c.name, c.estimate]))

  it('fits the second-order model', () => {
    expect(coef.Intercept).toBeCloseTo(79.94, 2)
    expect(coef.A).toBeCloseTo(0.995, 2)
    expect(coef.B).toBeCloseTo(0.515, 2)
    expect(coef['A²']).toBeCloseTo(-1.376, 2)
    expect(coef['B²']).toBeCloseTo(-1.001, 2)
    expect(coef.AB).toBeCloseTo(0.25, 9)
  })

  it('separates lack of fit from pure error', () => {
    expect(fit.anova.pureError?.df).toBe(4)
    expect(fit.anova.lackOfFit?.df).toBe(3)
    // Pure error is the spread of the five center runs around their mean of 79.94.
    expect(fit.anova.pureError?.ss).toBeCloseTo(0.212, 6)
  })

  it('predicts with intervals that widen for new observations', () => {
    const p = fit.predict([0.389, 0.306])
    expect(p.fit).toBeCloseTo(80.21, 1)
    expect(p.pi![1] - p.pi![0]).toBeGreaterThan(p.ci![1] - p.ci![0])
  })
})
