import { LETTERS } from '../designs/words'

/**
 * A model term as the power of each factor: [1,0,0] is A, [1,1,0] is AB, [2,0,0] is A².
 * The intercept (all zeros) is always in the model and never listed as a term.
 */
export type Term = number[]

export type ModelKind = 'linear' | 'interactions' | 'quadratic'

export function termName(t: Term, names: string[] = [...LETTERS]): string {
  const parts: string[] = []
  t.forEach((p, j) => {
    if (p === 1) parts.push(names[j])
    else if (p > 1) parts.push(`${names[j]}²`)
  })
  return parts.join(names.some((n) => n.length > 1) ? '×' : '') || 'Intercept'
}

export const termKey = (t: Term) => t.join(',')

export const termOrder = (t: Term) => t.reduce((a, b) => a + b, 0)

/** Main effects; plus two-factor interactions; plus pure quadratics. */
export function standardTerms(k: number, kind: ModelKind): Term[] {
  const unit = (j: number, p = 1) => Array.from({ length: k }, (_, i) => (i === j ? p : 0))
  const terms: Term[] = []
  for (let j = 0; j < k; j++) terms.push(unit(j))
  if (kind === 'linear') return terms
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) terms.push(unit(a).map((v, i) => (i === b ? 1 : v)))
  if (kind === 'quadratic') for (let j = 0; j < k; j++) terms.push(unit(j, 2))
  return terms
}

/** Every two-level interaction up to `maxOrder` factors (for full factorial analysis). */
export function factorialTerms(k: number, maxOrder = k): Term[] {
  const terms: Term[] = []
  for (let mask = 1; mask < 1 << k; mask++) {
    const t = Array.from({ length: k }, (_, j) => (mask >> j) & 1)
    if (termOrder(t) <= maxOrder) terms.push(t)
  }
  return terms.sort((a, b) => termOrder(a) - termOrder(b) || termKey(b).localeCompare(termKey(a)))
}

export function termValue(t: Term, x: number[]): number {
  let v = 1
  for (let j = 0; j < t.length; j++) if (t[j]) v *= t[j] === 1 ? x[j] : x[j] ** t[j]
  return v
}

/** True when `parent` is contained in `child` (A ⊂ AB, A ⊂ A²). */
export function contains(child: Term, parent: Term): boolean {
  return child.every((p, j) => p >= parent[j]) && termKey(child) !== termKey(parent)
}

/** Adds every lower-order term that a hierarchical model needs (AB needs A and B; A² needs A). */
export function withHierarchy(terms: Term[]): Term[] {
  const out = new Map(terms.map((t) => [termKey(t), t]))
  for (const t of terms) {
    // Every sub-term obtained by lowering powers, excluding the intercept.
    const ranges = t.map((p) => p + 1)
    const total = ranges.reduce((a, b) => a * b, 1)
    for (let i = 0; i < total; i++) {
      let r = i
      const sub = ranges.map((n) => {
        const v = r % n
        r = Math.floor(r / n)
        return v
      })
      if (termOrder(sub) > 0) out.set(termKey(sub), sub)
    }
  }
  return sortTerms([...out.values()])
}

export function sortTerms(terms: Term[]): Term[] {
  const kind = (t: Term) => (t.some((p) => p > 1) ? 2 : termOrder(t) === 1 ? 0 : 1)
  return [...terms].sort((a, b) => kind(a) - kind(b) || termOrder(a) - termOrder(b) || termKey(b).localeCompare(termKey(a)))
}
