import {
  confirmationCheck,
  curvatureTest,
  factorialTerms,
  fitModel,
  fractionDefective,
  fromCoded,
  isAllOrNothing,
  optimize,
  reduceModel,
  splitPlotAnalysis,
  standardTerms,
  summarizeCavities,
  termKey,
  termName,
  type ConfirmationResult,
  type CurvatureTest,
  type Fit,
  type FitInput,
  type Goal,
  type OptimumResult,
  type Prediction,
  type Reduction,
  type Region,
  type ResponseGoal,
  type SplitPlotResult,
  type Term,
} from '../stats'
import type { Response, Run, SeriesSettings, Study } from './schema'
import { toDisplay, type Quantity } from './units'

/** One analyzable column: a response, or a per-cavity summary of one. */
export interface Series {
  key: string
  label: string
  responseId: string
  stat: 'value' | 'mean' | 'sd' | 'cavity'
  cavity?: number
  /** Unit of the analyzed values (stored metric; analyzed in the study's display units). Fractions and ratings have none. */
  quantity: Quantity
  kind: Response['kind']
}

export function seriesList(study: Study): Series[] {
  const out: Series[] = []
  for (const r of study.responses) {
    const quantity: Quantity = r.kind === 'continuous' ? r.quantity : 'none'
    const base = { responseId: r.id, quantity, kind: r.kind }
    const what = r.kind === 'passfail' ? `${r.name} (fraction defective)` : r.name
    if (!r.perCavity || study.cavities === 1) {
      out.push({ ...base, key: `${r.id}:value`, label: what, stat: 'value' })
      continue
    }
    out.push({ ...base, key: `${r.id}:mean`, label: `${what}, cavity mean`, stat: 'mean' })
    out.push({ ...base, key: `${r.id}:sd`, label: `${what}, spread across cavities (SD)`, stat: 'sd' })
    for (let c = 0; c < study.cavities; c++) out.push({ ...base, key: `${r.id}:c${c + 1}`, label: `${what}, cavity ${c + 1}`, stat: 'cavity', cavity: c })
  }
  return out
}

export function seriesValue(run: Run, series: Series, response: Response): number | null {
  const raw = run.results[response.id] ?? []
  const values = response.kind === 'passfail' ? raw.map((v) => (v === null ? null : fractionDefective(v, response.shots ?? 1))) : raw
  switch (series.stat) {
    case 'value':
      return series.cavity !== undefined ? (values[series.cavity] ?? null) : response.perCavity ? summarizeCavities(values).mean : (values[0] ?? null)
    case 'cavity':
      return values[series.cavity ?? 0] ?? null
    case 'mean':
      return summarizeCavities(values).mean
    case 'sd':
      return summarizeCavities(values).sd
  }
}

export interface SeriesData {
  x: number[][]
  /** In the study's display units, so coefficients and predictions read in the units people use. */
  y: number[]
  runs: Run[]
  blocks?: number[]
  wholePlots?: number[]
  /** Runs left out: aborted, not done, or missing this value. */
  excluded: number
}

export function seriesData(study: Study, series: Series): SeriesData {
  const response = study.responses.find((r) => r.id === series.responseId)!
  const runs: Run[] = []
  const y: number[] = []
  for (const r of [...study.runs].sort((a, b) => a.order - b.order)) {
    if (r.status !== 'done' || !r.coded || r.archived) continue
    const v = seriesValue(r, series, response)
    if (v === null || !Number.isFinite(v)) continue
    runs.push(r)
    y.push(toDisplay(v, series.quantity, study.units))
  }
  const blocks = runs.map((r) => r.block ?? 1)
  const wholePlots = runs.map((r) => r.wholePlot ?? 0)
  return {
    x: runs.map((r) => r.coded!),
    y,
    runs,
    blocks: new Set(blocks).size > 1 ? blocks : undefined,
    wholePlots: runs.every((r) => r.wholePlot) ? wholePlots : undefined,
    excluded: study.runs.filter((r) => !r.archived).length - runs.length,
  }
}

