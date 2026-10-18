import type { BaseDesign } from './types'

/**
 * Factor groups that are varied together at ±1 while the rest sit at the center
 * (Box & Behnken, 1960). k = 3–5 use every pair; k = 6 and 7 use balanced incomplete blocks of three.
 */
const BLOCKS: Record<number, number[][]> = {
  6: [
    [0, 1, 3],
    [1, 2, 4],
    [2, 3, 5],
    [0, 3, 4],
    [1, 4, 5],
    [0, 2, 5],
  ],
  7: [
    [3, 4, 5],
    [0, 5, 6],
    [1, 4, 6],
    [0, 1, 3],
    [2, 3, 6],
    [0, 2, 4],
    [1, 2, 5],
  ],
}

export const BOX_BEHNKEN_FACTORS = [3, 4, 5, 6, 7] as const

function groups(k: number): number[][] {
  if (BLOCKS[k]) return BLOCKS[k]
  const out: number[][] = []
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) out.push([a, b])
  return out
}

/** Box–Behnken points without center runs (the run builder adds those). */
export function boxBehnkenDesign(k: number): BaseDesign {
  if (k < 3 || k > 7) throw new Error('Box–Behnken designs are available for 3 to 7 factors')
  const points: BaseDesign['points'] = []
  for (const g of groups(k)) {
    for (let i = 0; i < 2 ** g.length; i++) {
      const coded = new Array(k).fill(0)
      g.forEach((f, j) => (coded[f] = (i >> j) & 1 ? 1 : -1))
      points.push({ coded, kind: 'edge' })
    }
  }
  return { type: 'box-behnken', k, points }
}
