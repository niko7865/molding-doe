import { describe, expect, it } from 'vitest'
import { analyzeSeries, confirmStudy, decode, designRegion, optimizeStudy, seriesData, seriesList } from './analysis'
import { applyDesign, defaultDraft, previewDesign } from './design'
import { factorFromPreset } from './presets'
import { createStudy, type Study } from './schema'

const noise = (i: number) => (((i * 7919) % 13) - 6) / 100 // deterministic, roughly ±0.06

function runStudy(type: 'full-factorial' | 'central-composite', fill: (x: number[], cavity: number, i: number) => number | null): Study {
  let s: Study = {
    ...createStudy('test'),
    cavities: 2,
    factors: [factorFromPreset('melt_temp'), factorFromPreset('hold_pressure')],
    responses: [
      { id: 'w', name: 'Weight', kind: 'continuous', quantity: 'mass', perCavity: true },
      { id: 'f', name: 'Flash', kind: 'passfail', quantity: 'none', shots: 10, perCavity: false },
    ],
  }
  const draft = { ...defaultDraft(2), type, alpha: type === 'central-composite' ? ('rotatable' as const) : undefined, centerPoints: 3, replicates: type === 'full-factorial' ? 2 : 1, seed: 5 }
  s = applyDesign(s, draft, previewDesign(s, draft))
  s.runs = s.runs.map((r, i) => ({
    ...r,
    status: 'done',
    results: { w: [fill(r.coded!, 0, i), fill(r.coded!, 1, i)], f: [Math.max(0, Math.min(10, Math.round(3 + 3 * r.coded![1])))] },
  }))
  return s
}

describe('analysis glue', () => {
  it('lists cavity summaries and single cavities as series', () => {
    const s = runStudy('full-factorial', () => 1)
    expect(seriesList(s).map((x) => x.key)).toEqual(['w:mean', 'w:sd', 'w:c1', 'w:c2', 'f:value'])
  })

  it('computes cavity mean, spread and fraction defective', () => {
    const s = runStudy('full-factorial', (_, c) => (c === 0 ? 12 : 12.4))
    const [mean, sd, , c2, frac] = seriesList(s)
    expect(seriesData(s, mean).y[0]).toBeCloseTo(12.2, 12)
    expect(seriesData(s, sd).y[0]).toBeCloseTo(Math.sqrt(0.08), 12)
    expect(seriesData(s, c2).y[0]).toBe(12.4)
    expect(seriesData(s, frac).y.every((v) => v >= 0 && v <= 1)).toBe(true)
  })

  it('finds the active effects and skips unfinished runs', () => {
    let s = runStudy('full-factorial', (x, c, i) => 12 + 0.3 * x[0] + 0.5 * x[1] + 0.05 * c + noise(i))
    s = { ...s, runs: s.runs.map((r, i) => (i === 0 ? { ...r, status: 'aborted' } : r)) }
    const a = analyzeSeries(s, seriesList(s)[0])
    expect(a.fit.terms.map((t) => t.join())).toEqual(['1,0', '0,1'])
    expect(a.fit.coefficients.find((c) => c.name === 'Hold pressure')!.estimate).toBeCloseTo(0.5, 1)
    expect(a.warnings.join(' ')).toMatch(/1 run is left out/)
    expect(a.curvature).not.toBeNull()
  })

  it('optimizes a response surface inside the tested sphere and checks confirmation runs', () => {
    // Weight peaks at coded (0.4, -0.3); target it.
    const peak = (x: number[]) => 12.5 - 0.3 * (x[0] - 0.4) ** 2 - 0.2 * (x[1] + 0.3) ** 2
    let s = runStudy('central-composite', (x, _c, i) => peak(x) + noise(i) / 3)
    const region = designRegion(s)
    expect(region.radius).toBeCloseTo(Math.SQRT2, 9)
    s = { ...s, analysis: { series: { 'w:mean': { auto: true, goal: { kind: 'maximize', low: 12, high: 12.6 } } } } }
    const out = optimizeStudy(s)
    expect(out.result.x[0]).toBeCloseTo(0.4, 1)
    expect(out.result.x[1]).toBeCloseTo(-0.3, 1)
    const melt = s.factors[0]
    expect(out.settings[melt.id]).toBeCloseTo(decode(s, out.result.x)[melt.id], 9)

    s = { ...s, analysis: { ...s.analysis!, optimum: out.result.x, confirmation: { runs: 3, values: { 'w:mean': [12.49, 12.51, 12.5] } } } }
    const [c] = confirmStudy(s)
    expect(c.check?.inside).toBe(true)
  })

  it('analyzes in display units while goals and confirmation values stay metric', () => {
    // Weight in grams; in imperial the model reads in ounces.
    let s = runStudy('central-composite', (x, _c, i) => 400 - 20 * (x[0] - 0.4) ** 2 - 10 * (x[1] + 0.3) ** 2 + noise(i))
    s = { ...s, units: 'imperial' }
    const a = analyzeSeries(s, seriesList(s)[0])
    expect(a.fit.coefficients[0].estimate).toBeCloseTo(400 / 28.349523125 - (20 * 0.16 + 10 * 0.09) / 28.349523125, 1)
    s = { ...s, analysis: { series: { 'w:mean': { auto: true, goal: { kind: 'maximize', low: 380, high: 400 } } } } }
    const out = optimizeStudy(s)
    expect(out.result.x[0]).toBeCloseTo(0.4, 1)
    expect(out.items[0].prediction.fit).toBeCloseTo(400 / 28.349523125, 1)
    s = { ...s, analysis: { ...s.analysis!, optimum: out.result.x, confirmation: { runs: 2, values: { 'w:mean': [400, 400] } } } }
    const [c] = confirmStudy(s)
    expect(c.check?.observedMean).toBeCloseTo(400 / 28.349523125, 6)
    expect(c.check?.inside).toBe(true)
  })
})
