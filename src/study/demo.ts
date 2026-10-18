import { seededRandom } from '../stats'
import { optimizeStudy } from './analysis'
import { applyDesign, previewDesign, type DesignDraft } from './design'
import { previewGrowth } from './growth'
import { factorFromPreset } from './presets'
import { createStudy, type Run, type Study } from './schema'

/**
 * A worked example: a two-cavity housing on a 180 t press. Melt temperature, hold pressure, hold
 * time and mold temperature were screened with a half fraction, folded over, then grown into a
 * face-centered central composite design in three blocks.
 * The results come from a known model plus noise, so the demo doubles as an end-to-end test.
 */

/** True process behavior in coded units: [melt, hold pressure, hold time, mold temp]. */
export const DEMO_MODEL = {
  weight: ([a, b, c, d]: number[], cavity: number) => 38.2 + 0.1 * a + 0.3 * b + 0.18 * c + 0.05 * d - 0.12 * b * b - 0.1 * c * c + 0.06 * b * c - 0.08 * cavity,
  dimension: ([a, b, c, d]: number[], cavity: number) => 52.42 - 0.012 * a + 0.03 * b + 0.016 * c - 0.024 * d + 0.01 * a * d - 0.014 * b * b + 0.01 * cavity,
  flash: ([a, b]: number[]) => 1.9 + 0.55 * a + 0.9 * b + 0.3 * a * b,
}

/** Pre-DOE studies as a process engineer would have recorded them on this mold. */
const DEMO_GUIDE: Study['guide'] = {
  viscosity: {
    ratio: 1,
    notes: 'Fill to about 95% with hold off; plastic pressure from the press screen.',
    rows: [
      [10, 3.9, 520],
      [20, 2.0, 690],
      [35, 1.18, 840],
      [50, 0.84, 1010],
      [70, 0.61, 1240],
      [90, 0.48, 1500],
      [110, 0.4, 1760],
    ].map(([speed, fillTime, pressure]) => ({ speed, fillTime, pressure })),
  },
  balance: {
    rows: [
      [17.62, 17.21],
      [17.58, 17.25],
      [17.65, 17.19],
      [17.6, 17.24],
      [17.63, 17.22],
    ],
  },
  pressureDrop: {
    ratio: 1,
    rows: [
      { segment: 'Nozzle (air shot)', pressure: 180 },
      { segment: 'End of runner', pressure: 520 },
      { segment: 'Past the gate', pressure: 860 },
      { segment: 'Part at transfer', pressure: 1240 },
    ],
  },
  gateSeal: {
    rows: [1, 2, 3, 4, 5, 6, 7, 8].map((time, i) => ({ time, weight: [36.9, 37.45, 37.82, 38.05, 38.17, 38.19, 38.2, 38.19][i] })),
  },
  cooling: {
    label: 'Boss height',
    quantity: 'length',
    specLow: 52.4,
    specHigh: 52.5,
    rows: [6, 8, 10, 12, 14, 16, 18].map((time, i) => ({ time, value: [52.31, 52.36, 52.4, 52.43, 52.44, 52.45, 52.45][i] })),
  },
  window: {
    rows: [
      [220, 400, 'short'],
      [220, 550, 'short'],
      [220, 700, 'sink'],
      [230, 450, 'good'],
      [230, 650, 'good'],
      [245, 400, 'sink'],
      [245, 550, 'good'],
      [245, 700, 'flash'],
      [260, 450, 'good'],
      [260, 650, 'good'],
      [270, 550, 'flash'],
      [270, 400, 'sink'],
    ].map(([melt, hold, outcome]) => ({ melt: melt as number, hold: hold as number, outcome: outcome as 'good' | 'short' | 'flash' | 'sink' })),
  },
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
  s.guide = DEMO_GUIDE
  // Stage 1: a half-fraction screening design with center points.
  const draft: DesignDraft = {
    type: 'fractional-factorial',
    generators: ['D=ABC'],
    centerPoints: 3,
    replicates: 1,
    blocking: { kind: 'none' },
    randomize: true,
    seed: 4471,
  }
  s = applyDesign(s, draft, previewDesign(s, draft, now), now)
  const round = (v: number, step: number) => Math.round(v / step) * step
  // Each stage ran on a different day; the later ones came out slightly heavier.
  const dayShift = (r: Run) => ((r.stage ?? 1) - 1) * 0.02
  const measure = (r: Run): Run => {
    if (r.status !== 'pending') return r
    const x = r.coded!
    const cavities = [0, 1]
    return {
      ...r,
      status: 'done',
      results: {
        weight: cavities.map((c) => round(DEMO_MODEL.weight(x, c) + dayShift(r) + NOISE.weight * normal(random), 0.01)),
        dimension: cavities.map((c) => round(DEMO_MODEL.dimension(x, c) + NOISE.dimension * normal(random), 0.001)),
        flash: [Math.min(5, Math.max(1, Math.round(DEMO_MODEL.flash(x) + NOISE.flash * normal(random))))],
      },
      notes: r.order === 1 ? 'Purged 10 shots after material change before collecting.' : r.order === 9 ? 'Short shot on first shot after the change; discarded.' : '',
    }
  }
  s.runs = s.runs.map(measure)
  // Stage 2: the center points showed curvature and D was aliased with ABC, so fold over…
  s = previewGrowth(s, { kind: 'foldover', centerPoints: 2, randomize: true, seed: 4472 }, now).study
  s.runs = s.runs.map(measure)
  // Stage 3: …then add face-centered axial points to fit the curvature.
  s = previewGrowth(s, { kind: 'axial', alpha: 'face-centered', centerPoints: 2, randomize: true, seed: 4473 }, now).study
  s.runs = s.runs.map(measure)

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
