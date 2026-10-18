import { describe, expect, it } from 'vitest'
import { analyzeSeries, confirmStudy, seriesList } from './analysis'
import { DEMO_MODEL, demoStudy } from './demo'
import { parseStudy, serializeStudy } from './file'

describe('demo study', () => {
  const s = demoStudy(new Date('2026-01-01T00:00:00Z'))

  it('is a valid study file', () => {
    expect(parseStudy(serializeStudy(s)).runs).toHaveLength(27)
  })

  it('recovers the true effects on boss height', () => {
    const a = analyzeSeries(s, seriesList(s).find((x) => x.key === 'dimension:mean')!)
    const coef = (name: string) => a.fit.coefficients.find((c) => c.name === name)?.estimate ?? 0
    expect(coef('Hold pressure')).toBeCloseTo(0.03, 2)
    expect(coef('Mold temperature')).toBeCloseTo(-0.024, 2)
    expect(a.fit.rSquared).toBeGreaterThan(0.9)
  })

  it('lands an optimum near the target and confirms it', () => {
    const height = (DEMO_MODEL.dimension(s.analysis!.optimum!, 0) + DEMO_MODEL.dimension(s.analysis!.optimum!, 1)) / 2
    expect(height).toBeCloseTo(52.45, 2)
    expect(DEMO_MODEL.flash(s.analysis!.optimum!)).toBeLessThan(2)
    const results = confirmStudy(s)
    expect(results.map((r) => r.check?.inside)).toEqual([true, true, true])
  })
})
