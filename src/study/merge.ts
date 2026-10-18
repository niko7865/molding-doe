import type { Run, Study } from './schema'

/**
 * One field where the two copies disagree and neither side is empty.
 * `field` is a response id with a cavity index, or the run's status or notes.
 */
export type Conflict =
  | { runId: string; runOrder: number; field: 'result'; responseId: string; cavity: number; mine: number; theirs: number }
  | { runId: string; runOrder: number; field: 'status'; mine: Run['status']; theirs: Run['status']; theirsAbortReason?: string }
  | { runId: string; runOrder: number; field: 'notes'; mine: string; theirs: string }

export interface MergeResult {
  /** Mine with every non-conflicting value from theirs filled in. Conflicts keep my value until resolved. */
  merged: Study
  conflicts: Conflict[]
  /** How many values were copied in from theirs. */
  filled: number
}

export class MergeError extends Error {}

/**
 * Merges results recorded in another copy of the same study (typically the press tablet's)
 * into mine. Runs are matched by id. A value present on only one side is taken; values present
 * on both sides that differ become conflicts. The design itself (factors, settings) is never merged.
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

  return { merged: { ...mine, runs }, conflicts, filled }
}

/** Applies the user's choice for one conflict. */
export function resolveConflict(study: Study, conflict: Conflict, pick: 'mine' | 'theirs'): Study {
  if (pick === 'mine') return study
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
