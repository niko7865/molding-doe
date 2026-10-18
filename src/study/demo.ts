import { seededRandom } from '../stats'
import { optimizeStudy } from './analysis'
import { applyDesign, previewDesign, type DesignDraft } from './design'
import { factorFromPreset } from './presets'
import { createStudy, type Study } from './schema'

/**
 * A worked example: a two-cavity housing on a 180 t press, studied with a face-centered central
 * composite design over melt temperature, hold pressure, hold time and mold temperature.
 * The results come from a known model plus noise, so the demo doubles as an end-to-end test.
 */

/** True process behavior in coded units: [melt, hold pressure, hold time, mold temp]. */
export const DEMO_MODEL = {
  weight: ([a, b, c, d]: number[], cavity: number) => 38.2 + 0.1 * a + 0.3 * b + 0.18 * c + 0.05 * d - 0.12 * b * b - 0.1 * c * c + 0.06 * b * c - 0.08 * cavity,
  dimension: ([a, b, c, d]: number[], cavity: number) => 52.42 - 0.012 * a + 0.03 * b + 0.016 * c - 0.024 * d + 0.01 * a * d - 0.014 * b * b + 0.01 * cavity,
  flash: ([a, b]: number[]) => 1.9 + 0.55 * a + 0.9 * b + 0.3 * a * b,
}

const NOISE = { weight: 0.02, dimension: 0.004, flash: 0.35 }

function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

export function demoStudy(now = new Date()): Study {
  const random = seededRandom(20261018)
  const factors = [
    { ...factorFromPreset('melt_temp'), low: 230, high: 260 },
    { ...factorFromPreset('hold_pressure'), low: 450, high: 650 },
    { ...factorFromPreset('hold_time'), low: 3, high: 7 },
    { ...factorFromPreset('mold_temp'), low: 50, high: 80, hardToChange: false },
  ]
  let s: Study = {
    ...createStudy('Housing boss height (demo)', now),
    goal: 'Hold the 52.45 mm boss height on both cavities without flash, with a fully packed part.',
    cavities: 2,
    machine: { name: 'Press 7 (180 t)', maxInjectionPressure: 1800, maxInjectionSpeed: 200, clampForce: 1800 },
    factors,
    responses: [
      { id: 'weight', name: 'Part weight', kind: 'continuous', quantity: 'mass', perCavity: true },
      { id: 'dimension', name: 'Boss height', kind: 'continuous', quantity: 'length', perCavity: true },
      { id: 'flash', name: 'Flash', kind: 'rating', quantity: 'none', perCavity: false },
    ],
  }
  const draft: DesignDraft = {
    type: 'central-composite',
    alpha: 'face-centered',
    centerPoints: 3,
    replicates: 1,
    blocking: { kind: 'none' },
    randomize: true,
    seed: 4471,
  }
  s = applyDesign(s, draft, previewDesign(s, draft, now), now)
  const round = (v: number, step: number) => Math.round(v / step) * step
  s.runs = s.runs.map((r) => {
    const x = r.coded!
    const cavities = [0, 1]
    return {
      ...r,
      status: 'done',
      results: {
        weight: cavities.map((c) => round(DEMO_MODEL.weight(x, c) + NOISE.weight * normal(random), 0.01)),
        dimension: cavities.map((c) => round(DEMO_MODEL.dimension(x, c) + NOISE.dimension * normal(random), 0.001)),
        flash: [Math.min(5, Math.max(1, Math.round(DEMO_MODEL.flash(x) + NOISE.flash * normal(random))))],
      },
      notes: r.order === 1 ? 'Purged 10 shots after material change before collecting.' : r.order === 9 ? 'Short shot on first shot after the change; discarded.' : '',
    }
  })

  s.analysis = {
    series: {
      'dimension:mean': { auto: true, goal: { kind: 'target', low: 52.4, target: 52.45, high: 52.5 }, importance: 5 },
      'flash:value': { auto: true, goal: { kind: 'minimize', low: 1, high: 3 }, importance: 4 },
      'weight:mean': { auto: true, goal: { kind: 'maximize', low: 37.8, high: 38.3 }, importance: 2 },
    },
  }
  const optimum = optimizeStudy(s).result.x
  const confirm = (f: (x: number[], c: number) => number, sd: number, step: number) =>
    [0, 1, 2].map(() => round((f(optimum, 0) + f(optimum, 1)) / 2 + (sd / Math.SQRT2) * normal(random), step))
  s.analysis.optimum = optimum
  s.analysis.confirmation = {
    runs: 3,
    values: {
      'dimension:mean': confirm(DEMO_MODEL.dimension, NOISE.dimension, 0.001),
      'flash:value': [0, 1, 2].map(() => Math.min(5, Math.max(1, Math.round(DEMO_MODEL.flash(optimum) + NOISE.flash * normal(random))))),
      'weight:mean': confirm(DEMO_MODEL.weight, NOISE.weight, 0.005),
    },
  }
  return s
}
