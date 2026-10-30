import { describe, expect, it } from 'vitest'
import { balanceVerdict, cavityBalance, coolingTime, gateSeal, guideStatus, pressureDrop, processWindow, viscosityCurve } from './studies'

describe('viscosity curve', () => {
  it('computes relative viscosity and finds where it levels off', () => {
    // Fill time halves with speed; pressure rises slowly once shear thinning flattens out.
    const speeds = [10, 20, 40, 60, 80, 100]
    const fill = [4, 2, 1, 0.66, 0.5, 0.4]
    const hyd = [40, 52, 66, 90, 115, 141]
    const r = viscosityCurve({ ratio: 10, rows: speeds.map((s, i) => ({ speed: s, fillTime: fill[i], pressure: hyd[i] })) })
    expect(r.points[0].viscosity).toBeCloseTo(40 * 10 * 4, 9)
    expect(r.points[0].pressure).toBe(400)
    expect(r.points[1].drop).toBeCloseTo(1 - 1040 / 1600, 9)
    // 660 → 594 is a 10% step; 594 → 575 → 564 are under 10%, so it levels off from 60 mm/s.
    expect(r.flatFrom).toBe(60)
  })

  it('ignores incomplete rows and sorts by speed', () => {
    const r = viscosityCurve({ ratio: 1, rows: [{ speed: 50, fillTime: 1, pressure: 500 }, { speed: null, fillTime: 2, pressure: 1 }, { speed: 20, fillTime: 2, pressure: 400 }] })
    expect(r.points.map((p) => p.speed)).toEqual([20, 50])
    expect(r.flatFrom).toBeNull()
  })
})

describe('cavity balance', () => {
  it('reports imbalance against the heaviest cavity', () => {
    const r = cavityBalance({ rows: [[10, 9.5, null], [10, 9.3, null]] }, 3)
    expect(r.means).toEqual([10, 9.4, null])
    expect(r.imbalance).toBeCloseTo(6, 9)
    expect(r.heaviest).toBe(0)
    expect(r.lightest).toBe(1)
    expect(balanceVerdict(r.imbalance!)).toBe('watch')
    expect(balanceVerdict(r.imbalance!, 8)).toBe('good')
    expect(balanceVerdict(r.imbalance!, 2)).toBe('poor')
  })
})

describe('pressure drop', () => {
  it('converts readings to plastic pressure and flags a pressure-limited process', () => {
    const r = pressureDrop({ ratio: 10, rows: [{ segment: 'Nozzle', pressure: 30 }, { segment: 'Runner', pressure: 80 }, { segment: 'Part', pressure: 165 }] }, 1800)
    expect(r.segments.map((s) => s.drop)).toEqual([300, 500, 850])
    expect(r.usage).toBeCloseTo(1650 / 1800, 9)
    expect(r.verdict).toBe('limited')
  })
})

describe('gate seal', () => {
  it('finds the hold time where weight stops rising and adds a margin', () => {
    const r = gateSeal({ rows: [1, 2, 3, 4, 5, 6, 7].map((t, i) => ({ time: t, weight: [30.1, 30.6, 30.9, 31.0, 31.01, 31.005, 31.01][i] })) })
    expect(r.sealTime).toBe(4)
    expect(r.suggested).toBeCloseTo(4.5, 9)
    expect(r.stillRising).toBe(false)
  })

  it('uses a custom sealed weight-change threshold', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((t, i) => ({ time: t, weight: [30, 30.5, 30.9, 30.96, 30.99, 31][i] }))
    expect(gateSeal({ rows }).sealTime).toBe(5)
    expect(gateSeal({ rows, tolerance: 0.2 }).sealTime).toBe(4)
  })

  it('says so when the weight is still rising', () => {
    const r = gateSeal({ rows: [1, 2, 3].map((t) => ({ time: t, weight: 30 + t })) })
    expect(r.stillRising).toBe(true)
    expect(r.suggested).toBeNull()
  })
})

describe('cooling time', () => {
  const rows = [8, 10, 12, 14, 16, 18].map((t, i) => ({ time: t, value: [52.2, 52.32, 52.39, 52.42, 52.43, 52.43][i] }))
  it('uses the spec when given', () => {
    expect(coolingTime({ label: 'Boss', quantity: 'length', specLow: 52.38, specHigh: 52.5, rows }).shortest).toBe(12)
  })
  it('falls back to where the value stops changing', () => {
    const r = coolingTime({ label: 'Boss', quantity: 'length', rows })
    expect(r.basis).toBe('stable')
    expect(r.shortest).toBe(14)
  })
})

describe('process window', () => {
  it('boxes the good settings, shrinking the box to leave defects out', () => {
    const r = processWindow({
      rows: [
        { temp: 230, hold: 400, outcome: 'short' },
        { temp: 240, hold: 500, outcome: 'good' },
        { temp: 250, hold: 600, outcome: 'good' },
        { temp: 245, hold: 550, outcome: 'sink' },
        { temp: 260, hold: 700, outcome: 'flash' },
      ],
    })
    // The sink at (245, 550) sits inside the 240–250 / 500–600 box; every side pull keeps one good point.
    expect(r.trimmed).toBe(true)
    expect(r.temp === null || r.hold === null).toBe(true)
  })

  it('trims defective corners off a 3 × 3 grid', () => {
    const grid = [220, 235, 250].flatMap((temp) => [400, 550, 700].map((hold) => ({ temp, hold, outcome: 'good' as const })))
    grid[0] = { ...grid[0], outcome: 'short' as never }
    grid[8] = { ...grid[8], outcome: 'flash' as never }
    const r = processWindow({ rows: grid })
    expect(r.trimmed).toBe(true)
    const box = { temp: r.temp!, hold: r.hold! }
    expect(grid.filter((g) => g.outcome !== 'good').some((g) => g.temp >= box.temp[0] && g.temp <= box.temp[1] && g.hold >= box.hold[0] && g.hold <= box.hold[1])).toBe(false)
    expect(box.temp[1] - box.temp[0] > 0 && box.hold[1] - box.hold[0] > 0).toBe(true)
  })
})

describe('status', () => {
  it('distinguishes open, skipped and done', () => {
    expect(guideStatus(undefined, 'gateSeal', 1)).toBe('open')
    expect(guideStatus({ gateSeal: { skipped: true, rows: [] } }, 'gateSeal', 1)).toBe('skipped')
    expect(guideStatus({ balance: { rows: [[1, 1]] } }, 'balance', 2)).toBe('done')
  })
})
