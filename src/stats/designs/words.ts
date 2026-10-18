/**
 * Effect "words" (e.g. ABD) as bitmasks over factor indices: bit j set means factor j appears.
 * Multiplying two effects in a two-level design is XOR (A·A = I).
 */
export type Word = number

/** Standard factor letters; I is skipped because it denotes the identity. */
export const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

export function wordLength(w: Word): number {
  let n = 0
  for (let x = w; x; x &= x - 1) n++
  return n
}

export function wordName(w: Word): string {
  if (w === 0) return 'I'
  let s = ''
  for (let j = 0; w >> j; j++) if ((w >> j) & 1) s += LETTERS[j]
  return s
}

export function parseWord(s: string): Word {
  let w = 0
  for (const ch of s.toUpperCase()) {
    const j = LETTERS.indexOf(ch)
    if (j < 0) throw new Error(`Unknown factor letter "${ch}" in "${s}"`)
    w ^= 1 << j
  }
  return w
}

/** Every product of the generator words: the defining relation, without I. */
export function definingRelation(generators: Word[]): Word[] {
  const out: Word[] = []
  for (let mask = 1; mask < 1 << generators.length; mask++) {
    let w = 0
    generators.forEach((g, i) => {
      if ((mask >> i) & 1) w ^= g
    })
    out.push(w)
  }
  return out
}

/** Resolution: the length of the shortest word in the defining relation (Infinity for a full factorial). */
export function resolution(defining: Word[]): number {
  return defining.length ? Math.min(...defining.map(wordLength)) : Infinity
}

/** Effects confounded with `effect`, shortest first. */
export function aliasesOf(effect: Word, defining: Word[]): Word[] {
  return defining.map((d) => effect ^ d).sort((a, b) => wordLength(a) - wordLength(b) || a - b)
}

export function romanResolution(r: number): string {
  return Number.isFinite(r) ? ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][r] ?? String(r) : 'Full'
}
