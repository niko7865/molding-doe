import { describe, expect, it } from 'vitest'
import { fractionDefective, fromCoded, isAllOrNothing, summarizeCavities, toCoded } from './responses'

describe('responses', () => {
  it('summarizes cavities, ignoring missing ones', () => {
    const s = summarizeCavities([12.1, null, 12.5])
    expect(s.count).toBe(2)
    expect(s.mean).toBeCloseTo(12.3, 12)
    expect(s.sd).toBeCloseTo(Math.sqrt(0.08), 12)
    expect(summarizeCavities([12.1])).toEqual({ mean: 12.1, sd: null, count: 1 })
    expect(summarizeCavities([null])).toEqual({ mean: null, sd: null, count: 0 })
  })

  it('computes fraction defective', () => {
    expect(fractionDefective(3, 10)).toBeCloseTo(0.3)
    expect(() => fractionDefective(1, 0)).toThrow()
  })

  it('detects all-or-nothing defects', () => {
    expect(isAllOrNothing([0, 0, 0])).toBe(true)
    expect(isAllOrNothing([0, 1, 0])).toBe(false)
  })

  it('codes and decodes factor levels', () => {
    expect(toCoded(220, 220, 250)).toBe(-1)
    expect(toCoded(250, 220, 250)).toBe(1)
    expect(toCoded(235, 220, 250)).toBe(0)
    expect(fromCoded(1.414, 220, 250)).toBeCloseTo(256.21, 2)
  })
})
