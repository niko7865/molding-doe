import { useMemo, useState } from 'react'
import {
  contains,
  fitModel,
  halfNormalPoints,
  lenth,
  normalPoints,
  termKey,
  termName,
  tQuantile,
  toCoded,
  withHierarchy,
  type AnovaRow,
  type Fit,
  type Term,
} from '../stats'
import {
  analyzeSeries,
  confirmStudy,
  decode,
  designRegion,
  factorNames,
  goalsInUse,
  optimizeStudy,
  seriesData,
  seriesList,
  settingsFor,
  type OptimizationOutcome,
  type Series,
  type SeriesAnalysis,
} from '../study/analysis'
import { checkMachineLimits } from '../study/presets'
import type { Factor, SeriesSettings, Study } from '../study/schema'
import { fromDisplay, unitLabel } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { fmt } from './chartUtils'
import { ContourChart, LinePanels, ParetoChart, ScatterChart, SurfaceChart, type LinePanel } from './charts'
import { formatValue } from './format'
import { NumberField } from './NumberField'

type View = 'model' | 'optimize' | 'confirm'

const p = (v: number | null) => (v === null ? '–' : v < 0.0001 ? '<0.0001' : v.toFixed(4))
const num = (v: number | null) => (v === null ? '–' : fmt(v))
const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`)

function patchSeries(ws: Workspace, key: string, patch: Partial<SeriesSettings>) {
  ws.update((s) => {
    const a = s.analysis ?? { series: {} }
    const current = a.series[key] ?? { auto: true }
    return { ...s, analysis: { ...a, series: { ...a.series, [key]: { ...current, ...patch } } } }
  })
}

function designFactors(study: Study): Factor[] {
  return (study.design?.factorIds ?? []).map((id) => study.factors.find((f) => f.id === id)!)
}

/** "Melt temperature (°C)" */
function factorLabel(f: Factor, study: Study): string {
  const u = unitLabel(f.quantity, study.units)
  return u ? `${f.name} (${u})` : f.name
}

function seriesUnit(series: Series, study: Study): string {
  return series.kind === 'passfail' ? 'fraction' : series.kind === 'rating' ? 'rating 1–5' : unitLabel(series.quantity, study.units)
}

function SeriesPicker({ study, value, onChange }: { study: Study; value: string; onChange: (key: string) => void }) {
  return (
    <label className="field grow">
      <span>Response</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {seriesList(study).map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TermPicker({ a, names, ws }: { a: SeriesAnalysis; names: string[]; ws: Workspace }) {
  const inModel = new Set(a.fit.terms.map(termKey))
  const aliased = new Set(a.fit.aliased.map(termKey))
  const toggle = (t: Term) => {
    const key = termKey(t)
    let next: Term[]
    if (inModel.has(key) || aliased.has(key)) {
      // Removing a term also removes the higher-order terms built on it, keeping the model hierarchical.
      next = [...a.fit.terms, ...a.fit.aliased].filter((x) => termKey(x) !== key && !contains(x, t))
    } else {
      next = withHierarchy([...a.fit.terms, ...a.fit.aliased, t])
    }
    patchSeries(ws, a.series.key, { auto: false, terms: next.map(termKey) })
  }
  return (
    <fieldset className="field">
      <legend>Terms in the model</legend>
      <div className="terms">
        {a.candidates.map((t) => {
          const key = termKey(t)
          return (
            <label key={key} className={aliased.has(key) ? 'check aliased' : 'check'}>
              <input type="checkbox" checked={inModel.has(key) || aliased.has(key)} onChange={() => toggle(t)} />
              {termName(t, names)}
            </label>
          )
        })}
      </div>
      <p className="muted small">Adding a term also adds the lower-order terms it needs; removing one removes the terms built on it.</p>
    </fieldset>
  )
}

export function AnovaTable({ fit }: { fit: Fit }) {
  const a = fit.anova
  const rows: (AnovaRow & { indent?: boolean })[] = [
    ...(a.blocks ? [a.blocks] : []),
    a.model,
    ...a.terms.map((r) => ({ ...r, indent: true })),
    a.residual,
    ...(a.lackOfFit ? [{ ...a.lackOfFit, indent: true }] : []),
    ...(a.pureError ? [{ ...a.pureError, indent: true }] : []),
    a.total,
  ]
  return (
    <div className="table-wrap">
      <table>
        <caption>Analysis of variance</caption>
        <thead>
          <tr>
            <th>Source</th>
            <th className="num">DF</th>
            <th className="num">Sum of squares</th>
            <th className="num">Mean square</th>
            <th className="num">F</th>
            <th className="num">p</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.p !== null && r.p < 0.05 ? 'signif' : undefined}>
              <td className={r.indent ? 'indent' : undefined}>{r.source}</td>
              <td className="num">{r.df}</td>
              <td className="num">{fmt(r.ss)}</td>
              <td className="num">{r.df > 0 ? fmt(r.ms) : '–'}</td>
              <td className="num">{num(r.f)}</td>
              <td className="num">{p(r.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CoefficientTable({ fit, twoLevel }: { fit: Fit; twoLevel: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <caption>Coefficients (coded units)</caption>
        <thead>
          <tr>
            <th>Term</th>
            {twoLevel && <th className="num">Effect</th>}
            <th className="num">Coefficient</th>
            <th className="num">SE</th>
            <th className="num">t</th>
            <th className="num">p</th>
          </tr>
        </thead>
        <tbody>
          {fit.coefficients.map((c) => (
            <tr key={c.name} className={c.p !== null && c.p < 0.05 && c.term ? 'signif' : undefined}>
              <td>{c.name}</td>
              {twoLevel && <td className="num">{num(c.effect)}</td>}
              <td className="num">{fmt(c.estimate)}</td>
              <td className="num">{num(c.se)}</td>
              <td className="num">{num(c.t)}</td>
              <td className="num">{p(c.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EffectCharts({ a, study, names }: { a: SeriesAnalysis; study: Study; names: string[] }) {
  // Judge every candidate term, not just the kept ones, so the user sees what was dropped and why.
  const full = useMemo(
    () => fitModel({ x: a.data.x, y: a.data.y, terms: a.candidates, blocks: a.data.blocks, factorNames: names }),
    [a, names],
  )
  const active = new Set(a.fit.terms.map(termKey))
  const coefs = full.coefficients.filter((c) => c.term)
  const twoLevel = coefs.length > 0 && coefs.every((c) => c.effect !== null)
  const saturated = full.mse === null || full.dfError < 1
  if (!coefs.length) return null

  if (saturated && twoLevel) {
    const effects = coefs.map((c) => c.effect!)
    const l = lenth(effects)
    const half = halfNormalPoints(effects)
    const maxQ = Math.max(...half.map((h) => h.quantile))
    return (
      <div className="charts">
        <ParetoChart
          title="Pareto of effects"
          items={coefs.map((c) => ({ label: c.name, value: Math.abs(c.effect!), detail: fmt(c.effect!), active: active.has(termKey(c.term!)) }))}
          reference={l.me}
          referenceLabel={`Lenth ME ${fmt(l.me)}`}
          valueLabel={`|Effect| (${seriesUnit(a.series, study) || 'response units'})`}
        />
        <ScatterChart
          title="Half-normal plot of effects"
          points={half.map((h) => ({ x: h.value, y: h.quantile, label: coefs[h.index].name, highlight: active.has(termKey(coefs[h.index].term!)) }))}
          xLabel="|Effect|"
          yLabel="Half-normal quantile"
          line={[
            { x: 0, y: 0 },
            { x: maxQ * l.pse, y: maxQ },
          ]}
          labelHighlighted
        />
      </div>
    )
  }
  if (saturated) return <p className="muted">No error degrees of freedom are left in the full model, so effects can’t be ranked against noise.</p>
  const crit = tQuantile(0.975, full.dfError)
  return (
    <div className="charts">
      <ParetoChart
        title="Pareto of standardized effects"
        items={coefs.map((c) => ({ label: c.name, value: Math.abs(c.t ?? 0), detail: `t = ${num(c.t)}, p = ${p(c.p)}`, active: active.has(termKey(c.term!)) }))}
        reference={crit}
        referenceLabel={`p = 0.05 (t ${fmt(crit)})`}
        valueLabel="|t|"
      />
    </div>
  )
}

export function FactorPlots({ a, study, forReport }: { a: SeriesAnalysis; study: Study; forReport?: boolean }) {
  const factors = designFactors(study)
  const k = factors.length
  const quadratic = a.fit.terms.some((t) => t.some((v) => v > 1))
  const region = designRegion(study)
  const center = new Array(k).fill(0)
  const at = (j: number, v: number, base = center) => base.map((c, i) => (i === j ? v : c))
  const yLabel = seriesUnit(a.series, study)
  const lowHigh = (f: Factor): [string, string] => [formatValue(f.low, f.quantity, study, false), formatValue(f.high, f.quantity, study, false)]

  const xs = quadratic ? [-1, -0.5, 0, 0.5, 1] : [-1, 1]
  const main: LinePanel[] = factors.map((f, j) => ({ title: f.name, xs, series: [{ name: f.name, ys: xs.map((v) => a.fit.predict(at(j, v)).fit) }], xLabels: lowHigh(f) }))

  const interactions = a.fit.terms.filter((t) => t.filter((v) => v > 0).length === 2 && t.every((v) => v <= 1))
  const firstPair = interactions.length ? (interactions[0].flatMap((v, j) => (v ? [j] : [])) as [number, number]) : ([0, 1] as [number, number])
  const [pair, setPair] = useState<[number, number]>(firstPair)
  const [ia, ib] = pair[0] < k && pair[1] < k && pair[0] !== pair[1] ? pair : firstPair
  const interaction: LinePanel = {
    title: `${factors[ia].name} by ${factors[ib].name}`,
    xs,
    series: [-1, 1].map((b) => ({
      name: `${factors[ib].name} ${formatValue(b < 0 ? factors[ib].low : factors[ib].high, factors[ib].quantity, study)}`,
      ys: xs.map((v) => a.fit.predict(at(ia, v, at(ib, b))).fit),
    })),
    xLabels: lowHigh(factors[ia]),
  }

  const [axes, setAxes] = useState<[number, number]>([0, 1])
  const [ax, ay] = axes[0] < k && axes[1] < k && axes[0] !== axes[1] ? axes : [0, 1]
  const surfacePredict = (u: number, v: number) => a.fit.predict(at(ay, v, at(ax, u))).fit
  const optimum = study.analysis?.optimum
  const fmtAxis = (j: number) => (coded: number) => {
    const f = factors[j]
    return formatValue((f.low + f.high) / 2 + (coded * (f.high - f.low)) / 2, f.quantity, study, false)
  }
  const pairSelect = (value: [number, number], set: (v: [number, number]) => void, labels: [string, string]) => (
    <div className="row no-print">
      {[0, 1].map((side) => (
        <label key={side} className="field">
          <span>{labels[side]}</span>
          <select value={value[side]} onChange={(e) => set(side === 0 ? [Number(e.target.value), value[1]] : [value[0], Number(e.target.value)])}>
            {factors.map((f, j) => (
              <option key={f.id} value={j} disabled={j === value[1 - side]}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )

  return (
    <>
      <LinePanels title={k > 2 ? 'Main effects (other factors at their center)' : 'Main effects'} panels={main} yLabel={yLabel} />
      {k >= 2 && (
        <div className="grid-2">
          <div>
            {pairSelect([ia, ib], setPair, ['Interaction: across', 'Lines for'])}
            <LinePanels title="Interaction plot" panels={[interaction]} yLabel={yLabel} />
          </div>
          <div>
            {pairSelect([ax, ay], setAxes, ['Contour: horizontal', 'Vertical'])}
            <ContourChart
              title={k > 2 ? 'Predicted response (other factors at center)' : 'Predicted response'}
              predict={surfacePredict}
              xRange={region.bounds[ax]}
              yRange={region.bounds[ay]}
              xLabel={factorLabel(factors[ax], study)}
              yLabel={factorLabel(factors[ay], study)}
              points={a.data.x.map((x) => [x[ax], x[ay]])}
              format={(c, axis) => fmtAxis(axis === 'x' ? ax : ay)(c)}
              marker={optimum ? [optimum[ax], optimum[ay]] : undefined}
            />
          </div>
        </div>
      )}
      {quadratic && k >= 2 && !forReport && (
        <SurfaceChart title="Response surface" predict={surfacePredict} xRange={region.bounds[ax]} yRange={region.bounds[ay]} xLabel={factors[ax].name} yLabel={factors[ay].name} />
      )}
    </>
  )
}

export function ResidualPlots({ a, forReport }: { a: SeriesAnalysis; forReport?: boolean }) {
  const fit = a.fit
  if (fit.dfError < 1) return <p className="muted">The model uses every degree of freedom, so there are no residuals to check.</p>
  const order = a.data.runs.map((r) => r.order)
  const big = fit.standardized.flatMap((s, i) => (s !== null && Math.abs(s) > 3 ? [order[i]] : []))
  const label = (i: number) => `Run ${order[i]}`
  return (
    <>
      {big.length > 0 && (
        <p className="banner info">
          Run{big.length > 1 ? 's' : ''} {big.join(', ')} {big.length > 1 ? 'have' : 'has'} a standardized residual beyond ±3. Check the run notes for something unusual before trusting the model.
        </p>
      )}
      <div className="charts">
        <ScatterChart
          title="Normal plot of residuals"
          points={normalPoints(fit.residuals).map((pt) => ({ x: pt.value, y: pt.quantile, label: label(pt.index), highlight: true }))}
          xLabel="Residual"
          yLabel="Normal quantile"
        />
        <ScatterChart title="Residuals vs fitted" points={fit.residuals.map((r, i) => ({ x: fit.fitted[i], y: r, label: label(i), highlight: true }))} xLabel="Fitted value" yLabel="Residual" zeroLine />
        {!forReport && <ScatterChart title="Residuals vs run order" points={fit.residuals.map((r, i) => ({ x: order[i], y: r, label: label(i), highlight: true }))} xLabel="Run order" yLabel="Residual" zeroLine />}
      </div>
    </>
  )
}

function ModelView({ study, ws, seriesKey, setSeriesKey }: { study: Study; ws: Workspace; seriesKey: string; setSeriesKey: (k: string) => void }) {
  const series = seriesList(study).find((s) => s.key === seriesKey) ?? seriesList(study)[0]
  const names = useMemo(() => factorNames(study), [study])
  const result = useMemo(() => {
    try {
      return { a: analyzeSeries(study, series) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [study, series])
  const settings = settingsFor(study, series.key)

  return (
    <>
      <section className="card">
        <div className="row">
          <SeriesPicker study={study} value={series.key} onChange={setSeriesKey} />
          <label className="check">
            <input type="checkbox" checked={settings.auto} onChange={(e) => patchSeries(ws, series.key, e.target.checked ? { auto: true, terms: undefined } : { auto: false, terms: result.a?.fit.terms.map(termKey) })} />
            Pick terms automatically
          </label>
        </div>
        {'error' in result ? (
          <p className="muted">{result.error}</p>
        ) : (
          <ModelSummary a={result.a!} names={names} ws={ws} study={study} />
        )}
      </section>
      {result.a && (
        <>
          <section className="card">
            <h2>Effects</h2>
            <EffectCharts a={result.a} study={study} names={names} />
          </section>
          <section className="card">
            <h2>Factor plots</h2>
            <FactorPlots key={series.key} a={result.a} study={study} />
          </section>
          <section className="card">
            <h2>Residuals</h2>
            <ResidualPlots a={result.a} />
          </section>
        </>
      )}
    </>
  )
}

export function ModelSummary({ a, names, ws, study }: { a: SeriesAnalysis; names: string[]; ws?: Workspace; study: Study }) {
  const fit = a.fit
  const settings = settingsFor(study, a.series.key)
  const twoLevel = fit.coefficients.every((c) => !c.term || c.effect !== null)
  const sp = a.splitPlot
  return (
    <>
      {!settings.auto && ws && <TermPicker a={a} names={names} ws={ws} />}
      {!settings.auto && !ws && <p className="small">Terms chosen by hand.</p>}
      <dl className="stats">
        <div>
          <dt>Runs</dt>
          <dd>{fit.n}</dd>
        </div>
        <div>
          <dt>R²</dt>
          <dd>{pct(fit.rSquared)}</dd>
        </div>
        <div>
          <dt>Adjusted R²</dt>
          <dd>{pct(fit.adjRSquared)}</dd>
        </div>
        <div>
          <dt>Predicted R²</dt>
          <dd>{pct(fit.predRSquared)}</dd>
        </div>
        <div>
          <dt>S (noise)</dt>
          <dd>
            {num(fit.s)} <span className="unit">{seriesUnit(a.series, study)}</span>
          </dd>
        </div>
      </dl>
      {a.warnings.length > 0 && (
        <ul className="notes">
          {a.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {a.reduction && a.reduction.steps.length > 0 && (
        <details>
          <summary>
            {a.reduction.method === 'lenth' ? 'Terms judged with Lenth’s method' : 'Terms removed automatically'} ({a.reduction.steps.length})
          </summary>
          <ul className="notes">
            {a.reduction.steps.map((s) => (
              <li key={s.term}>
                {s.term}
                {s.p !== null ? ` (p = ${p(s.p)})` : ''}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {a.curvature && (
        <p>
          Curvature check: center points average {fmt(a.curvature.centerMean)} against {fmt(a.curvature.factorialMean)} at the corners
          {a.curvature.p !== null ? `, p = ${p(a.curvature.p)}. ` : '. '}
          {a.curvature.p === null
            ? 'Add at least two center points to test it.'
            : a.curvature.p < 0.05
              ? 'The response curves inside the range, so a response surface design (axial points) would model it better.'
              : 'No sign of curvature inside the range.'}
        </p>
      )}
      <CoefficientTable fit={fit} twoLevel={twoLevel} />
      <AnovaTable fit={fit} />
      {sp && !sp.ok && <p className="muted">{sp.reason}</p>}
      {sp?.ok && (
        <div className="table-wrap">
          <table>
            <caption>
              Split-plot tests: hard-to-change terms against whole-plot error (DF {sp.wholePlotError.df}), the rest against subplot error (DF {sp.subplotError.df})
            </caption>
            <thead>
              <tr>
                <th>Term</th>
                <th>Tested against</th>
                <th className="num">F</th>
                <th className="num">p</th>
              </tr>
            </thead>
            <tbody>
              {sp.rows.map((r) => (
                <tr key={r.source} className={r.p !== null && r.p < 0.05 ? 'signif' : undefined}>
                  <td>{r.source}</td>
                  <td>{r.stratum === 'whole' ? 'Whole plot' : 'Subplot'}</td>
                  <td className="num">{num(r.f)}</td>
                  <td className="num">{p(r.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const GOALS = [
  { kind: 'none', label: 'Ignore' },
  { kind: 'maximize', label: 'Maximize' },
  { kind: 'minimize', label: 'Minimize' },
  { kind: 'target', label: 'Target' },
] as const

function GoalEditor({ study, ws, series }: { study: Study; ws: Workspace; series: Series }) {
  const s = settingsFor(study, series.key)
  const goal = s.goal ?? { kind: 'none' as const }
  const q = series.quantity
  const setKind = (kind: (typeof GOALS)[number]['kind']) => {
    if (kind === 'none') return patchSeries(ws, series.key, { goal: { kind: 'none' } })
    // Start from the range that was actually observed, rounded outward to a readable step in display units.
    const y = seriesData(study, series).y
    const span = y.length ? Math.max(...y) - Math.min(...y) : 0
    const step = span > 0 ? 10 ** Math.floor(Math.log10(span / 50)) : 1
    const back = (v: number) => fromDisplay(Number(v.toPrecision(12)), q, study.units)
    const lo = y.length ? back(Math.floor(Math.min(...y) / step) * step) : 0
    const hi = y.length ? back(Math.ceil(Math.max(...y) / step) * step) : 1
    const prev = goal.kind === 'none' ? { low: lo, high: hi } : goal
    patchSeries(ws, series.key, {
      goal: kind === 'target' ? { kind, low: prev.low, high: prev.high, target: (prev.low + prev.high) / 2 } : { kind, low: prev.low, high: prev.high },
      importance: s.importance ?? 3,
    })
  }
  const setGoal = (patch: Record<string, number | undefined>) => {
    if (goal.kind === 'none') return
    const next = { ...goal }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, number | string>)[k] = v
    patchSeries(ws, series.key, { goal: next })
  }
  const field = (label: string, key: 'low' | 'high' | 'target', value: number) => (
    <NumberField label={label} value={value} quantity={q} units={study.units} onChange={(v) => setGoal({ [key]: v })} />
  )
  return (
    <div className="goal-row">
      <div className="field goal-name">
        <span>{series.label}</span>
        <select value={goal.kind} onChange={(e) => setKind(e.target.value as (typeof GOALS)[number]['kind'])} aria-label={`Goal for ${series.label}`}>
          {GOALS.map((g) => (
            <option key={g.kind} value={g.kind}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      {goal.kind === 'maximize' && (
        <>
          {field('Acceptable at least', 'low', goal.low)}
          {field('Ideal at or above', 'high', goal.high)}
        </>
      )}
      {goal.kind === 'minimize' && (
        <>
          {field('Ideal at or below', 'low', goal.low)}
          {field('Acceptable at most', 'high', goal.high)}
        </>
      )}
      {goal.kind === 'target' && (
        <>
          {field('Lowest acceptable', 'low', goal.low)}
          {field('Target', 'target', goal.target)}
          {field('Highest acceptable', 'high', goal.high)}
        </>
      )}
      {goal.kind !== 'none' && (
        <div className="field">
          <span>Importance</span>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={(s.importance ?? 3) === n ? 'active' : ''} aria-pressed={(s.importance ?? 3) === n} onClick={() => patchSeries(ws, series.key, { importance: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OptimizeView({ study, ws }: { study: Study; ws: Workspace }) {
  const factors = designFactors(study)
  const [hold, setHold] = useState<Record<string, number | undefined>>({})
  const [outcome, setOutcome] = useState<OptimizationOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const used = goalsInUse(study)
  const all = seriesList(study)
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? all : all.filter((s) => s.stat !== 'cavity')

  const run = () => {
    try {
      const fixed = factors.map((f) => (hold[f.id] === undefined ? null : toCoded(hold[f.id]!, f.low, f.high)))
      setOutcome(optimizeStudy(study, fixed))
      setError(null)
    } catch (e) {
      setOutcome(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const limits = outcome ? checkMachineLimits(study.factors, outcome.settings, study.machine) : []

  return (
    <>
      <section className="card">
        <h2>Goals</h2>
        <p className="muted small">Each response gets a desirability from 0 (unacceptable) to 1 (ideal). The optimizer finds the settings with the best combined desirability inside the tested range, weighted by importance.</p>
        {shown.map((s) => (
          <GoalEditor key={s.key} study={study} ws={ws} series={s} />
        ))}
        {all.some((s) => s.stat === 'cavity') && (
          <button className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide single cavities' : 'Show single cavities too'}
          </button>
        )}
      </section>
      <section className="card">
        <h2>Hold factors (optional)</h2>
        <p className="muted small">Fix a factor at a value, for example the shortest cooling time, and optimize the rest.</p>
        <div className="grid">
          {factors.map((f) => (
            <div key={f.id} className="field">
              <label className="check">
                <input type="checkbox" checked={hold[f.id] !== undefined} onChange={(e) => setHold({ ...hold, [f.id]: e.target.checked ? (f.low + f.high) / 2 : undefined })} />
                Hold {f.name.toLowerCase()} fixed
              </label>
              {hold[f.id] !== undefined && <NumberField label={`${f.name} value`} value={hold[f.id]} quantity={f.quantity} units={study.units} onChange={(v) => setHold({ ...hold, [f.id]: v })} />}
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" disabled={!used.length} onClick={run}>
            Find best settings
          </button>
          {!used.length && <span className="muted small">Set a goal for at least one response.</span>}
        </div>
        {error && <p className="warn">{error}</p>}
      </section>
      {outcome && (
        <section className="card">
          <div className="row spread">
            <h2>Best settings found</h2>
            <span>
              Overall desirability <strong>{outcome.result.desirability.toFixed(3)}</strong>
            </span>
          </div>
          {outcome.result.desirability === 0 && <p className="banner info">No setting meets every goal’s acceptable limit. Loosen a limit or lower its importance.</p>}
          <div className="setpoints">
            {factors.map((f) => (
              <div key={f.id} className="setpoint">
                <span className="small">{f.name}</span>
                <strong>{formatValue(outcome.settings[f.id], f.quantity, study)}</strong>
              </div>
            ))}
          </div>
          {limits.length > 0 && (
            <ul className="notes warn">
              {limits.map((l, i) => (
                <li key={i}>
                  {l.factorName} {formatValue(l.value, study.factors.find((f) => f.id === l.factorId)!.quantity, study)} is above the press limit of{' '}
                  {formatValue(l.limit, study.factors.find((f) => f.id === l.factorId)!.quantity, study)}.
                </li>
              ))}
            </ul>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Response</th>
                  <th className="num">Predicted</th>
                  <th className="num">95% range for one shot</th>
                  <th className="num">Desirability</th>
                </tr>
              </thead>
              <tbody>
                {outcome.items.map((it) => (
                  <tr key={it.series.key}>
                    <td>{it.series.label}</td>
                    <td className="num">
                      {fmt(it.prediction.fit)} <span className="unit">{seriesUnit(it.series, study)}</span>
                    </td>
                    <td className="num">{it.prediction.pi ? `${fmt(it.prediction.pi[0])} to ${fmt(it.prediction.pi[1])}` : '–'}</td>
                    <td className="num">{it.desirability.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button
              className="btn primary"
              onClick={() =>
                ws.update((s) => {
                  const a = s.analysis ?? { series: {} }
                  return { ...s, analysis: { ...a, optimum: outcome.result.x, confirmation: { runs: a.confirmation?.runs ?? 3, values: {} } } }
                })
              }
            >
              Confirm these settings
            </button>
            <span className="muted small">Saves them in the study and opens confirmation runs. This clears earlier confirmation results.</span>
          </div>
        </section>
      )}
    </>
  )
}

function ConfirmView({ study, ws }: { study: Study; ws: Workspace }) {
  const optimum = study.analysis?.optimum
  const conf = study.analysis?.confirmation
  const factors = designFactors(study)
  const results = useMemo(() => {
    try {
      return confirmStudy(study)
    } catch {
      return []
    }
  }, [study])
  if (!optimum || !conf) {
    return (
      <section className="card">
        <h2>Confirmation runs</h2>
        <p className="muted">Find the best settings on the Optimize tab first, then choose “Confirm these settings”.</p>
      </section>
    )
  }
  const settings = decode(study, optimum)
  const used = goalsInUse(study)
  const setConf = (patch: Partial<typeof conf>) => ws.update((s) => ({ ...s, analysis: { ...s.analysis!, confirmation: { ...s.analysis!.confirmation!, ...patch } } }))
  const setValue = (key: string, i: number, v: number | undefined) => {
    const arr = [...(conf.values[key] ?? [])]
    while (arr.length < conf.runs) arr.push(null)
    arr[i] = v ?? null
    setConf({ values: { ...conf.values, [key]: arr } })
  }
  return (
    <>
      <section className="card">
        <h2>Confirmation runs</h2>
        <p className="muted small">Run the press at these settings, let it stabilize, then record each run. If the average lands inside the expected range, the model holds.</p>
        <div className="setpoints">
          {factors.map((f) => (
            <div key={f.id} className="setpoint">
              <span className="small">{f.name}</span>
              <strong>{formatValue(settings[f.id], f.quantity, study)}</strong>
            </div>
          ))}
        </div>
        <div className="row">
          <NumberField label="Number of confirmation runs" value={conf.runs} quantity="none" units={study.units} min={1} integer onChange={(v) => v !== undefined && v >= 1 && setConf({ runs: Math.min(20, Math.round(v)) })} />
        </div>
        {used.map(({ series }) => (
          <fieldset key={series.key} className="response">
            <legend>
              {series.label}
              {series.kind === 'passfail' && <span className="muted small"> · fraction defective, 0 to 1</span>}
            </legend>
            <div className="grid">
              {Array.from({ length: conf.runs }, (_, i) => (
                <NumberField key={i} label={`Run ${i + 1}`} value={conf.values[series.key]?.[i] ?? undefined} quantity={series.quantity} units={study.units} onChange={(v) => setValue(series.key, i, v)} />
              ))}
            </div>
          </fieldset>
        ))}
      </section>
      <section className="card">
        <h2>Result</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Response</th>
                <th className="num">Predicted</th>
                <th className="num">Expected range for the average</th>
                <th className="num">Observed average</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.series.key}>
                  <td>{r.series.label}</td>
                  <td className="num">{fmt(r.predicted)}</td>
                  <td className="num">{r.check ? `${fmt(r.check.interval[0])} to ${fmt(r.check.interval[1])}` : '–'}</td>
                  <td className="num">{r.check ? `${fmt(r.check.observedMean)} (n = ${r.check.n})` : '–'}</td>
                  <td>{r.error ?? (r.check ? (r.check.inside ? '✓ Inside: the model holds' : '✗ Outside: the model missed') : 'Waiting for results')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {results.some((r) => r.check && !r.check.inside) && (
          <p className="banner info">A miss usually means something changed (material lot, mold temperature drift) or the model is missing a term. Check the residual plots and consider adding runs.</p>
        )}
      </section>
    </>
  )
}

export function AnalyzePanel({ ws, study }: { ws: Workspace; study: Study }) {
  const [view, setView] = useState<View>('model')
  const [seriesKey, setSeriesKey] = useState('')
  const done = study.runs.filter((r) => r.status === 'done').length
  if (!study.design || !study.runs.length || !study.responses.length) {
    return (
      <section className="card">
        <h2>Analyze</h2>
        <p className="muted">{!study.responses.length ? 'Add responses on the Design tab first.' : 'Create runs on the Design tab, then record results on the Run tab.'}</p>
      </section>
    )
  }
  return (
    <>
      <div className="row spread no-print">
        <div className="segmented" role="tablist" aria-label="Analysis views">
          {(
            [
              ['model', 'Model'],
              ['optimize', 'Optimize'],
              ['confirm', 'Confirm'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted small">
          {done} of {study.runs.length} runs done
        </span>
      </div>
      {view === 'model' && <ModelView study={study} ws={ws} seriesKey={seriesKey} setSeriesKey={setSeriesKey} />}
      {view === 'optimize' && <OptimizeView study={study} ws={ws} />}
      {view === 'confirm' && <ConfirmView study={study} ws={ws} />}
    </>
  )
}
