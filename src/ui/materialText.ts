import type { MaterialCheck, Range } from '../study/material'
import type { Material, Study } from '../study/schema'
import { formatValue } from './format'

export type RangeKey = 'melt' | 'mold' | 'dryTime' | 'shrinkage'
export type ValueKey = 'dryTemp' | 'maxMoisture' | 'maxResidence' | 'meltFlow' | 'maxRegrind'

/** Datasheet fields in the order they are entered and reported. Temperatures use the study's units; the rest have fixed units. */
export const FIELDS: ({ label: string; unit?: string } & ({ range: RangeKey } | { value: ValueKey }))[] = [
  { label: 'Melt temperature', range: 'melt' },
  { label: 'Mold temperature', range: 'mold' },
  { label: 'Drying temperature', value: 'dryTemp' },
  { label: 'Drying time', range: 'dryTime', unit: 'h' },
  { label: 'Max moisture', value: 'maxMoisture', unit: '%' },
  { label: 'Max residence time', value: 'maxResidence', unit: 'min' },
  { label: 'Melt flow rate', value: 'meltFlow', unit: 'g/10 min' },
  { label: 'Mold shrinkage', range: 'shrinkage', unit: '%' },
  { label: 'Max regrind', value: 'maxRegrind', unit: '%' },
]

export const isTemperature = (f: (typeof FIELDS)[number]) => !f.unit

function valueText(v: number, unit: string | undefined, study: Study): string {
  return unit === undefined ? formatValue(v, 'temperature', study) : `${Number(v.toPrecision(5))} ${unit}`
}

/** "430 to 520 °F", "at least 2 h" or "at most 0.1 %"; empty when neither end is set. */
export function rangeText(r: Range | undefined, unit: string | undefined, study: Study): string {
  if (!r) return ''
  const { low, high } = r
  if (low !== undefined && high !== undefined) {
    const lowText = unit === undefined ? formatValue(low, 'temperature', study, false) : String(Number(low.toPrecision(5)))
    return `${lowText} to ${valueText(high, unit, study)}`
  }
  if (low !== undefined) return `at least ${valueText(low, unit, study)}`
  if (high !== undefined) return `at most ${valueText(high, unit, study)}`
  return ''
}

/** The datasheet values that are filled in, as label and text pairs. */
export function materialRows(m: Material, study: Study): [string, string][] {
  const rows: [string, string][] = []
  for (const f of FIELDS) {
    const text = 'range' in f ? rangeText(m[f.range], f.unit, study) : m[f.value] !== undefined ? valueText(m[f.value]!, f.unit, study) : ''
    if (text) rows.push([f.label, text])
  }
  return rows
}

export function materialCheckText(c: MaterialCheck, study: Study): string {
  const span = c.low === c.high ? formatValue(c.low, 'temperature', study) : `${formatValue(c.low, 'temperature', study, false)} to ${formatValue(c.high, 'temperature', study)}`
  return `${c.source} runs ${span}, outside the datasheet ${c.kind} temperature range (${rangeText(c.range, undefined, study)}).`
}
