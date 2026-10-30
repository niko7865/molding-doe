import { describe, expect, it } from 'vitest'
import { balanceVerdict, cavityBalance, coolingTime, gateSeal, guideStatus, pressureDrop, processWindow, viscosityCurve } from './studies'

describe('viscosity curve', () => {
  it('computes relative viscosity and finds where it levels off', () => {
    // Fill time halves with speed; pressure rises slowly once shear thinning flattens out.
    const speeds = [10, 20, 40, 60, 80, 100]
    const fill = [4, 2, 1, 0.66, 0.5, 0.4]
    const hyd = [40, 52, 66, 90, 115, 141]
    const r = viscosityCurve({ ratio: 10, fit: false, rows: speeds.map((s, i) => ({ speed: s, fillTime: fill[i], pressure: hyd[i] })) })
    expect(r.points[0].viscosity).toBeCloseTo(40 * 10 * 4, 9)
    expect(r.points[0].pressure).toBe(400)
    expect(r.points[1].drop).toBeCloseTo(1 - 1040 / 1600, 9)
    // 660 → 594 is a 10% step; 594 → 575 → 564 are under 10%, so it levels off from 60 mm/s.
    expect(r.flatFrom).toBe(60)
    expect(r.basis).toBe('data')
    const rows = speeds.map((s, i) => ({ speed: s, fillTime: fill[i], pressure: hyd[i] }))
    expect(viscosityCurve({ ratio: 10, fit: false, threshold: 15, rows }).flatFrom).toBe(40)
    expect(viscosityCurve({ ratio: 10, fit: false, threshold: 3, rows }).flatFrom).toBe(80)
  })

  it('fits a leveling power law and applies the threshold to the fitted curve', () => {
    // Exact curve: 500 + 20000 · speed^−1.2.
    const speeds = [10, 20, 40, 60, 80, 100]
    const rows = speeds.map((s) => ({ speed: s, fillTime: 1, pressure: 500 + 20000 * s ** -1.2 }))
    const r = viscosityCurve({ ratio: 1, rows })
    expect(r.basis).toBe('fit')
    expect(r.fit!.floor).toBeCloseTo(500, 3)
    expect(r.fit!.m).toBeCloseTo(1.2, 4)
    expect(r.fit!.r2).toBeCloseTo(1, 9)
    // Fitted steps: 40→60 is 13.6%, 60→80 is 8.0%, 80→100 is 5.3%.
    expect(r.flatFrom).toBe(60)
    expect(viscosityCurve({ ratio: 1, threshold: 6, rows }).flatFrom).toBe(80)
  })

  it('smooths a noisy point that would stop the step rule', () => {
    const speeds = [10, 20, 40, 60, 80, 100]
    const noise = [0, 0, 0, 0, 25, -25]
    const rows = speeds.map((s, i) => ({ speed: s, fillTime: 1, pressure: 500 + 20000 * s ** -1.2 + noise[i] }))
    expect(viscosityCurve({ ratio: 1, fit: false, rows }).flatFrom).toBeNull()
    expect(viscosityCurve({ ratio: 1, rows }).flatFrom).toBe(60)
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
  const rows7 = [1, 2, 3, 4, 5, 6, 7].map((t, i) => ({ time: t, weight: [30.1, 30.6, 30.9, 31.0, 31.01, 31.005, 31.01][i] }))
  it('finds the hold time where weight stops rising and adds a margin', () => {
    const r = gateSeal({ rows: rows7, fit: false })
    expect(r.sealTime).toBe(4)
    expect(r.suggested).toBeCloseTo(4.5, 9)
    expect(r.stillRising).toBe(false)
    expect(r.basis).toBe('data')
  })

  it('uses a custom sealed weight-change threshold', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((t, i) => ({ time: t, weight: [30, 30.5, 30.9, 30.96, 30.99, 31][i] }))
    expect(gateSeal({ rows, fit: false }).sealTime).toBe(5)
    expect(gateSeal({ rows, fit: false, tolerance: 0.2 }).sealTime).toBe(4)
    // The fitted curve moves the same way with the threshold.
    expect(gateSeal({ rows, tolerance: 0.2 }).sealTime!).toBeLessThan(gateSeal({ rows }).sealTime!)
  })

  it('fits a freeze-off curve and reads the seal time from it', () => {
    const r = gateSeal({ rows: rows7 })
    expect(r.basis).toBe('fit')
    expect(r.fit!.r2).toBeGreaterThan(0.99)
    expect(r.fit!.sealed).toBeCloseTo(31.015, 2)
    expect(r.sealTime!).toBeGreaterThan(3.5)
    expect(r.sealTime!).toBeLessThan(4.5)
    expect(r.suggested).toBeCloseTo(r.sealTime! + 0.5, 9)
  })

  it('reports a fitted seal time beyond the range tested as still rising', () => {
    // Freezes off at 10 s, but only 1–5 s tested.
    const w = (t: number) => { const g = 1 - Math.sqrt(Math.min(t, 10) / 10); return 31 - 3 * 10 * (g ** 3 / 3 - g ** 4 / 4) }
    const r = gateSeal({ rows: [1, 2, 3, 4, 5].map((t) => ({ time: t, weight: w(t) })) })
    expect(r.stillRising).toBe(true)
    expect(r.sealTime).toBeNull()
    expect(r.predicted!).toBeGreaterThan(5)
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
    expect(coolingTime({ label: 'Boss', quantity: 'length', fit: false, specLow: 52.38, specHigh: 52.5, rows }).shortest).toBe(12)
  })
  it('falls back to where the value stops changing', () => {
    const r = coolingTime({ label: 'Boss', quantity: 'length', fit: false, rows })
    expect(r.basis).toBe('stable')
    expect(r.shortest).toBe(14)
  })
  it('fits an exponential approach and solves for the spec crossing', () => {
    // Exact curve: 52.45 − 0.4 · e^(−(t − 8)/3).
    const exact = [8, 10, 12, 14, 16, 18].map((t) => ({ time: t, value: 52.45 - 0.4 * Math.exp(-(t - 8) / 3) }))
    const r = coolingTime({ label: 'Boss', quantity: 'length', specLow: 52.4, rows: exact })
    expect(r.source).toBe('fit')
    expect(r.fit!.plateau).toBeCloseTo(52.45, 6)
    expect(r.fit!.tau).toBeCloseTo(3, 4)
    expect(r.shortest).toBe(Math.ceil((8 + 3 * Math.log(8)) * 10) / 10)
    // Without a spec: settled once within 5% of the change, 3·ln 20 after the first time.
    expect(coolingTime({ label: 'Boss', quantity: 'length', rows: exact }).shortest).toBe(Math.ceil((8 + 3 * Math.log(20)) * 10) / 10)
    // A plateau outside the spec never gets there.
    expect(coolingTime({ label: 'Boss', quantity: 'length', specLow: 52.5, rows: exact }).shortest).toBeNull()
  })
  it('handles a falling measurement against an upper limit', () => {
    const exact = [5, 10, 15, 20, 25].map((t) => ({ time: t, value: 1.2 + 2 * Math.exp(-(t - 5) / 6) }))
    const r = coolingTime({ label: 'Warp', quantity: 'length', specHigh: 1.5, rows: exact })
    expect(r.shortest).toBe(Math.ceil((5 + 6 * Math.log(2 / 0.3)) * 10) / 10)
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
