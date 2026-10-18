import { describe, expect, it } from 'vitest'
import { crossProduct, independentColumns, inverse, matMul, transpose } from './linalg'

describe('linalg', () => {
  it('inverts a well-conditioned matrix', () => {
    const a = [
      [4, 7, 2],
      [3, 6, 1],
      [2, 5, 3],
    ]
    const inv = inverse(a)!
    const id = matMul(a, inv)
    id.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 12)))
  })

  it('returns null for a singular matrix', () => {
    expect(
      inverse([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull()
  })

  it('computes X\'X', () => {
    const x = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    expect(crossProduct(x)).toEqual(matMul(transpose(x), x))
  })

  it('finds aliased columns', () => {
    // Column 2 = column 0 * column 1 is independent; column 3 duplicates column 2.
    const x = [
      [1, -1, -1, -1],
      [1, 1, -1, -1],
      [1, -1, 1, 1],
      [1, 1, 1, 1],
    ]
    expect(independentColumns(x)).toEqual([0, 1, 2])
  })
})
