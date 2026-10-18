import { describe, expect, it } from 'vitest'
import { fSurvival, incompleteBeta, lnGamma, normalCdf, normalQuantile, tCdf, tQuantile, tTwoSidedP } from './distributions'

// Reference values from standard statistical tables (and R: qt, pt, pf, qnorm).
describe('distributions', () => {
  it('lnGamma matches factorials', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 12)
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 12)
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12)
  })

  it('incomplete beta has the right symmetry and endpoints', () => {
    expect(incompleteBeta(0.5, 3, 3)).toBeCloseTo(0.5, 12)
    expect(incompleteBeta(0.3, 2, 5) + incompleteBeta(0.7, 5, 2)).toBeCloseTo(1, 12)
    expect(incompleteBeta(0.2, 1, 1)).toBeCloseTo(0.2, 12)
  })

  it('t quantiles match tables', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228138852, 8)
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.70620474, 6)
    expect(tQuantile(0.95, 30)).toBeCloseTo(1.697260887, 8)
    expect(tQuantile(0.025, 5)).toBeCloseTo(-2.570581836, 8)
    expect(tCdf(tQuantile(0.9, 7), 7)).toBeCloseTo(0.9, 10)
  })

  it('two-sided t p-values', () => {
    expect(tTwoSidedP(2.228138852, 10)).toBeCloseTo(0.05, 8)
    expect(tTwoSidedP(0, 10)).toBeCloseTo(1, 12)
  })

  it('F upper tail matches critical values', () => {
    expect(fSurvival(4.964602701, 1, 10)).toBeCloseTo(0.05, 8)
    expect(fSurvival(3.325834530, 5, 10)).toBeCloseTo(0.05, 8)
    expect(fSurvival(10.04428927, 1, 10)).toBeCloseTo(0.01, 8)
    expect(fSurvival(0, 3, 4)).toBe(1)
  })

  it('normal CDF and quantile', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963985, 8)
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12)
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232306, 7)
    expect(normalCdf(1.959963985)).toBeCloseTo(0.975, 6)
  })
})
