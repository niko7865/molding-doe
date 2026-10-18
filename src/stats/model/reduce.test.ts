import { describe, expect, it } from 'vitest'
import { fullFactorial } from '../designs/fullFactorial'
import { reduceModel } from './reduce'
import { factorialTerms, standardTerms, termName } from './terms'

const FILTRATION = [45, 71, 48, 65, 68, 60, 80, 65, 43, 100, 45, 104, 75, 86, 70, 96]

describe('reduceModel', () => {
  it("uses Lenth's method on a saturated two-level design (Montgomery Example 6.2)", () => {
    const r = reduceModel({ x: fullFactorial(4), y: FILTRATION, terms: factorialTerms(4) }, 0.05)
    expect(r.method).toBe('lenth')
    expect(r.terms.map((t) => termName(t))).toEqual(['A', 'C', 'D', 'AC', 'AD'])
    expect(r.fit.dfError).toBe(10)
  })

  it('removes inert terms by backward elimination and keeps hierarchy', () => {
    // Replicated 2^3; y depends on A, C and the BC interaction only. B must stay for hierarchy.
    const base = fullFactorial(3)
    const x = [...base, ...base]
    const noise = [0.3, -0.2, 0.1, -0.4, 0.2, 0.0, -0.1, 0.3, -0.3, 0.2, -0.1, 0.4, -0.2, 0.1, 0.0, -0.3]
    const y = x.map((r, i) => 20 + 4 * r[0] + 3 * r[2] + 2.5 * r[1] * r[2] + noise[i])
    const red = reduceModel({ x, y, terms: factorialTerms(3) })
    expect(red.method).toBe('backward')
    expect(red.terms.map((t) => termName(t)).sort()).toEqual(['A', 'B', 'BC', 'C'])
    expect(red.steps.map((s) => s.term)).toContain('ABC')
  })

  it('leaves a saturated quadratic model alone with a warning', () => {
    const x = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ]
    const r = reduceModel({ x, y: [1, 2, 3, 4, 5, 6], terms: standardTerms(2, 'quadratic').slice(0, 5) })
    expect(r.method).toBe('none')
    expect(r.warnings).toHaveLength(1)
  })
})
