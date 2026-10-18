import { fitModel, type AnovaRow, type Coefficient, type Fit, type FitInput } from './fit'
import { termKey, type Term } from './terms'

export interface SplitPlotInput extends Omit<FitInput, 'blocks'> {
  /** Whole-plot label per observation (runs sharing one setting of the hard-to-change factors). */
  wholePlots: number[]
  /** Indices of the hard-to-change factors. */
  hardToChange: number[]
}

export interface Stratum {
  df: number
  ms: number | null
}

export type SplitPlotResult =
  | {
      ok: true
      /** Ordinary least squares fit; its coefficients equal the split-plot estimates for a balanced design. */
      fit: Fit
      wholePlotError: Stratum
      subplotError: Stratum
      /** Terms tested against whole-plot error, then those tested against subplot error. */
      rows: (AnovaRow & { stratum: 'whole' | 'sub' })[]
      coefficients: (Coefficient & { stratum: 'whole' | 'sub' | null })[]
    }
  | { ok: false; reason: string }

/** A term belongs to the whole plot when it involves only hard-to-change factors. */
export function isWholePlotTerm(t: Term, hardToChange: number[]): boolean {
  return t.every((p, j) => p === 0 || hardToChange.includes(j))
}

/**
 * Split-plot analysis for a balanced design (equal whole-plot sizes, hard-to-change factors
 * constant within each whole plot). Whole-plot terms are tested on whole-plot means against the
 * variation between whole plots; subplot terms are tested within whole plots. This is the classic
 * two-stratum analysis, which matches REML for balanced designs.
 */
export function splitPlotAnalysis(input: SplitPlotInput): SplitPlotResult {
  const { x, y, wholePlots, hardToChange } = input
  const ids = [...new Set(wholePlots)]
  const members = ids.map((id) => wholePlots.flatMap((w, i) => (w === id ? [i] : [])))
  const m = members[0]?.length ?? 0
  if (members.some((g) => g.length !== m)) {
    return { ok: false, reason: 'Whole plots have different numbers of runs (for example after an aborted run), so the split-plot analysis is not exact.' }
  }
  for (const g of members) {
    for (const j of hardToChange) {
      if (g.some((i) => x[i][j] !== x[g[0]][j])) return { ok: false, reason: 'A hard-to-change factor varies within a whole plot.' }
    }
  }

  const wpTerms = input.terms.filter((t) => isWholePlotTerm(t, hardToChange))
  const spTerms = input.terms.filter((t) => !isWholePlotTerm(t, hardToChange))
  const fit = fitModel({ x, y, terms: input.terms, factorNames: input.factorNames })

  // Whole-plot stratum: regress whole-plot means on the whole-plot terms.
  const means = members.map((g) => g.reduce((a, i) => a + y[i], 0) / m)
  const wpX = members.map((g) => x[g[0]])
  const wpFit = fitModel({ x: wpX, y: means, terms: wpTerms, factorNames: input.factorNames })
  const wpDf = wpFit.dfError
  if (wpDf < 1) {
    return {
      ok: false,
      reason: 'There are too few whole plots to estimate whole-plot error. Each hard-to-change setting needs to be run in at least two separate whole plots.',
    }
  }

  // Subplot stratum: whole plots enter as fixed blocks, absorbing every whole-plot term.
  const spFit = fitModel({ x, y, terms: spTerms, blocks: wholePlots, factorNames: input.factorNames })

  const rows: (AnovaRow & { stratum: 'whole' | 'sub' })[] = [
    ...wpFit.anova.terms.map((r) => ({ ...r, ss: r.ss * m, ms: r.ms * m, stratum: 'whole' as const })),
    ...spFit.anova.terms.map((r) => ({ ...r, stratum: 'sub' as const })),
  ]

  const wpCoef = new Map(wpFit.coefficients.map((c) => [c.term ? termKey(c.term) : '', c]))
  const spCoef = new Map(spFit.coefficients.filter((c) => c.term).map((c) => [termKey(c.term!), c]))
  const coefficients = fit.coefficients.map((c) => {
    const key = c.term ? termKey(c.term) : ''
    const fromWp = wpCoef.get(key)
    if (!c.term || isWholePlotTerm(c.term, hardToChange)) {
      return { ...c, se: fromWp?.se ?? null, t: fromWp?.t ?? null, p: fromWp?.p ?? null, stratum: c.term ? ('whole' as const) : null }
    }
    const fromSp = spCoef.get(key)
    return { ...c, se: fromSp?.se ?? null, t: fromSp?.t ?? null, p: fromSp?.p ?? null, stratum: 'sub' as const }
  })

  return {
    ok: true,
    fit,
    wholePlotError: { df: wpDf, ms: wpFit.mse === null ? null : wpFit.mse * m },
    subplotError: { df: spFit.dfError, ms: spFit.mse },
    rows,
    coefficients,
  }
}
