import { describe, expect, it } from 'vitest'
import { parseStudy, serializeStudy, StudyFileError, studyFileName } from './file'
import { makeTestStudy } from './testStudy'

describe('study file', () => {
  it('round-trips a study', () => {
    const s = makeTestStudy()
    expect(parseStudy(serializeStudy(s))).toEqual(s)
  })

  it('rejects text that is not JSON', () => {
    expect(() => parseStudy('not json')).toThrow(StudyFileError)
  })

  it('rejects JSON that is not a study', () => {
    expect(() => parseStudy('{"hello": 1}')).toThrow(/schema version/)
  })

  it('rejects a file from a newer app version', () => {
    expect(() => parseStudy(JSON.stringify({ ...makeTestStudy(), schemaVersion: 99 }))).toThrow(/newer version/)
  })

  it('names the damaged field', () => {
    const bad = { ...makeTestStudy(), cavities: 0 }
    expect(() => parseStudy(JSON.stringify(bad))).toThrow(/cavities/)
  })

  it('builds a safe file name', () => {
    expect(studyFileName({ ...makeTestStudy(), name: 'Housing: rev B/C' })).toBe('Housing- rev B-C.doe.json')
    expect(studyFileName({ ...makeTestStudy(), name: '  ' })).toBe('study.doe.json')
  })
})
