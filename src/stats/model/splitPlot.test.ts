import { describe, expect, it } from 'vitest'
import { buildDesign } from '../designs/build'
import { fullFactorialDesign } from '../designs/fullFactorial'
import { fitModel } from './fit'
import { splitPlotAnalysis } from './splitPlot'
import { standardTerms } from './terms'

describe('splitPlotAnalysis', () => {
  // 2^4 with D (mold temperature) hard to change: 4 whole plots of 4 runs.
  const design = buildDesign(fullFactorialDesign(4), {
    centerPoints: 0,
    replicates: 1,
    blocking: { kind: 'none' },
    randomize: true,
    seed: 3,
    hardToChange: [3],
  })
  const x = design.runs.map((r) => r.coded)
  const wholePlots = design.runs.map((r) => r.wholePlot!)
  // Large whole-plot-to-whole-plot variation (mold temp never resets exactly), small run-to-run noise.
  const wpShift: Record<number, number> = { 1: 3, 2: -2.5, 3: 2, 4: -2.5 }
  const noise = [0.1, -0.2, 0.15, -0.05, 0.2, -0.1, 0.05, -0.15, 0.1, 0.0, -0.1, 0.2, -0.2, 0.05, 0.1, -0.05]
  const y = x.map((r, i) => 50 + 3 * r[0] - 2 * r[1] + 1.5 * r[3] + wpShift[wholePlots[i]] + noise[i])
  const terms = standardTerms(4, 'linear')
  const result = splitPlotAnalysis({ x, y, terms, wholePlots, hardToChange: [3] })

  it('builds a balanced split-plot design', () => {
    expect(new Set(wholePlots).size).toBe(4)
    expect(result.ok).toBe(true)
  })

  it('keeps the least-squares estimates', () => {
    if (!result.ok) throw new Error(result.reason)
    const ols = fitModel({ x, y, terms })
    result.coefficients.forEach((c, i) => expect(c.estimate).toBeCloseTo(ols.coefficients[i].estimate, 9))
  })

  it('tests the hard-to-change factor against whole-plot error', () => {
    if (!result.ok) throw new Error(result.reason)
    expect(result.wholePlotError.df).toBe(2) // 4 whole plots − intercept − D
    expect(result.subplotError.df).toBe(16 - 4 - 3) // runs − whole plots − A, B, C
    const d = result.rows.find((r) => r.source === 'D')!
    const a = result.rows.find((r) => r.source === 'A')!
    expect(d.stratum).toBe('whole')
    expect(a.stratum).toBe('sub')
    // Whole-plot variation swamps D, but run-to-run noise is small, so A is clear.
    expect(d.p!).toBeGreaterThan(0.05)
    expect(a.p!).toBeLessThan(0.001)
    // Ordinary ANOVA would wrongly call D significant.
    const naive = fitModel({ x, y, terms }).anova.terms.find((r) => r.source === 'D')!
    expect(naive.p!).toBeLessThan(d.p!)
  })

  it('refuses unbalanced whole plots', () => {
    const r = splitPlotAnalysis({ x: x.slice(1), y: y.slice(1), terms, wholePlots: wholePlots.slice(1), hardToChange: [3] })
    expect(r.ok).toBe(false)
  })
})
