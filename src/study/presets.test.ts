import { describe, expect, it } from 'vitest'
import { checkMachineLimits, factorFromPreset } from './presets'

describe('checkMachineLimits', () => {
  const speed = factorFromPreset('injection_speed')
  const hold = factorFromPreset('hold_pressure')
  const melt = factorFromPreset('melt_temp')
  const factors = [speed, hold, melt]

  it('flags setpoints above the press limits', () => {
    const v = checkMachineLimits(
      factors,
      { [speed.id]: 150, [hold.id]: 1500, [melt.id]: 400 },
      { name: 'Press 7', maxInjectionSpeed: 120, maxInjectionPressure: 2000 },
    )
    expect(v).toEqual([{ factorId: speed.id, factorName: 'Injection speed', value: 150, limit: 120, limitName: 'maxInjectionSpeed' }])
  })

  it('skips limits the profile leaves blank, and runs with no machine', () => {
    expect(checkMachineLimits(factors, { [speed.id]: 999 }, { name: 'Press 7' })).toEqual([])
    expect(checkMachineLimits(factors, { [speed.id]: 999 }, null)).toEqual([])
  })

  it('marks mold temperature as hard to change', () => {
    expect(factorFromPreset('mold_temp').hardToChange).toBe(true)
    expect(() => factorFromPreset('nope')).toThrow()
  })
})
