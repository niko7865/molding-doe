import type { BaseDesign } from './types'

/**
 * First rows of the cyclic Plackett–Burman designs (Plackett & Burman, 1946). The remaining rows
 * are cyclic shifts of the first, and the last row is all low.
 */
const GENERATOR_ROWS: Record<number, string> = {
  12: '++-+++---+-',
  20: '++--++++-+-+----++-',
  24: '+++++-+-++--++--+-+----',
}

export const PB_SIZES = [12, 20, 24] as const

/** Smallest tabulated run size that fits k factors. */
export function plackettBurmanRuns(k: number): number | null {
  return PB_SIZES.find((n) => n - 1 >= k) ?? null
}

export function plackettBurmanDesign(k: number, runs = plackettBurmanRuns(k)): BaseDesign {
  if (runs === null || !GENERATOR_ROWS[runs]) throw new Error(`No Plackett–Burman design for ${k} factors`)
  if (k > runs - 1) throw new Error(`A ${runs}-run Plackett–Burman design holds at most ${runs - 1} factors`)
  const first = [...GENERATOR_ROWS[runs]].map((c) => (c === '+' ? 1 : -1))
  const m = first.length
  const rows: number[][] = []
  for (let i = 0; i < m; i++) rows.push(Array.from({ length: m }, (_, j) => first[(j - i + m) % m]))
  rows.push(new Array(m).fill(-1))
  return {
    type: 'plackett-burman',
    k,
    points: rows.map((r) => ({ coded: r.slice(0, k), kind: 'factorial' })),
    resolution: 3,
  }
}
