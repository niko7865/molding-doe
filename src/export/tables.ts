import { GUIDE_STUDIES, maxPressure } from '../guide/info'
import { cavityBalance, coolingTime, gateSeal, pressureDrop, processWindow, viscosityCurve } from '../guide/studies'
import { doeEnabled, type Response, type Run, type Study } from '../study/schema'
import { settingsTable } from '../study/settings'
import { toDisplay, unitLabel } from '../study/units'
import type { Cell, Sheet } from './xlsx'

const KIND_LABEL: Record<string, string> = { factorial: 'Factorial', center: 'Center', axial: 'Axial', edge: 'Edge' }
const STATUS_LABEL: Record<Run['status'], string> = { pending: 'To do', done: 'Done', aborted: 'Aborted' }

/** Trims float noise from unit conversion (482.00000000001 → 482). */
const clean = (v: number) => Number(v.toPrecision(10))

const withUnit = (name: string, unit: string) => (unit ? `${name} (${unit})` : name)

function responseUnit(r: Response, study: Study): string {
  if (r.kind === 'passfail') return `defective of ${r.shots ?? 1}`
  if (r.kind === 'rating') return '1-5'
  return unitLabel(r.quantity, study.units)
}

function responseColumns(r: Response, study: Study): string[] {
  const unit = responseUnit(r, study)
  if (!r.perCavity || study.cavities === 1) return [withUnit(r.name, unit)]
  return Array.from({ length: study.cavities }, (_, c) => withUnit(`${r.name} cavity ${c + 1}`, unit))
}

/** One row per run in run order: setpoints and raw results in the study's display units. */
export function runTable(study: Study): Cell[][] {
  const runs = [...study.runs].sort((a, b) => a.order - b.order)
  const blocks = new Set(runs.map((r) => r.block ?? 1)).size > 1
  const plots = runs.some((r) => r.wholePlot)
  const stages = runs.some((r) => (r.stage ?? 1) > 1)
  const header: Cell[] = [
    'Run order',
    'Std order',
    ...(stages ? ['Stage'] : []),
    ...(blocks ? ['Block'] : []),
    ...(plots ? ['Whole plot'] : []),
    'Point type',
    'Status',
    ...study.factors.map((f) => withUnit(f.name, unitLabel(f.quantity, study.units))),
    ...study.responses.flatMap((r) => responseColumns(r, study)),
    'Notes',
  ]
  const rows = runs.map((r): Cell[] => [
    r.order,
    r.std ?? null,
    ...(stages ? [r.stage ?? 1] : []),
    ...(blocks ? [r.block ?? 1] : []),
    ...(plots ? [r.wholePlot ?? null] : []),
    r.kind ? KIND_LABEL[r.kind] : null,
    r.archived ? `${STATUS_LABEL[r.status]}, earlier region` : STATUS_LABEL[r.status],
    ...study.factors.map((f) => (r.settings[f.id] === undefined ? null : clean(toDisplay(r.settings[f.id], f.quantity, study.units)))),
    ...study.responses.flatMap((resp) => {
      const values = r.results[resp.id] ?? []
      const width = responseColumns(resp, study).length
      return Array.from({ length: width }, (_, i) => {
        const v = values[i]
        return v === null || v === undefined ? null : resp.kind === 'continuous' ? clean(toDisplay(v, resp.quantity, study.units)) : v
      })
    }),
    [r.notes, r.status === 'aborted' && r.abortReason ? `Aborted: ${r.abortReason}` : ''].filter(Boolean).join(' · ') || null,
  ])
  return [header, ...rows]
}

export function factorTable(study: Study): Cell[][] {
  return [
    ['Factor', 'Unit', 'Low', 'High', 'Hard to change'],
    ...study.factors.map((f) => [
      f.name,
      unitLabel(f.quantity, study.units) || null,
      clean(toDisplay(f.low, f.quantity, study.units)),
      clean(toDisplay(f.high, f.quantity, study.units)),
      f.hardToChange ? 'Yes' : 'No',
    ]),
  ]
}

/** Process settings of the molding studies, one column per study, in display units. */
export function settingsSheet(study: Study): Cell[][] {
  const t = settingsTable(study)
  if (!t.rows.length) return []
  return [
    ['Setting', 'Unit', ...t.studies.map((k) => GUIDE_STUDIES.find((g) => g.key === k)!.title)],
    ...t.rows.map((r) => [r.label, unitLabel(r.quantity, study.units), ...r.values.map((v) => (typeof v === 'number' ? clean(toDisplay(v, r.quantity, study.units)) : (v ?? null)))]),
  ]
}

