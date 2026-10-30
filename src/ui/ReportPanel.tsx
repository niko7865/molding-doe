import { useMemo, useState } from 'react'
import { downloadBlob } from '../export/download'
import { runTable, toCsv, workbook } from '../export/tables'
import { buildXlsx } from '../export/xlsx'
import { aliasStructure, definingRelationNames } from '../stats'
import { analyzeSeries, confirmStudy, decode, factorNames, goalsInUse, seriesList, type Series } from '../study/analysis'
import { describeDesign } from '../study/design'
import { doeEnabled, type Study } from '../study/schema'
import { unitLabel } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { GUIDE_STUDIES, statusOf } from '../guide/info'
import { EffectCharts, FactorPlots, ModelSummary, ResidualPlots } from './AnalyzePanel'
import { fmt } from './chartUtils'
import { formatValue } from './format'
import { GuideResult } from './GuidePanel'
import { SettingsReport } from './ProcessSettings'
import { guideSummary } from './guideText'
import { MaterialChecks } from './MaterialCard'
import { materialRows } from './materialText'

const LETTERS = 'ABCDEFGHJKLMNOP'
const KIND_LABEL = { continuous: 'Measurement', rating: 'Rating 1–5', passfail: 'Pass/fail count' } as const

function baseName(study: Study): string {
  return study.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'study'
}