/** The starting model for the design: what the design was built to estimate. */
export function candidateTerms(study: Study): Term[] {
  const k = study.design?.factorIds.length ?? study.factors.length
  switch (study.design?.type) {
    case 'box-behnken':
    case 'central-composite':
      return standardTerms(k, 'quadratic')
    case 'plackett-burman':
      return standardTerms(k, 'linear')
    case 'fractional-factorial':
      return standardTerms(k, 'interactions')
    default:
      return factorialTerms(k, Math.min(k, 4))
  }
}

export function factorNames(study: Study): string[] {
  const ids = study.design?.factorIds ?? study.factors.map((f) => f.id)
  return ids.map((id) => study.factors.find((f) => f.id === id)?.name ?? '?')
}

export interface SeriesAnalysis {
  series: Series
  data: SeriesData
  candidates: Term[]
  fit: Fit
  reduction: Reduction | null
  splitPlot: SplitPlotResult | null
  curvature: CurvatureTest | null
  warnings: string[]
}

export function settingsFor(study: Study, key: string): SeriesSettings {
  return study.analysis?.series[key] ?? { auto: true }
}

export function analyzeSeries(study: Study, series: Series): SeriesAnalysis {
  const data = seriesData(study, series)
  const candidates = candidateTerms(study)
  const settings = settingsFor(study, series.key)
  const warnings: string[] = []
  if (data.y.length < 3) {
    const earlier = study.runs.filter((r) => r.archived && r.status === 'done').length
    if (earlier > 0) throw new Error(`The design moved to a new region. ${earlier} finished run${earlier === 1 ? ' is' : 's are'} from earlier ranges and left out; finish runs in the new region to analyze it.`)
  }
  if (data.y.length < 3) throw new Error(`Only ${data.y.length} finished run${data.y.length === 1 ? ' has' : 's have'} this value, which is too few to analyze.`)
  if (data.excluded > 0) warnings.push(`${data.excluded} run${data.excluded === 1 ? ' is' : 's are'} left out (not done, aborted, or missing this value).`)
  if ((series.kind === 'rating' || series.kind === 'passfail') && isAllOrNothing(data.y)) {
    warnings.push('This defect never changes across the runs, so the model can’t learn anything from it.')
  }

  const names = factorNames(study)
  const input: FitInput = { x: data.x, y: data.y, terms: candidates, blocks: data.blocks, factorNames: names }
  let reduction: Reduction | null = null
  let fit: Fit
  if (settings.auto) {
    reduction = reduceModel(input)
    fit = reduction.fit
    warnings.push(...reduction.warnings)
  } else {
    const keys = new Set(settings.terms ?? candidates.map(termKey))
    const terms = candidates.filter((t) => keys.has(termKey(t)))
    fit = fitModel({ ...input, terms })
  }
  if (fit.aliased.length) {
    warnings.push(`Not estimable separately (aliased): ${fit.aliased.map((t) => termName(t, names)).join(', ')}.`)
  }

  const htc = (study.design?.factorIds ?? []).flatMap((id, j) => (study.factors.find((f) => f.id === id)?.hardToChange ? [j] : []))
  let splitPlot: SplitPlotResult | null = null
  if (htc.length && data.wholePlots) {
    splitPlot = data.blocks
      ? { ok: false, reason: 'Split-plot analysis with blocks is not supported; the tests below treat runs as fully randomized.' }
      : splitPlotAnalysis({ x: data.x, y: data.y, terms: fit.terms, wholePlots: data.wholePlots, hardToChange: htc, factorNames: names })
  }

  let curvature: CurvatureTest | null = null
  const twoLevel = study.design?.type === 'full-factorial' || study.design?.type === 'fractional-factorial' || study.design?.type === 'plackett-burman'
  if (twoLevel) {
    const centers = data.runs.flatMap((r, i) => (r.kind === 'center' ? [data.y[i]] : []))
    const corners = data.runs.flatMap((r, i) => (r.kind !== 'center' ? [data.y[i]] : []))
    curvature = curvatureTest(corners, centers)
  }

  return { series, data, candidates, fit, reduction, splitPlot, curvature, warnings }
}

