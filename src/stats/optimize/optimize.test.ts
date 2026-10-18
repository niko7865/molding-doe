import { describe, expect, it } from 'vitest'
import { fitModel } from '../model/fit'
import { standardTerms } from '../model/terms'
import { confirmationCheck } from './confirm'
import { desirability, overallDesirability } from './desirability'
import { optimize } from './search'

describe('desirability', () => {
  it('scores maximize, minimize and target goals', () => {
    expect(desirability(5, { goal: { kind: 'maximize', low: 0, high: 10 } })).toBeCloseTo(0.5)
    expect(desirability(-1, { goal: { kind: 'maximize', low: 0, high: 10 } })).toBe(0)
    expect(desirability(2, { goal: { kind: 'minimize', low: 0, high: 10 } })).toBeCloseTo(0.8)
    expect(desirability(12.4, { goal: { kind: 'target', low: 12.3, target: 12.4, high: 12.5 } })).toBeCloseTo(1)
    expect(desirability(12.45, { goal: { kind: 'target', low: 12.3, target: 12.4, high: 12.5 } })).toBeCloseTo(0.5)
    expect(desirability(5, { goal: { kind: 'maximize', low: 0, high: 10 }, weight: 2 })).toBeCloseTo(0.25)
  })

  it('combines with importance and is zero if any response is unacceptable', () => {
    const goals = [{ goal: { kind: 'maximize', low: 0, high: 1 }, importance: 3 }, { goal: { kind: 'maximize', low: 0, high: 1 }, importance: 1 }] as const
    expect(overallDesirability([0.5, 1], [...goals])).toBeCloseTo(0.5 ** 0.75)
    expect(overallDesirability([0, 1], [...goals])).toBe(0)
  })
})

describe('optimize', () => {
  it('finds the stationary point of the Montgomery Example 11.2 yield surface', () => {
    const a = Math.SQRT2
    const x = [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [a, 0], [-a, 0], [0, a], [0, -a]]
    const y = [76.5, 77.0, 78.0, 79.5, 79.9, 80.3, 80.0, 79.7, 79.8, 78.4, 75.6, 78.5, 77.0]
    const fit = fitModel({ x, y, terms: standardTerms(2, 'quadratic') })
    const best = optimize({
      predict: [(p) => fit.predict(p).fit],
      goals: [{ goal: { kind: 'maximize', low: 75, high: 81 } }],
      region: { bounds: [[-a, a], [-a, a]], radius: a },
    })
    expect(best.x[0]).toBeCloseTo(0.389, 2)
    expect(best.x[1]).toBeCloseTo(0.306, 2)
    expect(best.predicted[0]).toBeCloseTo(80.21, 1)
  })

  it('trades off two responses and respects fixed factors and bounds', () => {
    // Weight rises with A; flash rises with A and B. Target weight 12.4, minimize flash.
    const weight = (p: number[]) => 12.2 + 0.3 * p[0] + 0.05 * p[1]
    const flash = (p: number[]) => 2 + 1.0 * p[0] + 1.5 * p[1]
    const best = optimize({
      predict: [weight, flash],
      goals: [
        { goal: { kind: 'target', low: 12.2, target: 12.4, high: 12.6 }, importance: 3 },
        { goal: { kind: 'minimize', low: 1, high: 4 } },
      ],
      region: { bounds: [[-1, 1], [-1, 1]] },
    })
    expect(best.desirability).toBeGreaterThan(0.8)
    expect(best.x[1]).toBeCloseTo(-1, 3) // B only hurts flash, so it goes to its low limit
    expect(best.predicted[0]).toBeGreaterThan(12.3)

    const pinned = optimize({ predict: [weight, flash], goals: [{ goal: { kind: 'none' } }, { goal: { kind: 'minimize', low: 1, high: 4 } }], region: { bounds: [[-1, 1], [-1, 1]] }, fixed: [0.5, null] })
    expect(pinned.x[0]).toBe(0.5)
  })

  it('moves toward acceptability when nothing starts acceptable', () => {
    const best = optimize({ predict: [(p) => p[0]], goals: [{ goal: { kind: 'maximize', low: 0.9, high: 2 } }], region: { bounds: [[-1, 1]] } })
    expect(best.x[0]).toBeCloseTo(1, 6)
    expect(best.desirability).toBeGreaterThan(0)
  })
})

describe('confirmationCheck', () => {
  it('accepts results inside the interval for the mean of n runs', () => {
    const r = confirmationCheck(80.2, 0.2, 0.05, 7, [80.1, 80.4, 80.0])
    expect(r.inside).toBe(true)
    expect(r.observedMean).toBeCloseTo(80.1667, 4)
    expect(confirmationCheck(80.2, 0.2, 0.05, 7, [79.0, 79.2]).inside).toBe(false)
  })
})
