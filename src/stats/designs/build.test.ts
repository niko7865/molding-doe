import { describe, expect, it } from 'vitest'
import { buildDesign, chooseBlockWords, type BuildOptions } from './build'
import { boxBehnkenDesign } from './boxBehnken'
import { centralCompositeDesign } from './centralComposite'
import { fractionalFactorialDesign } from './fractional'
import { fullFactorialDesign } from './fullFactorial'
import { wordName } from './words'

const opts = (o: Partial<BuildOptions> = {}): BuildOptions => ({
  centerPoints: 0,
  replicates: 1,
  blocking: { kind: 'none' },
  randomize: true,
  seed: 42,
  hardToChange: [],
  ...o,
})

describe('buildDesign', () => {
  it('adds replicates and center points and numbers the runs', () => {
    const d = buildDesign(fullFactorialDesign(3), opts({ replicates: 2, centerPoints: 3 }))
    expect(d.runs).toHaveLength(2 * (8 + 3))
    expect(d.runs.map((r) => r.order)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(new Set(d.runs.map((r) => r.std)).size).toBe(22)
    expect(d.runs.filter((r) => r.kind === 'center')).toHaveLength(6)
  })

  it('reproduces the same random order from the same seed', () => {
    const a = buildDesign(fullFactorialDesign(3), opts({ seed: 7 }))
    const b = buildDesign(fullFactorialDesign(3), opts({ seed: 7 }))
    const c = buildDesign(fullFactorialDesign(3), opts({ seed: 8 }))
    expect(a.runs.map((r) => r.std)).toEqual(b.runs.map((r) => r.std))
    expect(a.runs.map((r) => r.std)).not.toEqual(c.runs.map((r) => r.std))
  })

  it('keeps standard order when not randomized', () => {
    const d = buildDesign(fullFactorialDesign(2), opts({ randomize: false }))
    expect(d.runs.map((r) => r.coded)).toEqual([
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
  })

  it('blocks a 2^3 in two by confounding ABC', () => {
    const d = buildDesign(fullFactorialDesign(3), opts({ blocking: { kind: 'confound', blocks: 2 }, centerPoints: 1 }))
    expect(d.blockConfounding).toEqual(['ABC'])
    for (const r of d.runs.filter((r) => r.kind === 'factorial')) {
      expect(r.block).toBe(r.coded[0] * r.coded[1] * r.coded[2] > 0 ? 2 : 1)
    }
    expect(d.runs.filter((r) => r.kind === 'center').map((r) => r.block).sort()).toEqual([1, 2])
    // Runs stay together by block.
    const blocks = d.runs.map((r) => r.block)
    expect(blocks).toEqual([...blocks].sort())
  })

  it('blocks a 2^5 in four without confounding main effects or two-factor interactions', () => {
    // A 2^4 can't do this: any two three-factor words multiply to a two-factor interaction.
    expect(chooseBlockWords(4, [], 4)).toBeNull()
    const words = chooseBlockWords(5, [], 4)!
    const all = [words[0], words[1], words[0] ^ words[1]].map(wordName)
    for (const w of all) expect(w.length).toBeGreaterThanOrEqual(3)
    const d = buildDesign(fullFactorialDesign(5), opts({ blocking: { kind: 'confound', blocks: 4 } }))
    const sizes = [1, 2, 3, 4].map((b) => d.runs.filter((r) => r.block === b).length)
    expect(sizes).toEqual([8, 8, 8, 8])
  })

  it('refuses blocks that would confound a two-factor interaction', () => {
    // 2^(4-1) resolution IV: every 3-factor word aliases with a main effect.
    expect(chooseBlockWords(4, ['D=ABC'], 2)).toBeNull()
    const d = buildDesign(fractionalFactorialDesign(4, ['D=ABC']), opts({ blocking: { kind: 'confound', blocks: 2 } }))
    expect(d.warnings.join(' ')).toMatch(/too small/)
    expect(new Set(d.runs.map((r) => r.block))).toEqual(new Set([1]))
  })

  it('blocks a CCD into factorial and axial portions', () => {
    const d = buildDesign(centralCompositeDesign(2), opts({ blocking: { kind: 'axial' }, centerPoints: 2 }))
    expect(d.runs.filter((r) => r.block === 1).every((r) => r.kind !== 'axial')).toBe(true)
    expect(d.runs.filter((r) => r.block === 2).every((r) => r.kind !== 'factorial')).toBe(true)
    expect(d.runs.filter((r) => r.kind === 'center')).toHaveLength(4)
  })

  it('warns when a response-surface design has no center points', () => {
    expect(buildDesign(boxBehnkenDesign(3), opts()).warnings.join(' ')).toMatch(/center points/)
  })

  it('groups runs by a hard-to-change factor into whole plots', () => {
    const d = buildDesign(fullFactorialDesign(4), opts({ hardToChange: [3], replicates: 1 }))
    // Each mold-temp level (factor D) splits into two whole plots of 4.
    const plots = new Map<number, number[][]>()
    for (const r of d.runs) plots.set(r.wholePlot!, [...(plots.get(r.wholePlot!) ?? []), r.coded])
    expect(plots.size).toBe(4)
    for (const rows of plots.values()) {
      expect(rows).toHaveLength(4)
      expect(new Set(rows.map((c) => c[3])).size).toBe(1)
    }
    // Whole plots are contiguous in run order, so the mold temperature changes only 3 times.
    let changes = 0
    for (let i = 1; i < d.runs.length; i++) if (d.runs[i].coded[3] !== d.runs[i - 1].coded[3]) changes++
    expect(changes).toBeLessThanOrEqual(3)
    expect(d.warnings.join(' ')).toMatch(/split-plot/)
  })
})
