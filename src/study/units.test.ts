import { describe, expect, it } from 'vitest'
import { deltaToDisplay, fromDisplay, toDisplay, unitLabel } from './units'

describe('units', () => {
  it('converts temperature with its offset', () => {
    expect(toDisplay(100, 'temperature', 'imperial')).toBeCloseTo(212)
    expect(fromDisplay(32, 'temperature', 'imperial')).toBeCloseTo(0)
  })

  it('converts a temperature range width without the offset', () => {
    expect(deltaToDisplay(30, 'temperature', 'imperial')).toBeCloseTo(54)
  })

  it('converts pressure, speed and force', () => {
    expect(toDisplay(1000, 'pressure', 'imperial')).toBeCloseTo(14503.77, 1)
    expect(toDisplay(25.4, 'speed', 'imperial')).toBeCloseTo(1)
    expect(toDisplay(889.6443, 'force', 'imperial')).toBeCloseTo(100, 3)
  })

  it('round-trips every quantity', () => {
    for (const q of ['temperature', 'pressure', 'speed', 'time', 'volume', 'force', 'rotation', 'mass', 'length'] as const) {
      expect(fromDisplay(toDisplay(123.4, q, 'imperial'), q, 'imperial')).toBeCloseTo(123.4, 9)
    }
  })

  it('leaves metric values alone', () => {
    expect(toDisplay(240, 'temperature', 'metric')).toBe(240)
    expect(unitLabel('pressure', 'metric')).toBe('bar')
    expect(unitLabel('pressure', 'imperial')).toBe('psi')
  })
})
