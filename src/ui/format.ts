import type { Study } from '../study/schema'
import { toDisplay, unitLabel, type Quantity } from '../study/units'

/** A stored metric value in the study's display units, e.g. "455 °F" or "12.4 mm". */
export function formatValue(v: number, q: Quantity, study: Pick<Study, 'units'>, withUnit = true): string {
  const d = Number(toDisplay(v, q, study.units).toPrecision(5))
  const unit = unitLabel(q, study.units)
  return withUnit && unit ? `${d} ${unit}` : String(d)
}
