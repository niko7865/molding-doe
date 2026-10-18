import { describe, expect, it } from 'vitest'
import { fullFactorial } from './fullFactorial'

describe('fullFactorial', () => {
  it('builds a 2^3 design in standard order', () => {
    expect(fullFactorial(3)).toEqual([
      [-1, -1, -1],
      [1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [-1, 1, 1],
      [1, 1, 1],
    ])
  })

  it('has balanced, orthogonal columns', () => {
    const d = fullFactorial(5)
    for (let a = 0; a < 5; a++) {
      expect(d.reduce((s, r) => s + r[a], 0)).toBe(0)
      for (let b = a + 1; b < 5; b++) expect(d.reduce((s, r) => s + r[a] * r[b], 0)).toBe(0)
    }
  })

  it('rejects invalid k', () => {
    expect(() => fullFactorial(0)).toThrow(RangeError)
    expect(() => fullFactorial(2.5)).toThrow(RangeError)
  })
})
