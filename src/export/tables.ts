import { GUIDE_STUDIES } from '../guide/info'
import type { Response, Run, Study } from '../study/schema'
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

export function workbook(study: Study): Sheet[] {
  const settings = settingsSheet(study)
  return [
    { name: 'Runs', rows: runTable(study) },
    { name: 'Factors', rows: factorTable(study) },
    ...(settings.length ? [{ name: 'Process settings', rows: settings }] : []),
  ]
}

/** RFC 4180 CSV with a byte-order mark so Excel reads °C and other symbols correctly. */
export function toCsv(rows: Cell[][]): string {
  const field = (v: Cell) => {
    if (v === null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n'
}
