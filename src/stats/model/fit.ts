import { fSurvival, tQuantile, tTwoSidedP } from '../distributions'
import { crossProduct, dot, independentColumns, inverse, matVec, transpose, type Matrix } from '../linalg'
import { termName, termValue, type Term } from './terms'

export interface FitInput {
  /** Coded factor settings, one row per observation. */
  x: number[][]
  y: number[]
  terms: Term[]
  /** Block label per observation; blocks enter the model as a fixed effect. */
  blocks?: number[]
  /** Display names for factors (defaults to A, B, C…). */
  factorNames?: string[]
}

export interface Coefficient {
  /** null for the intercept. */
  term: Term | null
  name: string
  estimate: number
  se: number | null
  t: number | null
  p: number | null
  /** Two-level terms: the effect, i.e. the change from low to high (2 × coefficient). */
  effect: number | null
}

export interface AnovaRow {
  source: string
  df: number
  ss: number
  ms: number
  f: number | null
  p: number | null
  /** Set on per-term rows. */
  term?: Term
}

export interface Prediction {
  fit: number
  se: number | null
  /** 95% confidence interval for the mean response. */
  ci: [number, number] | null
  /** 95% prediction interval for a single new observation. */
  pi: [number, number] | null
  /** x'(X'X)⁻¹x, used for confirmation intervals. */
  leverage: number
}

export interface Fit {
  n: number
  /** Terms the design could estimate, in model order. */
  terms: Term[]
  /** Terms dropped because the design can't separate them from earlier terms. */
  aliased: Term[]
  coefficients: Coefficient[]
  anova: {
    blocks: AnovaRow | null
    model: AnovaRow
    terms: AnovaRow[]
    residual: AnovaRow
    lackOfFit: AnovaRow | null
    pureError: AnovaRow | null
    total: AnovaRow
  }
  dfError: number
  mse: number | null
  s: number | null
  rSquared: number
  adjRSquared: number | null
  predRSquared: number | null
  fitted: number[]
  residuals: number[]
  leverage: number[]
  /** Residual / (s√(1−h)); null where undefined. */
  standardized: (number | null)[]
  cooks: (number | null)[]
  predict: (x: number[], confidence?: number) => Prediction
}

const nullable = (v: number) => (Number.isFinite(v) ? v : null)

function blockColumns(blocks: number[] | undefined): { cols: (row: number) => number[]; count: number } {
  if (!blocks) return { cols: () => [], count: 0 }
  const levels = [...new Set(blocks)].sort((a, b) => a - b)
  const b = levels.length
  // Sum-to-zero coding: predictions at a "zero" block row are the average over blocks.
  return {
    count: Math.max(0, b - 1),
    cols: (i: number) => levels.slice(0, -1).map((lv) => (blocks[i] === lv ? 1 : blocks[i] === levels[b - 1] ? -1 : 0)),
  }
}

interface Ols {
  beta: number[]
  sse: number
  xtxInv: Matrix
}

function ols(x: Matrix, y: number[]): Ols | null {
  const xtxInv = inverse(crossProduct(x))
  if (!xtxInv) return null
  const beta = matVec(xtxInv, matVec(transpose(x), y))
  let sse = 0
  x.forEach((row, i) => (sse += (y[i] - dot(row, beta)) ** 2))
  return { beta, sse, xtxInv }
}

const isTwoLevelTerm = (t: Term) => t.every((p) => p <= 1)

/**
 * Ordinary least squares fit with the ANOVA, fit statistics and diagnostics a DOE analysis reports.
 * Term sums of squares are adjusted (each term entered last), which equals the sequential
 * sums of squares for orthogonal designs.
 */
