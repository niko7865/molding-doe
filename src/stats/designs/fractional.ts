import { fullFactorial } from './fullFactorial'
import type { BaseDesign } from './types'
import { aliasesOf, definingRelation, LETTERS, parseWord, resolution, wordLength, wordName, type Word } from './words'

/**
 * Recommended generators for 2^(k-p) designs (Montgomery, Design and Analysis of Experiments,
 * table of selected fractional factorials; Box, Hunter & Hunter). The resolution is computed
 * from the generators rather than trusted from the table.
 */
export const GENERATORS: Record<number, Record<number, string[]>> = {
  3: { 1: ['C=AB'] },
  4: { 1: ['D=ABC'] },
  5: { 1: ['E=ABCD'], 2: ['D=AB', 'E=AC'] },
  6: { 1: ['F=ABCDE'], 2: ['E=ABC', 'F=BCD'], 3: ['D=AB', 'E=AC', 'F=BC'] },
  7: { 1: ['G=ABCDEF'], 2: ['F=ABCD', 'G=ABDE'], 3: ['E=ABC', 'F=BCD', 'G=ACD'], 4: ['D=AB', 'E=AC', 'F=BC', 'G=ABC'] },
  8: { 2: ['G=ABCD', 'H=ABEF'], 3: ['F=ABC', 'G=ABD', 'H=BCDE'], 4: ['E=BCD', 'F=ACD', 'G=ABC', 'H=ABD'] },
  9: {
    2: ['H=ACDFG', 'J=BCEFG'],
    3: ['G=ABCD', 'H=ACEF', 'J=CDEF'],
    4: ['F=BCDE', 'G=ACDE', 'H=ABDE', 'J=ABCE'],
    5: ['E=ABC', 'F=BCD', 'G=ACD', 'H=ABD', 'J=ABCD'],
  },
}

export interface FractionOption {
  k: number
  p: number
  runs: number
  resolution: number
  generators: string[]
}

/** Every tabulated fraction for k factors, largest (highest resolution) first. */
export function fractionOptions(k: number): FractionOption[] {
  const byP = GENERATORS[k] ?? {}
  return Object.keys(byP)
    .map(Number)
    .sort((a, b) => a - b)
    .map((p) => {
      const generators = byP[p]
      return { k, p, runs: 2 ** (k - p), generators, resolution: resolution(definingRelation(generators.map(generatorWord))) }
    })
}

/** "E=ABCD" → the defining word ABCDE (the generated factor times its generator). */
export function generatorWord(g: string): Word {
  const [lhs, rhs] = g.split('=')
  return parseWord(lhs.trim()) ^ parseWord(rhs.trim())
}

/**
 * Builds a 2^(k-p) fractional factorial: a full factorial in the first k-p factors, with each
 * remaining factor set to the product of the base columns named by its generator.
 */
export function fractionalFactorialDesign(k: number, generators: string[]): BaseDesign {
  const p = generators.length
  const base = k - p
  const gens = generators.map((g) => {
    const [lhs, rhs] = g.split('=').map((s) => s.trim())
    const target = LETTERS.indexOf(lhs)
    if (lhs.length !== 1 || target < base || target >= k) throw new Error(`Generator "${g}" must define one of the last ${p} factors`)
    const source = parseWord(rhs)
    if (source >> base) throw new Error(`Generator "${g}" may only use the first ${base} factors`)
    return { target, source }
  })
  if (new Set(gens.map((g) => g.target)).size !== p) throw new Error('Each generated factor needs exactly one generator')

  const points = fullFactorial(base).map((row) => {
    const coded = [...row, ...new Array(p).fill(0)]
    for (const { target, source } of gens) {
      let v = 1
      for (let j = 0; j < base; j++) if ((source >> j) & 1) v *= row[j]
      coded[target] = v
    }
    return { coded, kind: 'factorial' as const }
  })
  return {
    type: 'fractional-factorial',
    k,
    points,
    generators,
    resolution: resolution(definingRelation(generators.map(generatorWord))),
  }
}

export interface AliasRow {
  effect: string
  aliases: string[]
}

/**
 * Alias structure for main effects and two-factor interactions, listing aliases up to three
 * factors long (longer interactions are assumed negligible, as is conventional).
 */
export function aliasStructure(k: number, generators: string[], maxAliasLength = 3): AliasRow[] {
  const defining = definingRelation(generators.map(generatorWord))
  const effects: Word[] = []
  for (let a = 0; a < k; a++) effects.push(1 << a)
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) effects.push((1 << a) | (1 << b))
  const seen = new Set<Word>()
  const rows: AliasRow[] = []
  for (const e of effects) {
    if (seen.has(e)) continue
    const aliases = aliasesOf(e, defining)
    aliases.forEach((a) => seen.add(a))
    rows.push({ effect: wordName(e), aliases: aliases.filter((a) => wordLength(a) <= maxAliasLength).map(wordName) })
  }
  return rows
}

export function definingRelationNames(generators: string[]): string[] {
  return definingRelation(generators.map(generatorWord))
    .sort((a, b) => wordLength(a) - wordLength(b) || a - b)
    .map(wordName)
}