/** One sheet per scientific molding study that has recorded data, in display units. */
export function guideSheets(study: Study): Sheet[] {
  const g = study.guide
  if (!g) return []
  const out: Sheet[] = []
  const u = study.units
  const pUnit = unitLabel('pressure', u)
  const sUnit = unitLabel('speed', u)
  const mUnit = unitLabel('mass', u)
  const tUnit = unitLabel('temperature', u)

  if (g.viscosity && !g.viscosity.skipped) {
    const r = viscosityCurve(g.viscosity, maxPressure(study))
    if (r.points.length) {
      out.push({
        name: 'Viscosity curve',
        rows: [
          [
            withUnit('Injection speed', sUnit),
            'Fill time (s)',
            'Shear rate (1/s)',
            withUnit('Plastic pressure', pUnit),
            withUnit('Relative viscosity', `${pUnit}·s`),
            'Step drop (%)',
            'Pressure-limited',
          ],
          ...r.points.map((p): Cell[] => [
            clean(toDisplay(p.speed, 'speed', u)),
            clean(p.fillTime),
            clean(p.shearRate),
            clean(toDisplay(p.pressure, 'pressure', u)),
            clean(toDisplay(p.viscosity, 'pressure', u)),
            p.drop === null ? null : clean(p.drop * 100),
            p.pressureLimited ? 'Yes' : 'No',
          ]),
        ],
      })
    }
  }

  if (g.balance && !g.balance.skipped) {
    const r = cavityBalance(g.balance, study.cavities)
    const filledRows = g.balance.rows.filter((row) => row.some((v) => v !== null))
    if (filledRows.length) {
      out.push({
        name: 'Cavity balance',
        rows: [
          ['Shot', ...Array.from({ length: study.cavities }, (_, c) => withUnit(`Cavity ${c + 1}`, mUnit))],
          ...filledRows.map((row, i): Cell[] => [
            i + 1,
            ...Array.from({ length: study.cavities }, (_, c) => (row[c] === null || row[c] === undefined ? null : clean(toDisplay(row[c]!, 'mass', u)))),
          ]),
          ['Mean', ...r.means.map((m) => (m === null ? null : clean(toDisplay(m, 'mass', u))))],
        ],
      })
    }
  }

  if (g.pressureDrop && !g.pressureDrop.skipped) {
    const r = pressureDrop(g.pressureDrop, maxPressure(study))
    if (r.segments.length) {
      out.push({
        name: 'Pressure drop',
        rows: [
          ['Flow segment', withUnit('Cumulative plastic pressure', pUnit), withUnit('Segment drop', pUnit)],
          ...r.segments.map((s): Cell[] => [s.segment, clean(toDisplay(s.pressure, 'pressure', u)), clean(toDisplay(s.drop, 'pressure', u))]),
        ],
      })
    }
  }

  if (g.gateSeal && !g.gateSeal.skipped) {
    const r = gateSeal(g.gateSeal)
    if (r.points.length) {
      out.push({
        name: 'Gate seal',
        rows: [
          ['Hold time (s)', withUnit('Part weight', mUnit)],
          ...r.points.map((p): Cell[] => [clean(p.time), clean(toDisplay(p.weight, 'mass', u))]),
        ],
      })
    }
  }

  if (g.cooling && !g.cooling.skipped) {
    const r = coolingTime(g.cooling)
    if (r.points.length) {
      const cUnit = unitLabel(g.cooling.quantity, u)
      out.push({
        name: 'Cooling time',
        rows: [
          ['Cooling time (s)', withUnit(g.cooling.label || 'Measurement', cUnit)],
          ...r.points.map((p): Cell[] => [clean(p.time), clean(toDisplay(p.value, g.cooling!.quantity, u))]),
        ],
      })
    }
  }

  if (g.window && !g.window.skipped) {
    const r = processWindow(g.window)
    const all = [...r.good.map((x) => ({ ...x, outcome: 'good' })), ...r.bad]
    if (all.length) {
      const tempLabel = g.window.temperature === 'melt' ? 'Melt temperature' : 'Mold temperature'
      out.push({
        name: 'Process window',
        rows: [
          [withUnit(tempLabel, tUnit), withUnit('Hold pressure', pUnit), 'Outcome'],
          ...all.map((p): Cell[] => [clean(toDisplay(p.temp, 'temperature', u)), clean(toDisplay(p.hold, 'pressure', u)), p.outcome]),
        ],
      })
    }
  }

  return out
}

export function workbook(study: Study): Sheet[] {
  const settings = settingsSheet(study)
  const doe = doeEnabled(study)
  return [
    ...(doe && study.runs.length ? [{ name: 'Runs', rows: runTable(study) }] : []),
    ...(doe && study.factors.length ? [{ name: 'Factors', rows: factorTable(study) }] : []),
    ...(settings.length ? [{ name: 'Process settings', rows: settings }] : []),
    ...guideSheets(study),
  ]
}

/** RFC 4180 CSV with a byte-order mark so Excel reads °F and other symbols correctly. */
export function toCsv(rows: Cell[][]): string {
  const field = (v: Cell) => {
    if (v === null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n'
}