function SeriesReport({ study, series, names }: { study: Study; series: Series; names: string[] }) {
  const result = useMemo(() => {
    try {
      return { a: analyzeSeries(study, series) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [study, series])
  return (
    <section className="report-section">
      <h3>{series.label}</h3>
      {result.a ? (
        <>
          <ModelSummary a={result.a} names={names} study={study} />
          <EffectCharts a={result.a} study={study} names={names} />
          <FactorPlots a={result.a} study={study} forReport />
          <ResidualPlots a={result.a} forReport />
        </>
      ) : (
        <p className="muted">{result.error}</p>
      )}
    </section>
  )
}

function OptimumReport({ study }: { study: Study }) {
  const optimum = study.analysis?.optimum
  const rows = useMemo(() => {
    if (!optimum) return []
    return goalsInUse(study).map(({ series }) => {
      try {
        return { series, p: analyzeSeries(study, series).fit.predict(optimum) }
      } catch {
        return { series, p: null }
      }
    })
  }, [study, optimum])
  const confirmation = useMemo(() => {
    try {
      return confirmStudy(study)
    } catch {
      return []
    }
  }, [study])
  if (!optimum) return <p className="muted">No optimum has been chosen yet.</p>
  const settings = decode(study, optimum)
  const factors = (study.design?.factorIds ?? []).map((id) => study.factors.find((f) => f.id === id)!)
  const confirmed = confirmation.filter((c) => c.check)
  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>Chosen settings</caption>
          <tbody>
            {factors.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className="num">{formatValue(settings[f.id], f.quantity, study)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <caption>Predictions and confirmation</caption>
          <thead>
            <tr>
              <th>Response</th>
              <th className="num">Predicted</th>
              <th className="num">95% range for one shot</th>
              <th className="num">Expected range for the average</th>
              <th className="num">Observed average</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ series, p }) => {
              const c = confirmation.find((x) => x.series.key === series.key)
              return (
                <tr key={series.key}>
                  <td>{series.label}</td>
                  <td className="num">{p ? fmt(p.fit) : '–'}</td>
                  <td className="num">{p?.pi ? `${fmt(p.pi[0])} to ${fmt(p.pi[1])}` : '–'}</td>
                  <td className="num">{c?.check ? `${fmt(c.check.interval[0])} to ${fmt(c.check.interval[1])}` : '–'}</td>
                  <td className="num">{c?.check ? `${fmt(c.check.observedMean)} (n = ${c.check.n})` : '–'}</td>
                  <td>{c?.error ?? (c?.check ? (c.check.inside ? '✓ Inside' : '✗ Outside') : 'Not run')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>
        {confirmed.length === 0
          ? 'Confirmation runs have not been recorded.'
          : confirmed.every((c) => c.check!.inside)
            ? 'Every confirmed response landed inside its expected range, so the model holds at these settings.'
            : 'At least one response landed outside its expected range; the model does not fully hold at these settings.'}
      </p>
    </>
  )
}

export function ReportPanel({ study }: { ws: Workspace; study: Study }) {
  const all = seriesList(study)
  const goals = goalsInUse(study).map((g) => g.series.key)
  const defaults = goals.length ? goals : all.filter((s) => s.stat !== 'cavity').map((s) => s.key)
  const [picked, setPicked] = useState<string[] | null>(null)
  const keys = picked ?? defaults
  const [include, setInclude] = useState({ guide: true, runs: true, analysis: true, optimum: true })
  const names = useMemo(() => factorNames(study), [study])
  const [printed] = useState(() => new Date().toLocaleDateString())
  const done = study.runs.filter((r) => r.status === 'done').length
  const doe = doeEnabled(study)
  const design = study.design
  const toggle = (key: string) => setPicked(keys.includes(key) ? keys.filter((k) => k !== key) : all.map((s) => s.key).filter((k) => k === key || keys.includes(k)))

  return (
    <>
      <section className="card no-print">
        <div className="row spread">
          <h2>Report</h2>
          <div className="row">
            {doe && (
              <>
                <button className="btn" disabled={!study.runs.length} onClick={() => downloadBlob(toCsv(runTable(study)), 'text/csv;charset=utf-8', `${baseName(study)} runs.csv`)}>
                  Download CSV
                </button>
                <button
                  className="btn"
                  disabled={!study.runs.length}
                  onClick={() => downloadBlob(buildXlsx(workbook(study)) as Uint8Array<ArrayBuffer>, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${baseName(study)}.xlsx`)}
                >
                  Download Excel
                </button>
              </>
            )}
            <button className="btn primary" onClick={() => window.print()}>
              Print or save as PDF
            </button>
          </div>
        </div>
        {doe && <p className="muted small">The CSV and Excel files hold the run table in run order with setpoints and raw results, for cross-checking in Minitab or Excel.</p>}
        <fieldset className="field">
          <legend>Include</legend>
          <div className="terms">
            {(
              [
                ['guide', 'Molding studies'],
                ['runs', 'Run table'],
                ['analysis', 'Analysis'],
                ['optimum', 'Optimum and confirmation'],
              ] as const
            )
              .filter(([k]) => doe || k === 'guide')
              .map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={include[k]} onChange={(e) => setInclude({ ...include, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
          </div>
        </fieldset>
        {doe && include.analysis && all.length > 0 && (
          <fieldset className="field">
            <legend>Responses to analyze</legend>
            <div className="terms">
              {all.map((s) => (
                <label key={s.key} className="check">
                  <input type="checkbox" checked={keys.includes(s.key)} onChange={() => toggle(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <article className="card report">
        <header>
          <h1>{study.name || 'Untitled study'}</h1>
          <p className="muted small">
            Printed {printed} · {study.units === 'metric' ? 'Metric' : 'Imperial'} units · {study.cavities} cavit{study.cavities === 1 ? 'y' : 'ies'}
          </p>
          {study.machine && (
            <p className="small">
              Press: {study.machine.name || 'unnamed'}
              {study.machine.maxInjectionPressure ? ` · max injection pressure ${formatValue(study.machine.maxInjectionPressure, 'pressure', study)}` : ''}
              {study.machine.maxInjectionSpeed ? ` · max injection speed ${formatValue(study.machine.maxInjectionSpeed, 'speed', study)}` : ''}
              {study.machine.clampForce ? ` · clamp ${formatValue(study.machine.clampForce, 'force', study)}` : ''}
            </p>
          )}
          {study.goal && (
            <p>
              <strong>Goal:</strong> {study.goal}
            </p>
          )}
        </header>

        {study.material && <MaterialReport study={study} />}

        {include.guide && (
          <section className="report-section">
            <h2>Molding studies</h2>
            <GuideReport study={study} doe={doe} />
          </section>
        )}

        {doe && (
          <>
            <section className="report-section">
              <h2>Factors and responses</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th />
                      <th>Factor</th>
                      <th className="num">Low</th>
                      <th className="num">High</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.factors.map((f, j) => (
                      <tr key={f.id}>
                        <td>{LETTERS[j]}</td>
                        <td>{f.name}</td>
                        <td className="num">{formatValue(f.low, f.quantity, study)}</td>
                        <td className="num">{formatValue(f.high, f.quantity, study)}</td>
                        <td>{f.hardToChange ? 'Hard to change' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Response</th>
                      <th>Type</th>
                      <th>Unit</th>
                      <th>Measured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.responses.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{KIND_LABEL[r.kind]}</td>
                        <td>{r.kind === 'passfail' ? `defective of ${r.shots}` : unitLabel(r.quantity, study.units) || '–'}</td>
                        <td>{r.perCavity && study.cavities > 1 ? 'Per cavity' : 'Per shot'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section">
              <h2>Design</h2>
              <p>
                {describeDesign(study)}. {done} of {study.runs.length} runs done
                {design ? (design.randomize ? `, run in random order (seed ${design.seed}).` : ', run in standard order.') : '.'}
              </p>
              {design?.type === 'fractional-factorial' && design.generators && (
                <p className="small">
                  Generators {design.generators.join(', ')}; defining relation I = {definingRelationNames(design.generators).join(' = ')}. Aliases:{' '}
                  {aliasStructure(design.factorIds.length, design.generators)
                    .filter((r) => r.aliases.length)
                    .map((r) => `${r.effect} = ${r.aliases.join(' = ')}`)
                    .join('; ')}
                  .
                </p>
              )}
            </section>
          </>
        )}

        {doe && include.runs && study.runs.length > 0 && (
          <section className="report-section">
            <h2>Runs and results</h2>
            <RunTable study={study} />
          </section>
        )}

        {doe && include.analysis && (
          <section className="report-section">
            <h2>Analysis</h2>
            {keys.length === 0 && <p className="muted">No responses selected.</p>}
            {all
              .filter((s) => keys.includes(s.key))
              .map((s) => (
                <SeriesReport key={s.key} study={study} series={s} names={names} />
              ))}
          </section>
        )}

        {doe && include.optimum && (
          <section className="report-section">
            <h2>Optimum and confirmation</h2>
            <OptimumReport study={study} />
          </section>
        )}
      </article>
    </>
  )
}

function MaterialReport({ study }: { study: Study }) {
  const m = study.material!
  const rows = materialRows(m, study)
  return (
    <section className="report-section">
      <h2>Material</h2>
      <p>
        {m.name || 'Unnamed resin'}
        {m.supplier ? ` · ${m.supplier}` : ''}
      </p>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption>Datasheet values</caption>
            <tbody>
              {rows.map(([label, text]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {m.notes && <p className="wrap">{m.notes}</p>}
      <MaterialChecks study={study} />
    </section>
  )
}

function GuideReport({ study, doe }: { study: Study; doe: boolean }) {
  const statuses = GUIDE_STUDIES.map((g) => ({ ...g, status: statusOf(study, g.key) }))
  const notDone = statuses.filter((g) => g.status !== 'done')
  return (
    <>
      <div className="table-wrap">
        <table>
          <tbody>
            {statuses.map((g) => (
              <tr key={g.key}>
                <td>{g.title}</td>
                <td>
                  <span className={`status-tag ${g.status}`}>{g.status === 'done' ? 'Done' : g.status === 'skipped' ? 'Skipped' : 'Not done'}</span>
                </td>
                <td className="wrap">
                  {g.status === 'done' ? guideSummary(study, g.key) : ''}
                  {study.guide?.[g.key]?.notes ? ` ${study.guide[g.key]!.notes}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SettingsReport study={study} />
      {notDone.length > 0 && (
        <p className="banner info">
          {notDone.length} of 6 molding studies {notDone.length === 1 ? 'was' : 'were'} skipped or not done: {notDone.map((g) => g.title.toLowerCase()).join(', ')}.{' '}
          {doe ? 'The DOE results hold only for the process as it was run.' : 'The process has not been checked against what those studies would show.'}
        </p>
      )}
      <div className="charts">
        {statuses
          .filter((g) => g.status === 'done')
          .map((g) => (
            <div key={g.key}>
              <GuideResult study={study} k={g.key} />
            </div>
          ))}
      </div>
    </>
  )
}

function RunTable({ study }: { study: Study }) {
  const [header, ...rows] = runTable(study)
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : j === r.length - 1 ? 'wrap' : undefined}>
                  {v ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
