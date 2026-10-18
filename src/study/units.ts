export type UnitSystem = 'metric' | 'imperial'

/** Physical quantities a molding factor or machine limit can have. */
export type Quantity =
  | 'temperature'
  | 'pressure'
  | 'speed'
  | 'time'
  | 'volume'
  | 'force'
  | 'rotation'
  | 'mass'
  | 'length'
  | 'none'

interface UnitDef {
  metric: string
  imperial: string
  /** Converts a stored (metric) value to imperial. */
  toImperial: (v: number) => number
  /** Converts an imperial value back to stored (metric). */
  fromImperial: (v: number) => number
}

const scale = (metric: string, imperial: string, factor: number): UnitDef => ({
  metric,
  imperial,
  toImperial: (v) => v * factor,
  fromImperial: (v) => v / factor,
})

/**
 * Values are always stored in the metric unit listed here and converted only for display,
 * so a study file means the same thing whichever system its author used.
 */
export const UNITS: Record<Quantity, UnitDef> = {
  temperature: {
    metric: '°C',
    imperial: '°F',
    toImperial: (c) => (c * 9) / 5 + 32,
    fromImperial: (f) => ((f - 32) * 5) / 9,
  },
  pressure: scale('bar', 'psi', 14.503773773),
  speed: scale('mm/s', 'in/s', 1 / 25.4),
  time: scale('s', 's', 1),
  volume: scale('cm³', 'in³', 1 / 16.387064),
  force: scale('kN', 'US ton', 1 / 8.896443230521),
  rotation: scale('rpm', 'rpm', 1),
  mass: scale('g', 'oz', 1 / 28.349523125),
  length: scale('mm', 'in', 1 / 25.4),
  none: scale('', '', 1),
}

export function unitLabel(q: Quantity, system: UnitSystem): string {
  return UNITS[q][system]
}

/** Stored metric value → value in the given display system. */
export function toDisplay(value: number, q: Quantity, system: UnitSystem): number {
  return system === 'metric' ? value : UNITS[q].toImperial(value)
}

/** Value entered in the given display system → stored metric value. */
export function fromDisplay(value: number, q: Quantity, system: UnitSystem): number {
  return system === 'metric' ? value : UNITS[q].fromImperial(value)
}

/**
 * Converts a difference (a range width or step) rather than an absolute value.
 * Matters only for temperature, where the offset must not be applied.
 */
export function deltaToDisplay(delta: number, q: Quantity, system: UnitSystem): number {
  return toDisplay(delta, q, system) - toDisplay(0, q, system)
}
