import { useState, type ReactNode } from 'react'
import { GUIDE_STUDIES, maxPressure, statusOf } from '../guide/info'
import {
  balanceVerdict,
  cavityBalance,
  coolingTime,
  DEFAULT_ALLOWABLE_IMBALANCE,
  DEFAULT_FLAT_THRESHOLD,
  DEFAULT_SEAL_TOLERANCE,
  gateSeal,
  MIN_FIT_R2,
  pressureDrop,
  processWindow,
  viscosityCurve,
  type GuideKey,
  type GuideStatus,
} from '../guide/studies'
import { sampleCurve, type CurveFit } from '../stats/curves'
import { FACTOR_PRESETS, factorFromPreset } from '../study/presets'
import { doeEnabled, type Guide, type Study } from '../study/schema'
import { toDisplay, unitLabel, type Quantity } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { fmt } from './chartUtils'
import { ParetoChart, ScatterChart } from './charts'
import { formatValue } from './format'
import { NumberField } from './NumberField'

const STATUS_LABEL: Record<GuideStatus, string> = { done: 'Done', skipped: 'Skipped', open: 'Not done' }

function patchGuide<K extends GuideKey>(ws: Workspace, key: K, fallback: NonNullable<Guide[K]>, change: (g: NonNullable<Guide[K]>) => NonNullable<Guide[K]>) {
  ws.update((s) => ({ ...s, guide: { ...s.guide, [key]: change((s.guide?.[key] ?? fallback) as NonNullable<Guide[K]>) } }))
}

const DEFAULTS: { [K in GuideKey]: (study: Study) => NonNullable<Guide[K]> } = {
  viscosity: () => ({ ratio: 1, rows: Array.from({ length: 8 }, () => ({ speed: null, fillTime: null, pressure: null })) }),
  balance: (study) => ({ rows: Array.from({ length: 5 }, () => new Array(study.cavities).fill(null)) }),
  pressureDrop: () => ({
    ratio: 1,
    rows: ['Nozzle (air shot)', 'End of runner', 'Past the gate', 'Part at transfer'].map((segment) => ({ segment, pressure: null })),
  }),
  gateSeal: () => ({ rows: [1, 2, 3, 4, 5, 6, 7, 8].map((time) => ({ time, weight: null })) }),
  cooling: () => ({ label: 'Critical dimension', quantity: 'length', rows: Array.from({ length: 6 }, () => ({ time: null, value: null })) }),
  window: () => ({ temperature: 'melt', rows: [] }),
}

/** Plastic-pressure reading in the study's units, e.g. "18,000 psi". */
function pressureText(v: number, study: Study) {
  return formatValue(v, 'pressure', study)
}

// Shared pieces -------------------------------------------------------------------------------

