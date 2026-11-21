import type { GuideKey } from '../guide/studies'
import type { Guide, Run, Study } from './schema'
import { GUIDE_ORDER } from './settings'

/**
 * One field where the two copies disagree and neither side is empty.
 * Covers DOE run fields, scientific molding studies, and confirmation run values.
 */
export type Conflict =
  | { runId: string; runOrder: number; field: 'result'; responseId: string; cavity: number; mine: number; theirs: number }
  | { runId: string; runOrder: number; field: 'status'; mine: Run['status']; theirs: Run['status']; theirsAbortReason?: string }
  | { runId: string; runOrder: number; field: 'notes'; mine: string; theirs: string }
  | { field: 'guide'; studyKey: GuideKey; mine: NonNullable<Guide[GuideKey]>; theirs: NonNullable<Guide[GuideKey]> }
  | { field: 'confirmation'; seriesKey: string; runIndex: number; mine: number; theirs: number }

export interface MergeResult {
  /** Mine with every non-conflicting value from theirs filled in. Conflicts keep my value until resolved. */
  merged: Study
  conflicts: Conflict[]
  /** How many values were copied in from theirs. */
  filled: number
}

export class MergeError extends Error {}

function hasGuideData(entry: Guide[GuideKey] | undefined): boolean {
  if (!entry) return false
  if (entry.skipped) return true
  if (entry.notes?.trim()) return true
  if (entry.settings && Object.keys(entry.settings).length > 0) return true
  if (entry.customSettings?.some((c) => c.value !== undefined)) return true
  if ('rows' in entry && Array.isArray(entry.rows)) {
    return entry.rows.some((r) => {
      if (Array.isArray(r)) return r.some((v) => v !== null)
      if ('weight' in r) return r.weight !== null
      if ('value' in r) return r.value !== null
      if ('pressure' in r) return r.pressure !== null
      if ('temp' in r) return r.temp !== null || r.hold !== null
      return false
    })
  }
  return false
}

function sameOptimum(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((v, i) => Math.abs(v - b[i]) <= 1e-9)
}

/**
 * Merges results recorded in another copy of the same study (typically the press tablet's)
 * into mine: DOE runs (matched by id), scientific molding studies, and confirmation runs.
 * A value present on only one side is taken; values present on both sides that differ become
 * conflicts. The design itself (factors, settings) is never merged.
 */
