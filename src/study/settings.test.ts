import { describe, expect, it } from 'vitest'
import { settingsSheet } from '../export/tables'
import { demoStudy } from './demo'
import { parseStudy, serializeStudy } from './file'
import { createStudy, type Study } from './schema'
import { checkSettings, copiedSettings, previousWithSettings, settingsCount, settingsTable, variedSettings } from './settings'
import { fromDisplay } from './units'
import { makeTestStudy } from './testStudy'

const degF = (v: number) => fromDisplay(v, 'temperature', 'imperial')
const psi = (v: number) => fromDisplay(v, 'pressure', 'imperial')

const withGuide = (guide: Study['guide'], material?: Study['material']): Study => ({ ...createStudy('x'), guide, material })

describe('process settings', () => {
  it('are kept through save and open', () => {
    const s = withGuide({ gateSeal: { rows: [], settings: { melt: degF(460), hold: psi(8000) }, customSettings: [{ id: 'a', name: 'Hot runner', quantity: 'temperature', value: degF(470) }] } })
    expect(parseStudy(serializeStudy(s)).guide).toEqual(s.guide)
  })

  it('are optional, so files saved before them still open', () => {
    expect(parseStudy(JSON.stringify(makeTestStudy())).guide?.viscosity?.settings).toBeUndefined()
  })

  it('leave out what the process window varies', () => {
    const s = withGuide({ window: { temperature: 'mold', rows: [] } })
    expect(variedSettings(s, 'window')).toEqual(['hold', 'moldMoving', 'moldFixed'])
    expect(variedSettings(s, 'gateSeal')).toEqual([])
    expect(settingsCount(s, 'window')).toEqual({ filled: 0, total: 6 })
  })

  it('copy from the nearest earlier study that has some, minus varied ones', () => {
    const s = withGuide({
      viscosity: { ratio: 1, rows: [], settings: { melt: degF(450) } },
      balance: { rows: [] },
      gateSeal: { rows: [], settings: { melt: degF(460), hold: psi(8000) }, customSettings: [{ id: 'a', name: 'Tip', quantity: 'temperature', value: 250 }] },
      window: { temperature: 'melt', rows: [] },
    })
    expect(previousWithSettings(s, 'balance')).toBe('viscosity')
    expect(previousWithSettings(s, 'window')).toBe('gateSeal')
    expect(previousWithSettings(s, 'viscosity')).toBeUndefined()
    const copy = copiedSettings(s, 'gateSeal', 'window')
    expect(copy.settings).toBeUndefined()
    expect(copy.customSettings).toMatchObject([{ name: 'Tip', value: 250 }])
    expect(copy.customSettings![0].id).not.toBe('a')
  })

  it('flag melt and mold temperatures outside the datasheet, not barrel set points', () => {
    const s = withGuide(
      { viscosity: { ratio: 1, rows: [], settings: { melt: degF(530), barrelFront: degF(540), moldMoving: degF(140) } } },
      { name: 'ABS', melt: { low: degF(430), high: degF(520) }, mold: { low: degF(120), high: degF(180) } },
    )
    expect(checkSettings(s)).toMatchObject([{ kind: 'range', study: 'viscosity', setting: 'melt' }])
  })

  it('note a later study that drifted more than 20 °F from the viscosity curve', () => {
    const at = (melt: number) => withGuide({ viscosity: { ratio: 1, rows: [], settings: { melt: degF(460) } }, cooling: { label: 'x', quantity: 'length', rows: [], settings: { melt: degF(melt) } } })
    expect(checkSettings(at(480))).toEqual([])
    expect(checkSettings(at(485))).toMatchObject([{ kind: 'drift', study: 'cooling', setting: 'melt' }])
    // Skipped studies are not checked.
    const skipped = at(500)
    skipped.guide!.cooling!.skipped = true
    expect(checkSettings(skipped)).toEqual([])
  })

  it('line up across studies in the report and the Excel sheet', () => {
    const s = demoStudy()
    const t = settingsTable(s)
    expect(t.studies).toEqual(['viscosity', 'balance', 'pressureDrop', 'gateSeal', 'cooling', 'window'])
    const melt = t.rows.find((r) => r.label.startsWith('Melt'))!
    expect(melt.values[5]).toBe('varied')
    expect(t.rows.map((r) => r.label)).toContain('Hot runner tip')
    const sheet = settingsSheet(s)
    expect(sheet[0]).toEqual(['Setting', 'Unit', 'Viscosity curve', 'Cavity balance', 'Pressure drop', 'Gate seal', 'Cooling time', 'Process window'])
    expect(sheet.find((r) => r[0] === 'Melt temperature, measured')).toEqual(['Melt temperature, measured', '°F', 460, 460, 460, 460, 465, 'varied'])
    expect(sheet.find((r) => r[0] === 'Hold pressure')).toEqual(['Hold pressure', 'psi', null, null, 8000, 8000, 8000, 'varied'])
    // The demo stays inside its own datasheet and within 20 °F of the viscosity curve.
    expect(checkSettings(s)).toEqual([])
  })
})