function Suggestion({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={tone === 'warn' ? 'suggestion warn-box' : 'suggestion'}>{children}</div>
}

function RatioField<K extends 'viscosity' | 'pressureDrop'>({ study, ws, k }: { study: Study; ws: Workspace; k: K }) {
  const g = study.guide?.[k] ?? DEFAULTS[k](study)
  return (
    <div className="row">
      <NumberField
        label="Intensification ratio"
        value={g.ratio}
        quantity="none"
        units={study.units}
        min={1}
        onChange={(v) => v !== undefined && v > 0 && patchGuide(ws, k, DEFAULTS[k](study), (x) => ({ ...x, ratio: v }))}
      />
      <span className="muted small grow">Leave at 1 when the press shows plastic pressure. For a hydraulic gauge reading, enter the screw’s intensification ratio (often about 10).</span>
    </div>
  )
}

const pct = (v: number) => `${Number(v.toPrecision(6))}%`

type FitKey = 'viscosity' | 'gateSeal' | 'cooling'

/** Turns the curve fit on or off for a study (on by default). */
function FitToggle<K extends FitKey>({ study, ws, k, hint }: { study: Study; ws: Workspace; k: K; hint: string }) {
  const g = study.guide?.[k] ?? DEFAULTS[k](study)
  return (
    <div className="row">
      <label className="check">
        <input
          type="checkbox"
          checked={g.fit !== false}
          onChange={(e) => patchGuide(ws, k, DEFAULTS[k](study), (x) => ({ ...x, fit: e.target.checked ? undefined : false }))}
        />
        Fit a curve
      </label>
      <span className="muted small grow">{hint}</span>
    </div>
  )
}

/** One line on the fitted model and how well it fits. */
function FitNote({ fit, model, used }: { fit: CurveFit | null; model: string; used: boolean }) {
  if (!fit) return null
  return (
    <p className="muted small">
      Fitted curve: {model}. R² = {fit.r2.toFixed(3)}.
      {!used && (fit.r2 < MIN_FIT_R2 ? ` That is below ${MIN_FIT_R2}, so the result uses the measured points instead.` : ' The curve doesn’t have the expected shape, so the result uses the measured points instead.')}
    </p>
  )
}

/** A positive percentage setting, such as a study's pass/fail threshold. */
function PercentField({ label, value, units, onChange, hint }: { label: string; value: number; units: Study['units']; onChange: (v: number) => void; hint: string }) {
  return (
    <div className="row">
      <NumberField label={label} value={value} quantity="none" units={units} onChange={(v) => v !== undefined && v > 0 && onChange(v)} />
      <span className="muted small grow">{hint}</span>
    </div>
  )
}

interface Column<R> {
  label: string
  quantity: Quantity
  get: (r: R) => number | null
  set: (r: R, v: number | null) => R
}

function RowsTable<R>({ study, rows, columns, onChange, newRow, extra }: { study: Study; rows: R[]; columns: Column<R>[]; onChange: (rows: R[]) => void; newRow: () => R; extra?: { label: string; value: (r: R, i: number) => ReactNode } }) {
  return (
    <div className="table-wrap">
      <table className="entry">
        <thead>
          <tr>
            <th>#</th>
            {columns.map((c) => (
              <th key={c.label}>
                {c.label}
                {unitLabel(c.quantity, study.units) && <span className="unit"> ({unitLabel(c.quantity, study.units)})</span>}
              </th>
            ))}
            {extra && <th className="num">{extra.label}</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {columns.map((c) => (
                <td key={c.label}>
                  <NumberField hideLabel label={`${c.label}, row ${i + 1}`} value={c.get(r) ?? undefined} quantity={c.quantity} units={study.units} onChange={(v) => onChange(rows.map((x, j) => (j === i ? c.set(x, v ?? null) : x)))} />
                </td>
              ))}
              {extra && <td className="num">{extra.value(r, i)}</td>}
              <td>
                <button className="link danger" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" onClick={() => onChange([...rows, newRow()])}>
        Add row
      </button>
    </div>
  )
}

// 1. Viscosity -------------------------------------------------------------------------------

function viscosityUnit(study: Study) {
  return `${unitLabel('pressure', study.units)}·s`
}

function ViscosityResultView({ study }: { study: Study }) {
  const g = study.guide?.viscosity
  if (!g) return null
  const r = viscosityCurve(g)
  if (r.points.length < 2) return <p className="muted">Enter at least three speeds to draw the curve.</p>
  const visc = (v: number) => toDisplay(v, 'pressure', study.units)
  const max = maxPressure(study)
  const limitedFrom = max ? r.points.find((p) => p.pressure >= 0.95 * max)?.speed : undefined
  const speeds = r.points.map((p) => p.speed)
  const fitted = r.basis === 'fit'
  return (
    <>
      <ScatterChart
        title="Relative viscosity vs injection speed"
        points={r.points.map((p) => ({ x: toDisplay(p.speed, 'speed', study.units), y: visc(p.viscosity), highlight: true }))}
        xLabel={`Injection speed (${unitLabel('speed', study.units)})`}
        yLabel={`Relative viscosity (${viscosityUnit(study)})`}
        connect={!r.fit}
        curve={r.fit ? sampleCurve(r.fit.predict, Math.min(...speeds), Math.max(...speeds)).map((p) => ({ x: toDisplay(p.x, 'speed', study.units), y: visc(p.y) })) : undefined}
        vline={r.flatFrom !== null ? { x: toDisplay(r.flatFrom, 'speed', study.units), label: 'Levels off' } : undefined}
      />
      <FitNote
        fit={r.fit}
        used={fitted}
        model={r.fit ? `power law (exponent −${r.fit.m.toFixed(2)}) leveling toward ${fmt(visc(r.fit.floor))} ${viscosityUnit(study)}` : ''}
      />
      <Suggestion>
        {r.flatFrom !== null
          ? `${fitted ? 'On the fitted curve, viscosity' : 'Viscosity'} levels off from ${formatValue(r.flatFrom, 'speed', study)}: each faster step changes it by less than ${pct(g.threshold ?? DEFAULT_FLAT_THRESHOLD)}. Choose an injection speed at or above this, as long as the part shows no burns, jetting or flash.`
          : r.points.length >= 3
            ? 'The curve has not leveled off yet. Add faster speeds if the press allows; otherwise use the fastest stable speed, and include injection speed as a factor if you run a DOE.'
            : 'Enter at least three speeds to find the flat region.'}
      </Suggestion>
      {limitedFrom !== undefined && (
        <Suggestion tone="warn">From {formatValue(limitedFrom, 'speed', study)} the peak pressure is within 5% of the press maximum, so the press is pressure-limited there and the curve isn’t reliable.</Suggestion>
      )}
    </>
  )
}

function ViscosityStudy({ study, ws }: { study: Study; ws: Workspace }) {
  const g = study.guide?.viscosity ?? DEFAULTS.viscosity(study)
  const r = viscosityCurve(g)
  type Row = (typeof g.rows)[number]
  const set = (rows: Row[]) => patchGuide(ws, 'viscosity', DEFAULTS.viscosity(study), (x) => ({ ...x, rows }))
  const byRow = (row: Row) => r.points.find((p) => p.speed === row.speed && p.fillTime === row.fillTime)
  return (
    <>
      <RatioField study={study} ws={ws} k="viscosity" />
      <PercentField
        label="Level-off change (%)"
        value={g.threshold ?? DEFAULT_FLAT_THRESHOLD}
        units={study.units}
        onChange={(threshold) => patchGuide(ws, 'viscosity', DEFAULTS.viscosity(study), (x) => ({ ...x, threshold }))}
        hint="Viscosity counts as leveled off once each faster step changes it by less than this. 10% is typical."
      />
      <RowsTable<Row>
        study={study}
        rows={g.rows}
        onChange={set}
        newRow={() => ({ speed: null, fillTime: null, pressure: null })}
        columns={[
          { label: 'Injection speed', quantity: 'speed', get: (x) => x.speed, set: (x, v) => ({ ...x, speed: v }) },
          { label: 'Fill time', quantity: 'time', get: (x) => x.fillTime, set: (x, v) => ({ ...x, fillTime: v }) },
          { label: 'Peak pressure', quantity: 'pressure', get: (x) => x.pressure, set: (x, v) => ({ ...x, pressure: v }) },
        ]}
        extra={{
          label: `Viscosity (${viscosityUnit(study)}) · drop`,
          value: (row) => {
            const p = byRow(row)
            if (!p) return '–'
            return `${fmt(toDisplay(p.viscosity, 'pressure', study.units))}${p.drop !== null ? ` · ${(p.drop * 100).toFixed(0)}%` : ''}`
          },
        }}
      />
      <FitToggle study={study} ws={ws} k="viscosity" hint="Fits viscosity = floor + k · speed^−m (shear thinning that levels off) and applies the level-off change to the fitted curve, so one noisy reading doesn’t move the result. Needs four speeds." />
      <ViscosityResultView study={{ ...study, guide: { ...study.guide, viscosity: g } }} />
    </>
  )
}

// 2. Cavity balance --------------------------------------------------------------------------

function BalanceResultView({ study }: { study: Study }) {
  const g = study.guide?.balance
  if (!g) return null
  const r = cavityBalance(g, study.cavities)
  if (r.imbalance === null) return <p className="muted">Weigh at least two cavities to compare them.</p>
  const allowable = g.allowable ?? DEFAULT_ALLOWABLE_IMBALANCE
  const verdict = balanceVerdict(r.imbalance, allowable)
  return (
    <>
      <ScatterChart
        title="Mean fill-only weight per cavity"
        points={r.means.flatMap((m, c) => (m === null ? [] : [{ x: c + 1, y: toDisplay(m, 'mass', study.units), label: `Cavity ${c + 1}`, highlight: true }]))}
        xLabel="Cavity"
        yLabel={`Weight (${unitLabel('mass', study.units)})`}
        xTicks={r.means.map((_, c) => c + 1)}
        tooltip={(p) => `${p.label}: ${fmt(p.y)} ${unitLabel('mass', study.units)}`}
      />
      <Suggestion tone={verdict === 'poor' ? 'warn' : 'info'}>
        Imbalance is {r.imbalance.toFixed(1)}% (cavity {r.lightest! + 1} lightest, cavity {r.heaviest! + 1} heaviest, over {r.shots} shot{r.shots === 1 ? '' : 's'}).{' '}
        {verdict === 'good'
          ? `That is within the allowable ${pct(allowable)}, so the cavities fill alike.`
          : verdict === 'watch'
            ? `Between ${pct(allowable)} and ${pct(2 * allowable)}: workable, but analyze cavities separately as well as the mean.`
            : `Over ${pct(2 * allowable)}: fix the balance (hot runner zones, gate sizes, vents) before setting the rest of the process.`}
      </Suggestion>
    </>
  )
}

function BalanceStudy({ study, ws }: { study: Study; ws: Workspace }) {
  if (study.cavities === 1) return <p className="muted">This mold has one cavity, so there is nothing to balance. Mark this study as skipped.</p>
  const g = study.guide?.balance ?? DEFAULTS.balance(study)
  const rows = g.rows.map((r) => Array.from({ length: study.cavities }, (_, c) => r[c] ?? null))
  const set = (next: (number | null)[][]) => patchGuide(ws, 'balance', DEFAULTS.balance(study), (x) => ({ ...x, rows: next }))
  return (
    <>
      <PercentField
        label="Allowable imbalance (%)"
        value={g.allowable ?? DEFAULT_ALLOWABLE_IMBALANCE}
        units={study.units}
        onChange={(allowable) => patchGuide(ws, 'balance', DEFAULTS.balance(study), (x) => ({ ...x, allowable }))}
        hint="Imbalance up to this counts as good, up to twice this as workable. 5% is a common limit; tighten it for close-tolerance parts."
      />
      <RowsTable<(number | null)[]>
        study={study}
        rows={rows}
        onChange={set}
        newRow={() => new Array(study.cavities).fill(null)}
        columns={Array.from({ length: study.cavities }, (_, c) => ({
          label: `Cavity ${c + 1}`,
          quantity: 'mass' as const,
          get: (r: (number | null)[]) => r[c],
          set: (r: (number | null)[], v: number | null) => r.map((x, j) => (j === c ? v : x)),
        }))}
      />
      <BalanceResultView study={{ ...study, guide: { ...study.guide, balance: g } }} />
    </>
  )
}

// 3. Pressure drop ---------------------------------------------------------------------------

function PressureDropResultView({ study }: { study: Study }) {
  const g = study.guide?.pressureDrop
  if (!g) return null
  const max = maxPressure(study)
  const r = pressureDrop(g, max)
  if (!r.segments.length) return <p className="muted">Enter a pressure for at least one segment.</p>
  const unit = unitLabel('pressure', study.units)
  return (
    <>
      <ParetoChart
        title="Peak plastic pressure at the end of each segment"
        items={r.segments.map((s) => ({ label: s.segment || 'Segment', value: toDisplay(s.pressure, 'pressure', study.units), detail: `${pressureText(s.pressure, study)} (drop ${pressureText(s.drop, study)})`, active: true }))}
        reference={max ? toDisplay(max, 'pressure', study.units) : undefined}
        referenceLabel={max ? `Press max ${fmt(toDisplay(max, 'pressure', study.units))}` : undefined}
        valueLabel={`Plastic pressure (${unit})`}
        keepOrder
      />
      <Suggestion tone={r.verdict === 'limited' ? 'warn' : 'info'}>
        {r.usage === null
          ? 'Enter the press’s maximum injection pressure on the Study tab to check for a pressure limit.'
          : `Filling the part takes ${(r.usage * 100).toFixed(0)}% of the press maximum. ${
              r.verdict === 'limited'
                ? 'The process is pressure-limited: the press can’t hold the set speed. Raise melt temperature, open the gate or runner, or move to a larger press before going further.'
                : r.verdict === 'tight'
                  ? 'There is little headroom: watch for pressure-limited shots, and keep injection speed out of any DOE.'
                  : 'There is enough headroom.'
            }`}
        {r.segments.length > 1 &&
          (() => {
            const i = r.segments.reduce((best, s, j) => (s.drop > r.segments[best].drop ? j : best), 0)
            return ` The largest drop, ${pressureText(r.segments[i].drop, study)}, is ${i === 0 ? `up to ${r.segments[0].segment}` : `between ${r.segments[i - 1].segment} and ${r.segments[i].segment}`}.`
          })()}
      </Suggestion>
    </>
  )
}

function PressureDropStudy({ study, ws }: { study: Study; ws: Workspace }) {
  const g = study.guide?.pressureDrop ?? DEFAULTS.pressureDrop(study)
  const set = (rows: typeof g.rows) => patchGuide(ws, 'pressureDrop', DEFAULTS.pressureDrop(study), (x) => ({ ...x, rows }))
  return (
    <>
      <RatioField study={study} ws={ws} k="pressureDrop" />
      <div className="table-wrap">
        <table className="entry">
          <thead>
            <tr>
              <th>Flow segment</th>
              <th>
                Peak pressure <span className="unit">({unitLabel('pressure', study.units)})</span>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Segment ${i + 1} name`} value={r.segment} onChange={(e) => set(g.rows.map((x, j) => (j === i ? { ...x, segment: e.target.value } : x)))} />
                </td>
                <td>
                  <NumberField hideLabel label={`${r.segment} pressure`} value={r.pressure ?? undefined} quantity="pressure" units={study.units} onChange={(v) => set(g.rows.map((x, j) => (j === i ? { ...x, pressure: v ?? null } : x)))} />
                </td>
                <td>
                  <button className="link danger" aria-label={`Remove ${r.segment}`} onClick={() => set(g.rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => set([...g.rows, { segment: '', pressure: null }])}>
          Add segment
        </button>
      </div>
      {!study.machine?.maxInjectionPressure && <p className="muted small">Add the press and its maximum injection pressure on the Study tab to compare against it.</p>}
      <PressureDropResultView study={{ ...study, guide: { ...study.guide, pressureDrop: g } }} />
    </>
  )
}

// 4. Gate seal -------------------------------------------------------------------------------

function GateSealResultView({ study }: { study: Study }) {
  const g = study.guide?.gateSeal
  if (!g) return null
  const r = gateSeal(g)
  if (r.points.length < 3) return <p className="muted">Enter at least three hold times with weights.</p>
  const mass = (v: number) => toDisplay(v, 'mass', study.units)
  const first = r.points[0].time
  const last = r.points.at(-1)!.time
  // Extend the curve to a predicted seal time beyond the range tested, within reason.
  const end = r.predicted !== null ? Math.min(r.predicted * 1.1, last * 2) : last
  const fitted = r.basis === 'fit'
  return (
    <>
      <ScatterChart
        title="Part weight vs hold time"
        points={r.points.map((p) => ({ x: p.time, y: mass(p.weight), highlight: true }))}
        xLabel="Hold time (s)"
        yLabel={`Part weight (${unitLabel('mass', study.units)})`}
        connect={!r.fit}
        curve={r.fit ? sampleCurve(r.fit.predict, first, end).map((p) => ({ x: p.x, y: mass(p.y) })) : undefined}
        vline={r.sealTime !== null ? { x: r.sealTime, label: 'Gate sealed' } : r.predicted !== null && r.predicted <= end ? { x: r.predicted, label: 'Predicted seal' } : undefined}
      />
      <FitNote fit={r.fit} used={fitted} model={r.fit ? `gate freeze-off, sealed weight ${formatValue(r.fit.sealed, 'mass', study)}` : ''} />
      <Suggestion tone={r.stillRising ? 'warn' : 'info'}>
        {r.stillRising
          ? r.predicted !== null
            ? `The weight is still rising at the longest hold time tested. The fitted curve predicts the gate seals at about ${fmt(r.predicted)} s; add hold times past that to confirm.`
            : 'The weight is still rising at the longest hold time tested, so the gate hasn’t sealed. Add longer hold times.'
          : `The gate seals at about ${fmt(r.sealTime!)} s (the ${fitted ? 'fitted ' : ''}weight stays within ${pct(g.tolerance ?? DEFAULT_SEAL_TOLERANCE)} of its ${fitted ? 'sealed value' : 'maximum'} from there). Use a hold time of about ${fmt(r.suggested!)} s, which adds a margin. If you run a DOE, keep hold time out of it or range it above the seal time.`}
      </Suggestion>
    </>
  )
}

function GateSealStudy({ study, ws }: { study: Study; ws: Workspace }) {
  const g = study.guide?.gateSeal ?? DEFAULTS.gateSeal(study)
  type Row = (typeof g.rows)[number]
  return (
    <>
      <PercentField
        label="Gate sealed weight change (%)"
        value={g.tolerance ?? DEFAULT_SEAL_TOLERANCE}
        units={study.units}
        onChange={(tolerance) => patchGuide(ws, 'gateSeal', DEFAULTS.gateSeal(study), (x) => ({ ...x, tolerance }))}
        hint="The gate counts as sealed once the part weight stays within this much of its maximum. 0.1% is typical."
      />
      <RowsTable<Row>
        study={study}
        rows={g.rows}
        onChange={(rows) => patchGuide(ws, 'gateSeal', DEFAULTS.gateSeal(study), (x) => ({ ...x, rows }))}
        newRow={() => ({ time: null, weight: null })}
        columns={[
          { label: 'Hold time', quantity: 'time', get: (x) => x.time, set: (x, v) => ({ ...x, time: v }) },
          { label: 'Part weight', quantity: 'mass', get: (x) => x.weight, set: (x, v) => ({ ...x, weight: v }) },
        ]}
      />
      <FitToggle study={study} ws={ws} k="gateSeal" hint="Fits a gate freeze-off curve (the frozen layer in the gate grows with the square root of time) and reads the seal time from it rather than from the nearest hold time tested. Needs four hold times." />
      <GateSealResultView study={{ ...study, guide: { ...study.guide, gateSeal: g } }} />
    </>
  )
}

// 5. Cooling time ----------------------------------------------------------------------------

function CoolingResultView({ study }: { study: Study }) {
  const g = study.guide?.cooling
  if (!g) return null
  const r = coolingTime(g)
  if (r.points.length < 3) return <p className="muted">Enter at least three cooling times with measurements.</p>
  const d = (v: number | undefined) => (v === undefined ? undefined : toDisplay(v, g.quantity, study.units))
  const unit = unitLabel(g.quantity, study.units)
  const first = r.points[0].time
  const last = r.points.at(-1)!.time
  const end = r.predicted !== null ? Math.min(r.predicted * 1.1, last * 2) : last
  const fitted = r.source === 'fit'
  return (
    <>
      <ScatterChart
        title={`${g.label || 'Measurement'} vs cooling time`}
        points={r.points.map((p) => ({ x: p.time, y: d(p.value)!, highlight: true }))}
        xLabel="Cooling time (s)"
        yLabel={unit ? `${g.label || 'Measurement'} (${unit})` : g.label || 'Measurement'}
        connect={!r.fit}
        curve={r.fit ? sampleCurve(r.fit.predict, first, end).map((p) => ({ x: p.x, y: d(p.y)! })) : undefined}
        band={g.specLow !== undefined || g.specHigh !== undefined ? [d(g.specLow), d(g.specHigh)] : undefined}
        vline={r.shortest !== null ? { x: r.shortest, label: 'Shortest' } : r.predicted !== null && r.predicted <= end ? { x: r.predicted, label: 'Predicted' } : undefined}
      />
      <FitNote
        fit={r.fit}
        used={fitted}
        model={r.fit ? `exponential approach to ${formatValue(r.fit.plateau, g.quantity, study)}, time constant ${fmt(r.fit.tau)} s` : ''}
      />
      <Suggestion tone={r.shortest === null ? 'warn' : 'info'}>
        {r.shortest === null
          ? r.predicted !== null
            ? `The fitted curve ${r.basis === 'spec' ? 'enters the spec' : 'settles'} at about ${fmt(r.predicted)} s, past the longest time tested. Add longer cooling times to confirm.`
            : r.basis === 'spec'
              ? fitted
                ? 'The fitted curve levels off outside the spec, so no cooling time will bring it in. Check the measurement, or the issue is not cooling.'
                : 'Even the longest cooling time tested is out of spec. Check the measurement, or the issue is not cooling.'
              : 'The measurement keeps changing at the longest time tested. Add longer cooling times.'
          : r.basis === 'spec'
            ? `From ${fmt(r.shortest)} s ${fitted ? 'the fitted curve stays' : 'every longer cooling time is'} in spec. Use about ${fmt(r.shortest)} s or a little more for margin.`
            : fitted
              ? `The measurement settles from about ${fmt(r.shortest)} s (within 5% of its change from the final value on the fitted curve). Add a spec to judge against your tolerance.`
              : `The measurement settles from about ${fmt(r.shortest)} s (within 5% of its range from the final value). Add a spec to judge against your tolerance.`}
      </Suggestion>
    </>
  )
}

const COOLING_QUANTITIES: { value: Quantity; label: string }[] = [
  { value: 'length', label: 'Length' },
  { value: 'mass', label: 'Mass' },
  { value: 'none', label: 'No unit' },
]

function CoolingStudy({ study, ws }: { study: Study; ws: Workspace }) {
  const g = study.guide?.cooling ?? DEFAULTS.cooling(study)
  type Row = (typeof g.rows)[number]
  const patch = (p: Partial<typeof g>) => patchGuide(ws, 'cooling', DEFAULTS.cooling(study), (x) => ({ ...x, ...p }))
  return (
    <>
      <div className="row">
        <label className="field grow">
          <span>What you measure</span>
          <input value={g.label} onChange={(e) => patch({ label: e.target.value })} />
        </label>
        <label className="field">
          <span>Unit</span>
          <select value={g.quantity} onChange={(e) => patch({ quantity: e.target.value as Quantity, specLow: undefined, specHigh: undefined })}>
            {COOLING_QUANTITIES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Spec low" value={g.specLow} quantity={g.quantity} units={study.units} onChange={(v) => patch({ specLow: v })} />
        <NumberField label="Spec high" value={g.specHigh} quantity={g.quantity} units={study.units} onChange={(v) => patch({ specHigh: v })} />
      </div>
      <RowsTable<Row>
        study={study}
        rows={g.rows}
        onChange={(rows) => patch({ rows })}
        newRow={() => ({ time: null, value: null })}
        columns={[
          { label: 'Cooling time', quantity: 'time', get: (x) => x.time, set: (x, v) => ({ ...x, time: v }) },
          { label: g.label || 'Measurement', quantity: g.quantity, get: (x) => x.value, set: (x, v) => ({ ...x, value: v }) },
        ]}
      />
      <FitToggle study={study} ws={ws} k="cooling" hint="Fits an exponential approach to a final value (how a part cools in the mold) and solves for the time the curve enters the spec or settles. Needs four cooling times." />
      <CoolingResultView study={{ ...study, guide: { ...study.guide, cooling: g } }} />
    </>
  )
}

// 6. Process window --------------------------------------------------------------------------

const OUTCOMES = [
  { value: 'good', label: 'Good' },
  { value: 'short', label: 'Short shot' },
  { value: 'flash', label: 'Flash' },
  { value: 'sink', label: 'Sink / voids' },
  { value: 'other', label: 'Other defect' },
] as const

const TEMPERATURES = {
  melt: { label: 'Melt temperature', preset: 'melt_temp' },
  mold: { label: 'Mold temperature', preset: 'mold_temp' },
} as const

function presetRange(study: Study, key: string): [number, number] {
  const f = study.factors.find((x) => x.preset === key) ?? FACTOR_PRESETS.find((p) => p.key === key)!
  return [f.low, f.high]
}

function WindowResultView({ study }: { study: Study }) {
  const g = study.guide?.window
  if (!g) return null
  const r = processWindow(g)
  if (r.good.length + r.bad.length < 2) return <p className="muted">Judge at least two settings to draw the window.</p>
  const temp = TEMPERATURES[g.temperature].label
  const t = (v: number) => toDisplay(v, 'temperature', study.units)
  const p = (v: number) => toDisplay(v, 'pressure', study.units)
  const label = (o: string) => OUTCOMES.find((x) => x.value === o)?.label ?? o
  return (
    <>
      <ScatterChart
        title={`Hold pressure vs ${temp.toLowerCase()}`}
        points={[
          ...r.good.map((s) => ({ x: t(s.temp), y: p(s.hold), label: 'Good', highlight: true })),
          ...r.bad.map((s) => ({ x: t(s.temp), y: p(s.hold), label: label(s.outcome), highlight: true, group2: true })),
        ]}
        xLabel={`${temp} (${unitLabel('temperature', study.units)})`}
        yLabel={`Hold pressure (${unitLabel('pressure', study.units)})`}
        legend={['Good', 'Defect']}
        box={r.temp && r.hold ? { x: [t(r.temp[0]), t(r.temp[1])], y: [p(r.hold[0]), p(r.hold[1])], label: 'Process window' } : undefined}
        tooltip={(pt) => `${pt.label} at ${fmt(pt.x)} ${unitLabel('temperature', study.units)}, ${fmt(pt.y)} ${unitLabel('pressure', study.units)}`}
      />
      <Suggestion tone={r.temp && r.hold ? 'info' : 'warn'}>
        {r.temp && r.hold
          ? `${r.trimmed ? 'Leaving out the defective settings, good parts' : 'Good parts'} span ${temp.toLowerCase()} ${formatValue(r.temp[0], 'temperature', study)} to ${formatValue(r.temp[1], 'temperature', study)} and hold pressure ${pressureText(r.hold[0], study)} to ${pressureText(r.hold[1], study)}. Set the process near the middle of this window; with a DOE, use it as the ranges for the two factors.`
          : r.trimmed
            ? 'Defects sit among the good settings, so no defect-free range covers two levels of each factor. Test a finer grid around the good settings.'
            : 'Good parts need to span at least two settings of each factor to suggest a range.'}
      </Suggestion>
    </>
  )
}

function WindowStudy({ study, ws }: { study: Study; ws: Workspace }) {
  const g = study.guide?.window ?? DEFAULTS.window(study)
  type Row = (typeof g.rows)[number]
  const temp = TEMPERATURES[g.temperature]
  const set = (rows: Row[]) => patchGuide(ws, 'window', DEFAULTS.window(study), (x) => ({ ...x, rows }))
  const r = processWindow(g)
  const pick = (temperature: keyof typeof TEMPERATURES) => {
    if (temperature === g.temperature) return
    if (g.rows.length && !confirm(`Switching to ${TEMPERATURES[temperature].label.toLowerCase()} clears the ${g.rows.length} settings entered. Continue?`)) return
    patchGuide(ws, 'window', DEFAULTS.window(study), (x) => ({ ...x, temperature, rows: [] }))
  }
  const grid = () => {
    const [tl, th] = presetRange(study, temp.preset)
    const [hl, hh] = presetRange(study, 'hold_pressure')
    const rows: Row[] = []
    for (const m of [tl, (tl + th) / 2, th]) for (const h of [hl, (hl + hh) / 2, hh]) rows.push({ temp: m, hold: h, outcome: 'good' })
    set(rows)
  }
  const apply = () =>
    ws.update((s) => {
      const withRange = (factors: Study['factors'], key: string, range: [number, number]) =>
        factors.some((f) => f.preset === key)
          ? factors.map((f) => (f.preset === key ? { ...f, low: range[0], high: range[1] } : f))
          : [...factors, { ...factorFromPreset(key), low: range[0], high: range[1] }]
      return { ...s, factors: withRange(withRange(s.factors, temp.preset, r.temp!), 'hold_pressure', r.hold!) }
    })
  return (
    <>
      <fieldset className="field">
        <legend>Temperature to vary</legend>
        <div className="segmented">
          {(Object.keys(TEMPERATURES) as (keyof typeof TEMPERATURES)[]).map((k) => (
            <button key={k} className={g.temperature === k ? 'active' : ''} aria-pressed={g.temperature === k} onClick={() => pick(k)}>
              {TEMPERATURES[k].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="table-wrap">
        <table className="entry">
          <thead>
            <tr>
              <th>#</th>
              <th>
                {temp.label} <span className="unit">({unitLabel('temperature', study.units)})</span>
              </th>
              <th>
                Hold pressure <span className="unit">({unitLabel('pressure', study.units)})</span>
              </th>
              <th>Result</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {g.rows.map((row, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <NumberField hideLabel label={`${temp.label}, row ${i + 1}`} value={row.temp ?? undefined} quantity="temperature" units={study.units} onChange={(v) => set(g.rows.map((x, j) => (j === i ? { ...x, temp: v ?? null } : x)))} />
                </td>
                <td>
                  <NumberField hideLabel label={`Hold pressure, row ${i + 1}`} value={row.hold ?? undefined} quantity="pressure" units={study.units} onChange={(v) => set(g.rows.map((x, j) => (j === i ? { ...x, hold: v ?? null } : x)))} />
                </td>
                <td>
                  <select aria-label={`Result, row ${i + 1}`} value={row.outcome} onChange={(e) => set(g.rows.map((x, j) => (j === i ? { ...x, outcome: e.target.value as Row['outcome'] } : x)))}>
                    {OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="link danger" aria-label={`Remove row ${i + 1}`} onClick={() => set(g.rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button className="btn" onClick={() => set([...g.rows, { temp: null, hold: null, outcome: 'good' }])}>
            Add setting
          </button>
          {g.rows.length === 0 && (
            <button className="btn" onClick={grid}>
              Start from a 3 × 3 grid
            </button>
          )}
        </div>
      </div>
      <WindowResultView study={{ ...study, guide: { ...study.guide, window: g } }} />
      {r.temp && r.hold && doeEnabled(study) && (
        <div className="row">
          <button className="btn" disabled={study.runs.length > 0} onClick={apply}>
            Use as DOE ranges for {temp.label.toLowerCase()} and hold pressure
          </button>
          {study.runs.length > 0 && <span className="muted small">Runs already exist; change factor ranges on the Design tab before creating new runs.</span>}
        </div>
      )}
    </>
  )
}

// Panel --------------------------------------------------------------------------------------

const VIEWS: Record<GuideKey, (p: { study: Study; ws: Workspace }) => ReactNode> = {
  viscosity: ViscosityStudy,
  balance: BalanceStudy,
  pressureDrop: PressureDropStudy,
  gateSeal: GateSealStudy,
  cooling: CoolingStudy,
  window: WindowStudy,
}

const RESULT_VIEWS: Record<GuideKey, (p: { study: Study }) => ReactNode> = {
  viscosity: ViscosityResultView,
  balance: BalanceResultView,
  pressureDrop: PressureDropResultView,
  gateSeal: GateSealResultView,
  cooling: CoolingResultView,
  window: WindowResultView,
}

/** A study's chart and suggestion, read-only (for the report). */
export function GuideResult({ study, k }: { study: Study; k: GuideKey }) {
  const View = RESULT_VIEWS[k]
  return <View study={study} />
}

export function GuidePanel({ ws, study }: { ws: Workspace; study: Study }) {
  const [active, setActive] = useState<GuideKey>('viscosity')
  const index = GUIDE_STUDIES.findIndex((s) => s.key === active)
  const info = GUIDE_STUDIES[index]
  const next = GUIDE_STUDIES[index + 1]
  const View = VIEWS[active]
  const current = study.guide?.[active]
  const status = statusOf(study, active)
  const setMeta = (p: { skipped?: boolean; notes?: string }) => patchGuide(ws, active, DEFAULTS[active](study) as never, (x) => ({ ...x, ...p }))
  return (
    <div className="guide">
      <nav className="card guide-nav" aria-label="Molding studies">
        <p className="muted small">The six scientific molding studies, in the order to run them: each one sets something the next relies on. Skip any that don’t apply; the report shows what was done.</p>
        <ol>
          {GUIDE_STUDIES.map((s) => {
            const st = statusOf(study, s.key)
            return (
              <li key={s.key}>
                <button className={s.key === active ? 'guide-item active' : 'guide-item'} aria-current={s.key === active ? 'step' : undefined} onClick={() => setActive(s.key)}>
                  <span>{s.title}</span>
                  <span className={`status-tag ${st}`}>{STATUS_LABEL[st]}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <section className="card">
        <div className="row spread">
          <h2>{info.title}</h2>
          <span className={`status-tag ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p>{info.why}</p>
        <p className="muted small">
          <strong>How:</strong> {info.how}
        </p>
        {current?.skipped ? <p className="muted">Skipped. The report will flag it.</p> : <View study={study} ws={ws} />}
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={current?.notes ?? ''} onChange={(e) => setMeta({ notes: e.target.value })} placeholder="Material lot, press, anything that affects the result" />
        </label>
        <label className="check">
          <input type="checkbox" checked={!!current?.skipped} onChange={(e) => setMeta({ skipped: e.target.checked })} />
          Skip this study
        </label>
        {next && (
          <div className="row">
            <button className="btn" onClick={() => setActive(next.key)}>
              Next: {next.title}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

