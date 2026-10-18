import { describe, expect, it } from 'vitest'
import { demoStudy } from '../study/demo'
import { runTable, toCsv, workbook } from './tables'
import { buildXlsx, crc32 } from './xlsx'

describe('run table', () => {
  const s = demoStudy(new Date('2026-01-01T00:00:00Z'))

  it('has a column per factor and per cavity, in run order', () => {
    const [header, ...rows] = runTable(s)
    expect(header).toContain('Melt temperature (°C)')
    expect(header).toContain('Boss height cavity 2 (mm)')
    expect(header).toContain('Flash (1-5)')
    expect(rows.map((r) => r[0])).toEqual(rows.map((_, i) => i + 1))
  })

  it('converts to the display units', () => {
    const imperial = { ...s, units: 'imperial' as const }
    const [header, first] = runTable(imperial)
    const col = header.indexOf('Melt temperature (°F)')
    expect(col).toBeGreaterThan(0)
    const metric = s.runs.find((r) => r.order === 1)!.settings[s.factors[0].id]
    expect(first[col]).toBeCloseTo((metric * 9) / 5 + 32, 6)
  })
})

describe('csv', () => {
  it('quotes fields with commas, quotes and newlines', () => {
    expect(toCsv([['a', 'b,c'], ['say "hi"', 'x\ny'], [1.5, null]])).toBe('﻿a,"b,c"\r\n"say ""hi""","x\ny"\r\n1.5,\r\n')
  })
})

describe('xlsx', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes a zip with the workbook parts', () => {
    const bytes = buildXlsx(workbook(demoStudy()))
    const text = new TextDecoder().decode(bytes)
    expect(bytes[0]).toBe(0x50) // "PK"
    expect(bytes[1]).toBe(0x4b)
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']) expect(text).toContain(part)
    expect(text).toContain('<sheet name="Runs"')
    expect(text).toContain('Boss height cavity 1 (mm)')
  })
})
