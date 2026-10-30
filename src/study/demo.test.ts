import { describe, expect, it } from 'vitest'
import { analyzeSeries, confirmStudy, seriesList } from './analysis'
import { DEMO_MODEL, demoStudy } from './demo'
import { parseStudy, serializeStudy } from './file'
import { GUIDE_STUDIES, statusOf } from '../guide/info'
import { gateSeal, processWindow, viscosityCurve } from '../guide/studies'

describe('demo study', () => {
  const s = demoStudy(new Date('2026-01-01T00:00:00Z'))

  it('is a valid study file', () => {
    expect(parseStudy(serializeStudy(s)).runs).toHaveLength(8 + 3 + 8 + 2 + 8 + 2)
    expect(s.design!.stages!.map((x) => x.kind)).toEqual(['initial', 'foldover', 'axial'])
    expect(s.design!.type).toBe('central-composite')
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

  it('has every pre-DOE study done, agreeing with the DOE ranges', () => {
    expect(GUIDE_STUDIES.map((g) => statusOf(s, g.key))).toEqual(new Array(6).fill('done'))
    expect(viscosityCurve(s.guide!.viscosity!).flatFrom).not.toBeNull()
    expect(gateSeal(s.guide!.gateSeal!).sealTime).toBe(5)
    const w = processWindow(s.guide!.window!)
    expect(w.temp).toEqual([s.factors[0].low, s.factors[0].high])
    expect(w.hold).toEqual([s.factors[1].low, s.factors[1].high])
  })
})
