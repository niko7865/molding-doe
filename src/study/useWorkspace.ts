import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseStudy, serializeStudy, studyFileName } from './file'
import { mergeStudies, resolveConflict, type Conflict } from './merge'
import { createStudy, type Study } from './schema'
import { openStudyStore, type StudySummary } from './storage'

const AUTOSAVE_DELAY_MS = 400

export interface MergeReport {
  fileName: string
  filled: number
  conflicts: Conflict[]
}

/**
 * The study being worked on, its auto-saved working copy, and the file actions around it.
 * Every edit goes through `update`, which stamps updatedAt and schedules an auto-save.
 */
export function useWorkspace() {
  const { store, persistent } = useMemo(() => openStudyStore(), [])
  const [study, setStudy] = useState<Study | null>(null)
  const [recent, setRecent] = useState<StudySummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mergeReport, setMergeReport] = useState<MergeReport | null>(null)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshRecent = useCallback(() => {
    store.list().then(setRecent, () => setRecent([]))
  }, [store])

  useEffect(refreshRecent, [refreshRecent])

  const persist = useCallback(
    (s: Study) => {
      if (pending.current) clearTimeout(pending.current)
      pending.current = setTimeout(() => {
        store.save(s).then(refreshRecent, (e) => setError(`Auto-save failed: ${String(e)}`))
      }, AUTOSAVE_DELAY_MS)
    },
    [store, refreshRecent],
  )

  const open = useCallback(
    (s: Study) => {
      setStudy(s)
      setMergeReport(null)
      setError(null)
      persist(s)
    },
    [persist],
  )

  const update = useCallback(
    (change: (s: Study) => Study) => {
      setStudy((prev) => {
        if (!prev) return prev
        const next = { ...change(prev), updatedAt: new Date().toISOString() }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const create = useCallback((name: string) => open(createStudy(name)), [open])

  const openRecent = useCallback(
    async (id: string) => {
      try {
        const s = await store.load(id)
        if (s) open(s)
        else setError('That study is no longer in this browser.')
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e))
      }
    },
    [store, open],
  )

  const openFile = useCallback(
    async (file: File) => {
      try {
        open(parseStudy(await file.text()))
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [open],
  )

  const mergeFile = useCallback(
    async (file: File) => {
      if (!study) return
      try {
        const { merged, conflicts, filled } = mergeStudies(study, parseStudy(await file.text()))
        update(() => merged)
        setMergeReport({ fileName: file.name, conflicts, filled })
        setError(null)
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [study, update],
  )

  const resolve = useCallback(
    (conflict: Conflict, pick: 'mine' | 'theirs') => {
      update((s) => resolveConflict(s, conflict, pick))
      setMergeReport((r) => r && { ...r, conflicts: r.conflicts.filter((c) => c !== conflict) })
    },
    [update],
  )

  const saveFile = useCallback(() => {
    if (!study) return
    const url = URL.createObjectURL(new Blob([serializeStudy(study)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = studyFileName(study)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [study])

  const close = useCallback(() => {
    setStudy(null)
    setMergeReport(null)
    refreshRecent()
  }, [refreshRecent])

  const removeRecent = useCallback(
    async (id: string) => {
      await store.remove(id)
      refreshRecent()
    },
    [store, refreshRecent],
  )

  return {
    study,
    recent,
    persistent,
    error,
    mergeReport,
    dismissError: () => setError(null),
    dismissMergeReport: () => setMergeReport(null),
    create,
    openRecent,
    openFile,
    mergeFile,
    resolve,
    saveFile,
    update,
    close,
    removeRecent,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
