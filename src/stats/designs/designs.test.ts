import { describe, expect, it } from 'vitest'
import { crossProduct, independentColumns } from '../linalg'
import { BOX_BEHNKEN_FACTORS, boxBehnkenDesign } from './boxBehnken'
import { centralCompositeDesign } from './centralComposite'
import { aliasStructure, definingRelationNames, fractionalFactorialDesign, fractionOptions, GENERATORS } from './fractional'
import { plackettBurmanDesign, PB_SIZES } from './plackettBurman'

function columnsOrthogonal(rows: number[][]): boolean {
  const xtx = crossProduct(rows)
  return xtx.every((r, i) => r.every((v, j) => (i === j ? v === rows.length : v === 0)))
}

/** Full quadratic model matrix: 1, x_i, x_i x_j, x_i². */
function quadratic(rows: number[][]): number[][] {
  return rows.map((x) => {
    const out = [1, ...x]
    for (let a = 0; a < x.length; a++) for (let b = a + 1; b < x.length; b++) out.push(x[a] * x[b])
    for (const v of x) out.push(v * v)
    return out
  })
}

describe('fractional factorials', () => {
  it('builds the 2^(4-1) with D = ABC', () => {
    const d = fractionalFactorialDesign(4, ['D=ABC'])
    expect(d.points).toHaveLength(8)
    expect(d.resolution).toBe(4)
    for (const { coded } of d.points) expect(coded[3]).toBe(coded[0] * coded[1] * coded[2])
    expect(definingRelationNames(['D=ABC'])).toEqual(['ABCD'])
  })

  it('gives the textbook resolutions for every tabulated fraction', () => {
    const expected: Record<string, number> = {
      '3-1': 3, '4-1': 4, '5-1': 5, '5-2': 3, '6-1': 6, '6-2': 4, '6-3': 3,
      '7-1': 7, '7-2': 4, '7-3': 4, '7-4': 3, '8-2': 5, '8-3': 4, '8-4': 4,
      '9-2': 6, '9-3': 4, '9-4': 4, '9-5': 3,
    }
    for (const k of Object.keys(GENERATORS).map(Number)) {
      for (const opt of fractionOptions(k)) {
        expect(opt.resolution, `2^(${k}-${opt.p})`).toBe(expected[`${k}-${opt.p}`])
        const d = fractionalFactorialDesign(k, opt.generators)
        expect(d.points).toHaveLength(opt.runs)
        expect(columnsOrthogonal(d.points.map((p) => p.coded))).toBe(true)
      }
    }
  })

  it('lists the 2^(5-2) alias structure', () => {
    // I = ABD = ACE = BCDE (Montgomery Example 8.6)
    expect(definingRelationNames(['D=AB', 'E=AC'])).toEqual(['ABD', 'ACE', 'BCDE'])
    const rows = aliasStructure(5, ['D=AB', 'E=AC'])
    expect(rows.find((r) => r.effect === 'A')?.aliases).toEqual(['BD', 'CE'])
    expect(rows.find((r) => r.effect === 'B')?.aliases).toEqual(['AD', 'CDE'])
  })

  it('rejects bad generators', () => {
    expect(() => fractionalFactorialDesign(4, ['C=AB'])).toThrow()
    expect(() => fractionalFactorialDesign(4, ['D=ABE'])).toThrow()
  })
})

describe('Plackett–Burman', () => {
  it.each(PB_SIZES)('%i-run design has orthogonal, balanced columns', (n) => {
    const d = plackettBurmanDesign(n - 1, n)
    expect(d.points).toHaveLength(n)
    expect(columnsOrthogonal(d.points.map((p) => p.coded))).toBe(true)
  })

  it('picks the smallest size that fits', () => {
    expect(plackettBurmanDesign(7).points).toHaveLength(12)
    expect(plackettBurmanDesign(11).points).toHaveLength(12)
    expect(plackettBurmanDesign(12).points).toHaveLength(20)
    expect(() => plackettBurmanDesign(24)).toThrow()
  })
})

describe('Box–Behnken', () => {
  const runs: Record<number, number> = { 3: 12, 4: 24, 5: 40, 6: 48, 7: 56 }
  it.each([...BOX_BEHNKEN_FACTORS])('k=%i supports a full quadratic model', (k) => {
    const d = boxBehnkenDesign(k)
    expect(d.points).toHaveLength(runs[k])
    // Add 3 centers so the intercept and pure quadratics separate.
    const rows = [...d.points.map((p) => p.coded), ...Array.from({ length: 3 }, () => new Array(k).fill(0))]
    const x = quadratic(rows)
    expect(independentColumns(x)).toHaveLength(x[0].length)
    for (let j = 0; j < k; j++) expect(rows.filter((r) => r[j] !== 0).length).toBe(rows.filter((r) => r[0] !== 0).length)
  })
})

describe('central composite', () => {
  it('uses the rotatable alpha', () => {
    expect(centralCompositeDesign(2).alpha).toBeCloseTo(Math.SQRT2, 12)
    expect(centralCompositeDesign(3).alpha).toBeCloseTo(1.681793, 6)
    expect(centralCompositeDesign(5).alpha).toBeCloseTo(2, 12)
    expect(centralCompositeDesign(3, 'face-centered').alpha).toBe(1)
  })

  it.each([2, 3, 4, 5, 6])('k=%i supports a full quadratic model', (k) => {
    const d = centralCompositeDesign(k)
    const rows = [...d.points.map((p) => p.coded), new Array(k).fill(0)]
    const x = quadratic(rows)
    expect(independentColumns(x)).toHaveLength(x[0].length)
  })
})
