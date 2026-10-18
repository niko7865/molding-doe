import { describe, expect, it } from 'vitest'
import { visibleSections } from './sections'

describe('workflow steps', () => {
  it('leads with the molding studies and adds the DOE steps only when switched on', () => {
    expect(visibleSections(false).map((s) => s.id)).toEqual(['study', 'guide', 'report'])
    expect(visibleSections(true).map((s) => s.id)).toEqual(['study', 'guide', 'design', 'run', 'analyze', 'report'])
  })
})
