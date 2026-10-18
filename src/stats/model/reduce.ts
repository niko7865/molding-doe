import { lenth } from './effects'
import { fitModel, type Fit, type FitInput } from './fit'
import { contains, termKey, termName, withHierarchy, type Term } from './terms'

export interface ReductionStep {
  term: string
  p: number | null
  reason: string
}

export interface Reduction {
  fit: Fit
  terms: Term[]
  steps: ReductionStep[]
  /** How terms were chosen. */
  method: 'backward' | 'lenth' | 'none'
  warnings: string[]
}

/**
 * Alpha-to-remove. 0.10 rather than 0.05 keeps borderline effects in the model by default,
 * which suits noisy molding responses; the user can still toggle any term off.
 */
export const DEFAULT_ALPHA = 0.1

/**
 * Picks model terms automatically while keeping the model hierarchical (a term stays whenever
 * a higher-order term containing it stays). With error degrees of freedom this is backward
 * elimination on p-values; for a saturated two-level design it uses Lenth's method on the effects.
 */
export function reduceModel(input: FitInput, alpha = DEFAULT_ALPHA): Reduction {
  const steps: ReductionStep[] = []
  const warnings: string[] = []
  let fit = fitModel(input)
  let terms = fit.terms

  if (fit.dfError === 0) {
    const twoLevel = terms.every((t) => t.every((p) => p <= 1))
    if (!twoLevel || terms.length < 3) {
      warnings.push('No degrees of freedom are left for error, so terms could not be tested. Remove terms by hand or add runs.')
      return { fit, terms, steps, method: 'none', warnings }
    }
    const effects = fit.coefficients.filter((c) => c.term).map((c) => ({ term: c.term!, effect: c.effect! }))
    const { me } = lenth(effects.map((e) => e.effect), alpha)
    const active = effects.filter((e) => Math.abs(e.effect) > me).map((e) => e.term)
    if (active.length === 0) {
      warnings.push("Lenth's method found no active effects; keeping the largest main effects is not justified by the data.")
    }
    const kept = withHierarchy(active)
    const keptKeys = new Set(kept.map(termKey))
    for (const e of effects) {
      if (!keptKeys.has(termKey(e.term))) steps.push({ term: termName(e.term, input.factorNames), p: null, reason: `|effect| ${Math.abs(e.effect).toPrecision(3)} below Lenth margin ${me.toPrecision(3)}` })
    }
    terms = kept
    fit = fitModel({ ...input, terms })
    return { fit, terms, steps, method: 'lenth', warnings }
  }

  for (;;) {
    const removable = fit.anova.terms.filter((row) => !terms.some((other) => contains(other, row.term!)))
    const worst = removable.filter((r) => r.p !== null).sort((a, b) => b.p! - a.p!)[0]
    if (!worst || worst.p! <= alpha || terms.length <= 1) break
    steps.push({ term: worst.source, p: worst.p, reason: `p = ${worst.p!.toFixed(3)} > ${alpha}` })
    terms = terms.filter((t) => termKey(t) !== termKey(worst.term!))
    fit = fitModel({ ...input, terms })
  }
  return { fit, terms, steps, method: 'backward', warnings }
}
