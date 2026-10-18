import { describe, expect, it } from 'vitest'
import { MergeError, mergeStudies, resolveConflict } from './merge'
import type { Run, Study } from './schema'
import { makeTestStudy } from './testStudy'

function withRun(study: Study, id: string, change: Partial<Run>): Study {
  return { ...study, runs: study.runs.map((r) => (r.id === id ? { ...r, ...change } : r)) }
}

describe('mergeStudies', () => {
  it('fills values that only the other copy has', () => {
    const mine = makeTestStudy()
    const theirs = withRun(mine, 'r1', {
      results: { weight: [12.1, 12.3], flash: [1, 2] },
      status: 'done',
      notes: 'short shot on first 2',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    const { merged, conflicts, filled } = mergeStudies(mine, theirs)
    expect(conflicts).toEqual([])
    expect(filled).toBe(4)
    expect(merged.runs[0]).toMatchObject({
      results: { weight: [12.1, 12.3], flash: [1, 2] },
      status: 'done',
      notes: 'short shot on first 2',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(merged.runs[1]).toEqual(mine.runs[1])
  })

  it('keeps my values when the other copy is empty', () => {
    const mine = withRun(makeTestStudy(), 'r1', { results: { weight: [12, 12], flash: [1, 1] }, status: 'done' })
    const theirs = makeTestStudy()
    const { merged, conflicts, filled } = mergeStudies(mine, { ...theirs, id: mine.id })
    expect(filled).toBe(0)
    expect(conflicts).toEqual([])
    expect(merged.runs[0].results.weight).toEqual([12, 12])
    expect(merged.runs[0].status).toBe('done')
  })

  it('reports differing values as conflicts and keeps mine until resolved', () => {
    const base = makeTestStudy()
    const mine = withRun(base, 'r2', { results: { weight: [12, null], flash: [null, null] }, status: 'done', notes: 'a' })
    const theirs = withRun(base, 'r2', {
      results: { weight: [12.5, 12.2], flash: [null, null] },
      status: 'aborted',
      abortReason: 'heater fault',
      notes: 'b',
    })
    const { merged, conflicts, filled } = mergeStudies(mine, theirs)
    expect(filled).toBe(1)
    expect(conflicts.map((c) => c.field)).toEqual(['result', 'status', 'notes'])
    expect(merged.runs[1].results.weight).toEqual([12, 12.2])

    let resolved = merged
    for (const c of conflicts) resolved = resolveConflict(resolved, c, 'theirs')
    expect(resolved.runs[1]).toMatchObject({
      results: { weight: [12.5, 12.2] },
      status: 'aborted',
      abortReason: 'heater fault',
      notes: 'b',
    })
    expect(resolveConflict(merged, conflicts[0], 'mine')).toBe(merged)
  })

  it('refuses to merge a different study', () => {
    expect(() => mergeStudies(makeTestStudy(), makeTestStudy())).toThrow(MergeError)
  })
})
