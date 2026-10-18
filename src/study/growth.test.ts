import { describe, expect, it } from 'vitest'
import { analyzeSeries, seriesList } from './analysis'
import { applyDesign, defaultDraft, previewDesign, type DesignDraft } from './design'
import { growthChoices, previewGrowth } from './growth'
import { factorFromPreset } from './presets'
import { createStudy, newId, type Run, type Study } from './schema'

const noise = (i: number) => (((i * 7919) % 13) - 6) / 200

function make(k: number, draft: Partial<DesignDraft>): Study {
  const keys = ['melt_temp', 'hold_pressure', 'hold_time', 'mold_temp', 'cooling_time']
  let s: Study = {
    ...createStudy('growth'),
    factors: keys.slice(0, k).map((key) => ({ ...factorFromPreset(key), hardToChange: false })),
    responses: [{ id: 'y', name: 'Y', kind: 'continuous', quantity: 'none', perCavity: false }],
  }
  const d = { ...defaultDraft(k), centerPoints: 2, randomize: false, seed: 1, ...draft }
  s = applyDesign(s, d, previewDesign(s, d))
  return s
}

function fill(s: Study, f: (x: number[]) => number, only?: (r: Run) => boolean): Study {
  return { ...s, runs: s.runs.map((r, i) => (only && !only(r) ? r : { ...r, status: 'done', results: { y: [f(r.coded!) + noise(i)] } })) }
}

const coef = (s: Study, name: string) => {
  const a = analyzeSeries(s, seriesList(s)[0])
  return a.fit.coefficients.find((c) => c.name === name)?.estimate ?? 0
}

describe('fold-over', () => {
  // 2^(5-2) resolution III: D = AB, E = AC, so A is aliased with BD.
  const truth = (x: number[]) => 10 + 1 * x[0] + 2 * x[1] * x[3]
  const s = fill(make(5, { type: 'fractional-factorial', generators: ['D=AB', 'E=AC'] }), truth)

  it('is offered for a fraction and adds the mirrored runs in a new block', () => {
    expect(growthChoices(s).find((c) => c.kind === 'foldover')?.available).toBe(true)
    const g = previewGrowth(s, { kind: 'foldover', centerPoints: 2, randomize: false, seed: 1 })
    const firstStage = s.runs.filter((r) => r.kind === 'factorial').map((r) => r.coded!.join())
    const mirrored = g.added.filter((r) => r.kind === 'factorial').map((r) => r.coded!.map((v) => -v || 0).join())
    expect(mirrored.sort()).toEqual(firstStage.sort())
    expect(new Set(g.added.map((r) => r.block))).toEqual(new Set([2]))
    expect(g.added.map((r) => r.order)).toEqual(g.added.map((_, i) => s.runs.length + i + 1))
    expect(g.study.design!.stages!.map((x) => x.kind)).toEqual(['initial', 'foldover'])
    expect(growthChoices(g.study).find((c) => c.kind === 'foldover')?.available).toBe(false)
  })

  it('separates the main effect from its alias', () => {
    // Before: the A estimate carries the BD interaction (1 + 2 = 3).
    expect(coef({ ...s, analysis: { series: { 'y:value': { auto: false, terms: ['1,0,0,0,0', '0,1,0,0,0', '0,0,1,0,0', '0,0,0,1,0', '0,0,0,0,1'] } } } }, 'Melt temperature')).toBeCloseTo(3, 1)
    const grown = fill(previewGrowth(s, { kind: 'foldover', centerPoints: 2, randomize: false, seed: 1 }).study, truth, (r) => r.status === 'pending')
    const manual = { ...grown, analysis: { series: { 'y:value': { auto: false, terms: ['1,0,0,0,0', '0,1,0,0,0', '0,0,1,0,0', '0,0,0,1,0', '0,0,0,0,1'] } } } }
    expect(coef(manual, 'Melt temperature')).toBeCloseTo(1, 1)
  })
})

describe('axial points', () => {
  const truth = (x: number[]) => 50 + 2 * x[0] + 3 * x[1] - 4 * x[0] * x[0] - 1.5 * x[1] * x[1] + x[0] * x[1]
  const s = fill(make(2, { type: 'full-factorial', centerPoints: 3 }), truth)

  it('turns the factorial into a rotatable CCD that recovers the curvature', () => {
    const g = previewGrowth(s, { kind: 'axial', alpha: 'rotatable', centerPoints: 2, randomize: false, seed: 1 })
    const axial = g.added.filter((r) => r.kind === 'axial')
    expect(axial).toHaveLength(4)
    expect(Math.max(...axial.flatMap((r) => r.coded!))).toBeCloseTo(Math.SQRT2, 9)
    expect(g.study.design!.type).toBe('central-composite')
    const grown = fill(g.study, truth, (r) => r.status === 'pending')
    expect(coef(grown, 'Melt temperature²')).toBeCloseTo(-4, 1)
    expect(coef(grown, 'Hold pressure²')).toBeCloseTo(-1.5, 1)
  })
})

describe('new region', () => {
  const truth = (x: number[]) => 50 - (x[0] - 0.5) ** 2 - (x[1] + 0.5) ** 2
  let s = fill(make(2, { type: 'central-composite', alpha: 'face-centered', centerPoints: 3 }), truth)
  s = { ...s, analysis: { series: {}, optimum: [0.5, -0.5], confirmation: { runs: 3, values: {} } } }

  it('centers narrower ranges on the optimum and reuses the runs inside them', () => {
    const before = s.factors.map((f) => [f.low, f.high])
    const g = previewGrowth(s, { kind: 'region', draft: { ...defaultDraft(2), type: 'full-factorial', centerPoints: 2 }, shrink: 0.5, centerPoints: 2, randomize: false, seed: 1 })
    const [melt, hold] = g.study.factors
    // Melt 220–250 → center 242.5, half-range 7.5 → 235–250; hold 400–700 → center 475, half 75 → 400–550.
    expect([melt.low, melt.high]).toEqual([235, 250])
    expect([hold.low, hold.high]).toEqual([400, 550])
    expect(before).not.toEqual([[melt.low, melt.high], [hold.low, hold.high]])
    // Face-centered CCD points inside the new box: (0,-1), (1,-1), (1,0)… recoded to the new ranges.
    expect(g.reused + g.archived).toBe(s.runs.length)
    expect(g.reused).toBeGreaterThan(0)
    expect(g.study.runs.filter((r) => !r.archived).every((r) => r.coded!.every((v) => Math.abs(v) <= 1 + 1e-9))).toBe(true)
    expect(g.study.analysis?.optimum).toBeUndefined()
    expect(g.added.every((r) => r.block === Math.max(...s.runs.map((x) => x.block ?? 1)) + 1)).toBe(true)
    const grown = fill(g.study, truth, (r) => r.status === 'pending')
    expect(() => analyzeSeries(grown, seriesList(grown)[0])).not.toThrow()
  })
})

it('needs finished runs and unchanged factors', () => {
  const s = make(3, { type: 'fractional-factorial', generators: ['C=AB'] })
  expect(growthChoices(s).every((c) => !c.available)).toBe(true)
  const changed = fill({ ...s, factors: [...s.factors, { ...factorFromPreset('cooling_time'), id: newId() }] }, () => 1)
  expect(growthChoices(changed).every((c) => !c.available)).toBe(true)
})
