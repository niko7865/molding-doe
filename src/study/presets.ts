import type { Factor, MachineProfile } from './schema'
import { newId } from './schema'
import type { Quantity } from './units'

export interface FactorPreset {
  key: string
  name: string
  quantity: Quantity
  /** Typical starting range, metric. The user always adjusts this to the material and mold. */
  low: number
  high: number
  hardToChange: boolean
  /** The machine limit this factor is checked against, if any. */
  limit?: keyof Omit<MachineProfile, 'name'>
}

export const FACTOR_PRESETS: FactorPreset[] = [
  { key: 'melt_temp', name: 'Melt temperature', quantity: 'temperature', low: 220, high: 250, hardToChange: false },
  { key: 'mold_temp', name: 'Mold temperature', quantity: 'temperature', low: 40, high: 70, hardToChange: true },
  { key: 'injection_speed', name: 'Injection speed', quantity: 'speed', low: 50, high: 120, hardToChange: false, limit: 'maxInjectionSpeed' },
  { key: 'hold_pressure', name: 'Hold pressure', quantity: 'pressure', low: 400, high: 700, hardToChange: false, limit: 'maxInjectionPressure' },
  { key: 'hold_time', name: 'Hold time', quantity: 'time', low: 3, high: 8, hardToChange: false },
  { key: 'cooling_time', name: 'Cooling time', quantity: 'time', low: 10, high: 25, hardToChange: false },
  { key: 'back_pressure', name: 'Back pressure', quantity: 'pressure', low: 50, high: 150, hardToChange: false, limit: 'maxInjectionPressure' },
  { key: 'screw_rpm', name: 'Screw speed', quantity: 'rotation', low: 60, high: 120, hardToChange: false, limit: 'maxScrewRpm' },
]

export function factorFromPreset(key: string): Factor {
  const p = FACTOR_PRESETS.find((f) => f.key === key)
  if (!p) throw new Error(`Unknown factor preset: ${key}`)
  return {
    id: newId(),
    name: p.name,
    preset: p.key,
    quantity: p.quantity,
    low: p.low,
    high: p.high,
    hardToChange: p.hardToChange,
  }
}

export interface LimitViolation {
  factorId: string
  factorName: string
  value: number
  limit: number
  limitName: keyof Omit<MachineProfile, 'name'>
}

/** Setpoints that exceed the press's limits. Factors without a preset limit are not checked. */
export function checkMachineLimits(
  factors: Factor[],
  settings: Record<string, number>,
  machine: MachineProfile | null,
): LimitViolation[] {
  if (!machine) return []
  const out: LimitViolation[] = []
  for (const f of factors) {
    const limitName = FACTOR_PRESETS.find((p) => p.key === f.preset)?.limit
    const limit = limitName && machine[limitName]
    const value = settings[f.id]
    if (limitName && limit !== undefined && value !== undefined && value > limit) {
      out.push({ factorId: f.id, factorName: f.name, value, limit, limitName })
    }
  }
  return out
}