export function fitModel(input: FitInput): Fit {
  const { x, y } = input
  const n = y.length
  if (x.length !== n) throw new Error('x and y must have the same number of rows')
  const names = input.factorNames
  const blk = blockColumns(input.blocks)

  // Drop terms the design can't estimate (aliased with intercept, blocks or earlier terms).
  const allCols = (row: number[], i: number, terms: Term[]) => [1, ...blk.cols(i), ...terms.map((t) => termValue(t, row))]
  const candidate = x.map((row, i) => allCols(row, i, input.terms))
  const keep = new Set(independentColumns(candidate))
  const lead = 1 + blk.count
  for (let j = 0; j < lead; j++) if (!keep.has(j)) throw new Error('The blocks are confounded with each other or with the mean')
  const terms = input.terms.filter((_, j) => keep.has(lead + j))
  const aliased = input.terms.filter((_, j) => !keep.has(lead + j))

  const X = x.map((row, i) => allCols(row, i, terms))
  const p = X[0].length
  const full = ols(X, y)
  if (!full) throw new Error('The model matrix is singular')
  const dfError = n - p
  const mse = dfError > 0 ? full.sse / dfError : null
  const s = mse === null ? null : Math.sqrt(mse)

  const mean = y.reduce((a, b) => a + b, 0) / n
  const sst = y.reduce((a, v) => a + (v - mean) ** 2, 0)

  const subsetSse = (drop: (col: number) => boolean): number => {
    const cols = [...Array(p).keys()].filter((c) => !drop(c))
    const fitR = ols(
      X.map((r) => cols.map((c) => r[c])),
      y,
    )
    return fitR ? fitR.sse : sst
  }

  const fTest = (ss: number, df: number): Pick<AnovaRow, 'f' | 'p'> => {
    if (mse === null || mse <= 0 || df <= 0) return { f: null, p: null }
    const f = ss / df / mse
    return { f, p: fSurvival(f, df, dfError) }
  }

  // Blocks (sequential, entered first) and the model adjusted for blocks.
  const sseBlocksOnly = blk.count ? subsetSse((c) => c >= lead) : sst
  const blocksRow: AnovaRow | null = blk.count
    ? { source: 'Blocks', df: blk.count, ss: sst - sseBlocksOnly, ms: (sst - sseBlocksOnly) / blk.count, ...fTest(sst - sseBlocksOnly, blk.count) }
    : null
  const ssModel = sseBlocksOnly - full.sse
  const dfModel = terms.length
  const modelRow: AnovaRow = { source: 'Model', df: dfModel, ss: ssModel, ms: dfModel ? ssModel / dfModel : 0, ...fTest(ssModel, dfModel) }

  const termRows: AnovaRow[] = terms.map((t, j) => {
    const ss = subsetSse((c) => c === lead + j) - full.sse
    return { source: termName(t, names), df: 1, ss, ms: ss, ...fTest(ss, 1), term: t }
  })

  // Lack of fit against pure error from repeated settings (within block).
  const groups = new Map<string, number[]>()
  x.forEach((row, i) => {
    const key = row.map((v) => v.toFixed(9)).join('|') + '#' + (input.blocks?.[i] ?? '')
    groups.set(key, [...(groups.get(key) ?? []), y[i]])
  })
  let ssPe = 0
  for (const g of groups.values()) {
    const m = g.reduce((a, b) => a + b, 0) / g.length
    ssPe += g.reduce((a, v) => a + (v - m) ** 2, 0)
  }
  const dfPe = n - groups.size
  const dfLof = dfError - dfPe
  let lackOfFit: AnovaRow | null = null
  let pureError: AnovaRow | null = null
  if (dfPe > 0 && dfLof > 0) {
    const ssLof = full.sse - ssPe
    const msPe = ssPe / dfPe
    const f = msPe > 0 ? ssLof / dfLof / msPe : null
    lackOfFit = { source: 'Lack of fit', df: dfLof, ss: ssLof, ms: ssLof / dfLof, f, p: f === null ? null : fSurvival(f, dfLof, dfPe) }
    pureError = { source: 'Pure error', df: dfPe, ss: ssPe, ms: msPe, f: null, p: null }
  }

  const coefficients: Coefficient[] = []
  const coefFor = (col: number, term: Term | null): Coefficient => {
    const estimate = full.beta[col]
    const se = mse === null ? null : Math.sqrt(mse * full.xtxInv[col][col])
    const t = se ? estimate / se : null
    return {
      term,
      name: term ? termName(term, names) : 'Intercept',
      estimate,
      se,
      t,
      p: t === null ? null : tTwoSidedP(t, dfError),
      effect: term && isTwoLevelTerm(term) ? 2 * estimate : null,
    }
  }
  coefficients.push(coefFor(0, null))
  terms.forEach((t, j) => coefficients.push(coefFor(lead + j, t)))

  const fitted = X.map((r) => dot(r, full.beta))
  const residuals = y.map((v, i) => v - fitted[i])
  const leverage = X.map((r) => dot(r, matVec(full.xtxInv, r)))
  const standardized = residuals.map((e, i) => (s && leverage[i] < 1 - 1e-9 ? e / (s * Math.sqrt(1 - leverage[i])) : null))
  const cooks = standardized.map((r, i) => (r === null ? null : (r * r * leverage[i]) / (p * (1 - leverage[i]))))

  let press = 0
  let pressOk = true
  residuals.forEach((e, i) => {
    if (leverage[i] >= 1 - 1e-9) pressOk = false
    else press += (e / (1 - leverage[i])) ** 2
  })

  const rSquared = sst > 0 ? 1 - full.sse / sst : 1
  const adjRSquared = dfError > 0 && sst > 0 ? 1 - full.sse / dfError / (sst / (n - 1)) : null
  const predRSquared = pressOk && sst > 0 ? 1 - press / sst : null

  const predict = (point: number[], confidence = 0.95): Prediction => {
    const row = [1, ...new Array(blk.count).fill(0), ...terms.map((t) => termValue(t, point))]
    const fit = dot(row, full.beta)
    const h = dot(row, matVec(full.xtxInv, row))
    if (mse === null) return { fit, se: null, ci: null, pi: null, leverage: h }
    const tq = tQuantile(1 - (1 - confidence) / 2, dfError)
    const se = Math.sqrt(mse * h)
    const sePred = Math.sqrt(mse * (1 + h))
    return { fit, se, ci: [fit - tq * se, fit + tq * se], pi: [fit - tq * sePred, fit + tq * sePred], leverage: h }
  }

  return {
    n,
    terms,
    aliased,
    coefficients,
    anova: {
      blocks: blocksRow,
      model: modelRow,
      terms: termRows,
      residual: { source: 'Residual', df: dfError, ss: full.sse, ms: mse ?? NaN, f: null, p: null },
      lackOfFit,
      pureError,
      total: { source: 'Total', df: n - 1, ss: sst, ms: sst / (n - 1), f: null, p: null },
    },
    dfError,
    mse: mse === null ? null : nullable(mse),
    s,
    rSquared,
    adjRSquared,
    predRSquared,
    fitted,
    residuals,
    leverage,
    standardized,
    cooks,
    predict,
  }
}
