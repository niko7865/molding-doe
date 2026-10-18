import { factorFromPreset } from './presets'
import { createStudy, type Run, type Study } from './schema'

/** A small 2-cavity study with two runs and no results, for tests. */
export function makeTestStudy(): Study {
  const study = createStudy('Housing', new Date('2026-01-01T00:00:00Z'))
  const melt = factorFromPreset('melt_temp')
  const hold = factorFromPreset('hold_pressure')
  const run = (id: string, order: number, m: number, h: number): Run => ({
    id,
    order,
    settings: { [melt.id]: m, [hold.id]: h },
    results: { weight: [null, null], flash: [null, null] },
    status: 'pending',
    notes: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  return {
    ...study,
    cavities: 2,
    factors: [melt, hold],
    responses: [
      { id: 'weight', name: 'Part weight', kind: 'continuous', quantity: 'mass', perCavity: true },
      { id: 'flash', name: 'Flash', kind: 'rating', quantity: 'none', perCavity: true },
    ],
    runs: [run('r1', 1, 220, 400), run('r2', 2, 250, 700)],
  }
}
