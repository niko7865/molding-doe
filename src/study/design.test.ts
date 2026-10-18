import { describe, expect, it } from 'vitest'
import { applyDesign, defaultDraft, designChoices, designIsStale, hasResults, previewDesign, syncResults } from './design'
import { factorFromPreset } from './presets'
import { createStudy, type Study } from './schema'

function study(keys: string[]): Study {
  return {
    ...createStudy('t'),
    cavities: 2,
    factors: keys.map(factorFromPreset),
    responses: [
      { id: 'w', name: 'Weight', kind: 'continuous', quantity: 'mass', perCavity: true },
      { id: 'ct', name: 'Cycle time', kind: 'continuous', quantity: 'time', perCavity: false },
    ],
  }
}

describe('design glue', () => {
  it('offers sensible choices', () => {
    expect(designChoices(3).map((c) => c.key)).toEqual(['full', 'frac-1', 'bbd', 'ccd-r', 'ccd-f'])
    expect(designChoices(7).some((c) => c.key === 'pb-12')).toBe(true)
    expect(defaultDraft(3).type).toBe('full-factorial')
    const d6 = defaultDraft(6)
    expect(d6.type).toBe('fractional-factorial')
    expect(d6.generators).toEqual(['E=ABC', 'F=BCD']) // 16 runs, resolution IV
  })

  it('previews runs with actual setpoints and empty results', () => {
    const s = study(['melt_temp', 'hold_pressure', 'mold_temp'])
    const p = previewDesign(s, { ...defaultDraft(3), centerPoints: 2, seed: 1 })
    expect(p.runs).toHaveLength(10)
    const melt = s.factors[0]
    expect(new Set(p.runs.map((r) => r.settings[melt.id]))).toEqual(new Set([220, 235, 250]))
    expect(p.runs[0].results).toEqual({ w: [null, null], ct: [null] })
    // Mold temperature is hard to change, so runs come in whole plots.
    expect(p.runs.every((r) => r.wholePlot !== undefined)).toBe(true)
  })

  it('flags press limits and axial runs beyond the entered range', () => {
    const s = { ...study(['injection_speed', 'hold_pressure']), machine: { name: 'P7', maxInjectionSpeed: 125 } }
    const p = previewDesign(s, { ...defaultDraft(2), type: 'central-composite', alpha: 'rotatable', seed: 1 })
    expect(p.beyondRange).toEqual(['Injection speed', 'Hold pressure'])
    expect(p.violations.length).toBeGreaterThan(0) // 85 + 1.414 × 35 ≈ 134.5 mm/s > 125
  })

  it('applies a design and keeps results in step with responses', () => {
    let s = study(['melt_temp', 'hold_pressure'])
    const draft = { ...defaultDraft(2), centerPoints: 0, seed: 3 }
    s = applyDesign(s, draft, previewDesign(s, draft))
    expect(s.design?.factorIds).toEqual(s.factors.map((f) => f.id))
    expect(hasResults(s)).toBe(false)
    s = { ...s, runs: s.runs.map((r, i) => (i === 0 ? { ...r, results: { ...r.results, w: [12, 12.1] } } : r)) }
    expect(hasResults(s)).toBe(true)

    s = syncResults({ ...s, cavities: 3, responses: [...s.responses.filter((r) => r.id !== 'ct'), { id: 'f', name: 'Flash', kind: 'rating', quantity: 'none', perCavity: true }] })
    expect(s.runs[0].results).toEqual({ w: [12, 12.1, null], f: [null, null, null] })
    expect(designIsStale(s)).toBe(false)
    expect(designIsStale({ ...s, factors: [...s.factors, factorFromPreset('hold_time')] })).toBe(true)
  })
})
