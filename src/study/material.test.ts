import { describe, expect, it } from 'vitest'
import { demoStudy } from './demo'
import { parseStudy, serializeStudy } from './file'
import { checkMaterial, fullRange } from './material'
import { factorFromPreset } from './presets'
import { createStudy, type Study } from './schema'
import { makeTestStudy } from './testStudy'

describe('material data', () => {
  it('is kept through save and open', () => {
    const s: Study = { ...makeTestStudy(), material: { name: 'PP homopolymer', melt: { low: 200, high: 260 }, dryTime: { high: 2 }, maxMoisture: 0.05 } }
    expect(parseStudy(serializeStudy(s)).material).toEqual(s.material)
  })

  it('is optional, so files saved before it existed still open', () => {
    expect(parseStudy(JSON.stringify(makeTestStudy())).material).toBeUndefined()
  })

  it('flags DOE temperature factors outside the datasheet range', () => {
    const melt = { ...factorFromPreset('melt_temp'), low: 210, high: 250 }
    const s: Study = { ...createStudy('x'), doe: true, factors: [melt], material: { name: 'ABS', melt: { low: 220, high: 260 } } }
    expect(checkMaterial(s)).toMatchObject([{ kind: 'melt', low: 210, high: 250 }])
    expect(checkMaterial({ ...s, factors: [{ ...melt, low: 225 }] })).toEqual([])
    // With the DOE stage off, factors aren't checked.
    expect(checkMaterial({ ...s, doe: false })).toEqual([])
  })

  it('checks the process window against the temperature it varies', () => {
    const s: Study = {
      ...createStudy('x'),
      material: { name: 'ABS', melt: { high: 260 }, mold: { low: 40, high: 80 } },
      guide: { window: { temperature: 'mold', rows: [{ temp: 30, hold: 500, outcome: 'good' }, { temp: 60, hold: 500, outcome: 'good' }, { temp: null, hold: 500, outcome: 'good' }] } },
    }
    expect(checkMaterial(s)).toMatchObject([{ kind: 'mold', low: 30, high: 60 }])
  })

  it('uses only complete ranges to seed grids', () => {
    expect(fullRange({ low: 200, high: 260 })).toEqual([200, 260])
    expect(fullRange({ low: 200 })).toBeUndefined()
  })

  it('agrees with the demo study', () => {
    const demo = demoStudy()
    expect(demo.material?.name).toBeTruthy()
    expect(checkMaterial(demo)).toEqual([])
  })
})
