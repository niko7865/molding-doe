import { doeEnabled, type Material, type Study } from './schema'

export type Range = NonNullable<Material['melt']>
export type TemperatureKind = 'melt' | 'mold'

/** Which factor presets take the datasheet's melt and mold temperature ranges. */
export const TEMPERATURE_PRESETS: Record<TemperatureKind, string> = { melt: 'melt_temp', mold: 'mold_temp' }

/** A temperature span in the study that reaches outside the datasheet range. */
export interface MaterialCheck {
  /** Where the span comes from, e.g. 'Factor "Melt temperature"'. */
  source: string
  kind: TemperatureKind
  low: number
  high: number
  range: Range
}

// Unit conversion leaves float noise (482.00000000001), so allow a hair over the limit.
const EPS = 1e-6

export function outsideRange(low: number, high: number, range: Range | undefined): boolean {
  if (!range) return false
  return (range.low !== undefined && low < range.low - EPS) || (range.high !== undefined && high > range.high + EPS)
}

/** The datasheet range when both ends are filled in, for seeding grids and ranges. */
export function fullRange(range: Range | undefined): [number, number] | undefined {
  return range?.low !== undefined && range.high !== undefined && range.low < range.high ? [range.low, range.high] : undefined
}

/** DOE factor ranges and process window settings that fall outside the datasheet's temperature ranges. */
export function checkMaterial(study: Study): MaterialCheck[] {
  const m = study.material
  if (!m) return []
  const out: MaterialCheck[] = []
  if (doeEnabled(study)) {
    for (const kind of ['melt', 'mold'] as const) {
      const range = m[kind]
      for (const f of study.factors.filter((x) => x.preset === TEMPERATURE_PRESETS[kind])) {
        if (outsideRange(f.low, f.high, range)) out.push({ source: `Factor "${f.name}"`, kind, low: f.low, high: f.high, range: range! })
      }
    }
  }
  const w = study.guide?.window
  const temps = (w?.rows ?? []).map((r) => r.temp).filter((t): t is number => t !== null)
  if (w && !w.skipped && temps.length) {
    const low = Math.min(...temps)
    const high = Math.max(...temps)
    const range = m[w.temperature]
    if (outsideRange(low, high, range)) out.push({ source: 'The process window study', kind: w.temperature, low, high, range: range! })
  }
  return out
}