/** The tested region in coded units; a rotatable CCD is only supported inside its sphere. */
export function designRegion(study: Study): Region {
  const k = study.design?.factorIds.length ?? 0
  const coded = study.runs.flatMap((r) => (r.coded && !r.archived ? [r.coded] : []))
  const bounds = Array.from({ length: k }, (_, j): [number, number] => {
    const v = coded.map((c) => c[j])
    return [Math.min(-1, ...v), Math.max(1, ...v)]
  })
  if (study.design?.type === 'central-composite' && study.design.alpha !== 'face-centered') {
    return { bounds, radius: Math.max(...bounds.map((b) => b[1])) }
  }
  return { bounds }
}

/** Coded point → factor id → actual setpoint (metric). */
export function decode(study: Study, coded: number[]): Record<string, number> {
  const ids = study.design?.factorIds ?? []
  return Object.fromEntries(
    ids.map((id, j) => {
      const f = study.factors.find((x) => x.id === id)!
      return [id, fromCoded(coded[j], f.low, f.high)]
    }),
  )
}

export interface OptimizedSeries {
  series: Series
  goal: ResponseGoal
  prediction: Prediction
  desirability: number
}

export interface OptimizationOutcome {
  result: OptimumResult
  settings: Record<string, number>
  items: OptimizedSeries[]
}

/** Goals are stored metric; the models predict in display units, so convert the limits. */
function goalToDisplay(goal: Goal, q: Quantity, study: Study): Goal {
  const d = (v: number) => toDisplay(v, q, study.units)
  switch (goal.kind) {
    case 'none':
      return goal
    case 'target':
      return { kind: 'target', low: d(goal.low), target: d(goal.target), high: d(goal.high) }
    default:
      return { kind: goal.kind, low: d(goal.low), high: d(goal.high) }
  }
}

export function goalsInUse(study: Study): { series: Series; goal: ResponseGoal }[] {
  return seriesList(study).flatMap((series) => {
    const s = settingsFor(study, series.key)
    if (!s.goal || s.goal.kind === 'none') return []
    return [{ series, goal: { goal: goalToDisplay(s.goal, series.quantity, study), importance: s.importance ?? 3 } }]
  })
}

export function optimizeStudy(study: Study, fixed?: (number | null)[]): OptimizationOutcome {
  const used = goalsInUse(study)
  if (!used.length) throw new Error('Set a goal for at least one response.')
  const fits = used.map((u) => analyzeSeries(study, u.series).fit)
  const result = optimize({
    predict: fits.map((f) => (x: number[]) => f.predict(x).fit),
    goals: used.map((u) => u.goal),
    region: designRegion(study),
    fixed,
    seed: study.design?.seed ?? 1,
  })
  return {
    result,
    settings: decode(study, result.x),
    items: used.map((u, i) => ({ series: u.series, goal: u.goal, prediction: fits[i].predict(result.x), desirability: result.individual[i] })),
  }
}

export interface ConfirmationOutcome {
  series: Series
  predicted: number
  check: ConfirmationResult | null
  error?: string
}

export function confirmStudy(study: Study): ConfirmationOutcome[] {
  const x = study.analysis?.optimum
  const conf = study.analysis?.confirmation
  if (!x || !conf) return []
  return goalsInUse(study).map(({ series }) => {
    const fit = analyzeSeries(study, series).fit
    const p = fit.predict(x)
    const observed = (conf.values[series.key] ?? []).flatMap((v) => (v === null ? [] : [toDisplay(v, series.quantity, study.units)]))
    if (!observed.length) return { series, predicted: p.fit, check: null }
    if (fit.mse === null) return { series, predicted: p.fit, check: null, error: 'The model has no error degrees of freedom, so it gives no interval.' }
    return { series, predicted: p.fit, check: confirmationCheck(p.fit, p.leverage, fit.mse, fit.dfError, observed) }
  })
}