export function mergeStudies(mine: Study, theirs: Study): MergeResult {
  if (mine.id !== theirs.id) {
    throw new MergeError(`"${theirs.name}" is a different study, so its results can't be merged into "${mine.name}".`)
  }
  const conflicts: Conflict[] = []
  let filled = 0
  const theirRuns = new Map(theirs.runs.map((r) => [r.id, r]))

  const runs = mine.runs.map((run): Run => {
    const other = theirRuns.get(run.id)
    if (!other) return run
    let changed = false
    const results: Run['results'] = {}
    for (const [responseId, values] of Object.entries(run.results)) {
      const otherValues = other.results[responseId] ?? []
      results[responseId] = values.map((v, cavity) => {
        const o = otherValues[cavity] ?? null
        if (o === null || o === v) return v
        if (v === null) {
          filled++
          changed = true
          return o
        }
        conflicts.push({ runId: run.id, runOrder: run.order, field: 'result', responseId, cavity, mine: v, theirs: o })
        return v
      })
    }

    let status = run.status
    let abortReason = run.abortReason
    if (other.status !== run.status) {
      if (run.status === 'pending') {
        status = other.status
        abortReason = other.abortReason
        changed = true
      } else if (other.status !== 'pending') {
        conflicts.push({ runId: run.id, runOrder: run.order, field: 'status', mine: run.status, theirs: other.status, theirsAbortReason: other.abortReason })
      }
    }

    let notes = run.notes
    if (other.notes !== run.notes && other.notes !== '') {
      if (run.notes === '') {
        notes = other.notes
        changed = true
      } else {
        conflicts.push({ runId: run.id, runOrder: run.order, field: 'notes', mine: run.notes, theirs: other.notes })
      }
    }

    if (!changed) return { ...run, results }
    const updatedAt = other.updatedAt > run.updatedAt ? other.updatedAt : run.updatedAt
    return { ...run, results, status, abortReason, notes, updatedAt }
  })

  // Merge scientific molding studies.
  let guide = mine.guide
  for (const key of GUIDE_ORDER) {
    const myEntry = mine.guide?.[key]
    const theirEntry = theirs.guide?.[key]
    if (!hasGuideData(theirEntry)) continue
    if (!hasGuideData(myEntry)) {
      guide = { ...guide, [key]: theirEntry }
      filled++
    } else if (JSON.stringify(myEntry) !== JSON.stringify(theirEntry)) {
      conflicts.push({ field: 'guide', studyKey: key, mine: myEntry!, theirs: theirEntry! })
    }
  }

  // Merge confirmation run results when both copies share the same optimum (or mine has none yet).
  let analysis = mine.analysis
  const theirConf = theirs.analysis?.confirmation
  if (theirConf && (sameOptimum(mine.analysis?.optimum, theirs.analysis?.optimum) || !mine.analysis?.optimum)) {
    const myConf = mine.analysis?.confirmation
    const nextValues: Record<string, (number | null)[]> = { ...(myConf?.values ?? {}) }
    let confChanged = false
    let maxRuns = Math.max(myConf?.runs ?? 0, theirConf.runs)
    for (const [seriesKey, theirArr] of Object.entries(theirConf.values)) {
      const myArr = nextValues[seriesKey] ?? []
      const len = Math.max(myArr.length, theirArr.length)
      const mergedArr: (number | null)[] = []
      for (let i = 0; i < len; i++) {
        const mv = myArr[i] ?? null
        const tv = theirArr[i] ?? null
        if (tv === null || tv === mv) {
          mergedArr.push(mv)
        } else if (mv === null) {
          mergedArr.push(tv)
          filled++
          confChanged = true
        } else {
          mergedArr.push(mv)
          conflicts.push({ field: 'confirmation', seriesKey, runIndex: i, mine: mv, theirs: tv })
        }
      }
      if (mergedArr.some((v) => v !== null)) {
        nextValues[seriesKey] = mergedArr
        maxRuns = Math.max(maxRuns, mergedArr.length)
      }
    }
    if (confChanged) {
      analysis = {
        series: mine.analysis?.series ?? theirs.analysis?.series ?? {},
        optimum: mine.analysis?.optimum ?? theirs.analysis?.optimum,
        confirmation: { runs: Math.max(1, maxRuns), values: nextValues },
      }
    }
  }

  return { merged: { ...mine, runs, guide, analysis }, conflicts, filled }
}

/** Applies the user's choice for one conflict. */
export function resolveConflict(study: Study, conflict: Conflict, pick: 'mine' | 'theirs'): Study {
  if (pick === 'mine') return study
  if (conflict.field === 'guide') {
    return { ...study, guide: { ...study.guide, [conflict.studyKey]: conflict.theirs } }
  }
  if (conflict.field === 'confirmation') {
    const a = study.analysis ?? { series: {} }
    const conf = a.confirmation ?? { runs: conflict.runIndex + 1, values: {} }
    const arr = [...(conf.values[conflict.seriesKey] ?? [])]
    while (arr.length <= conflict.runIndex) arr.push(null)
    arr[conflict.runIndex] = conflict.theirs
    return {
      ...study,
      analysis: { ...a, confirmation: { runs: Math.max(conf.runs, arr.length), values: { ...conf.values, [conflict.seriesKey]: arr } } },
    }
  }
  return {
    ...study,
    runs: study.runs.map((run) => {
      if (run.id !== conflict.runId) return run
      switch (conflict.field) {
        case 'result': {
          const values = [...run.results[conflict.responseId]]
          values[conflict.cavity] = conflict.theirs
          return { ...run, results: { ...run.results, [conflict.responseId]: values } }
        }
        case 'status':
          return { ...run, status: conflict.theirs, abortReason: conflict.theirsAbortReason }
        case 'notes':
          return { ...run, notes: conflict.theirs }
      }
    }),
  }
}
