import { parseStudy, serializeStudy } from './file'
import type { Study } from './schema'

/** Summary shown in the "recent studies" list without loading every study. */
export interface StudySummary {
  id: string
  name: string
  updatedAt: string
  runs: number
}

/**
 * Where the browser keeps working copies of studies. This is a safety net against a closed tab,
 * not the system of record: the study file is what people share.
 */
export interface StudyStore {
  list(): Promise<StudySummary[]>
  load(id: string): Promise<Study | null>
  save(study: Study): Promise<void>
  remove(id: string): Promise<void>
}

const DB_NAME = 'molding-doe'
const STORE = 'studies'

interface Row extends StudySummary {
  json: string
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDbStudyStore implements StudyStore {
  private db: Promise<IDBDatabase>

  constructor(factory: IDBFactory = indexedDB) {
    this.db = new Promise((resolve, reject) => {
      const open = factory.open(DB_NAME, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' })
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db).transaction(STORE, mode).objectStore(STORE)
  }

  async list(): Promise<StudySummary[]> {
    const rows = await request((await this.store('readonly')).getAll() as IDBRequest<Row[]>)
    return rows
      .map(({ id, name, updatedAt, runs }) => ({ id, name, updatedAt, runs }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async load(id: string): Promise<Study | null> {
    const row = await request((await this.store('readonly')).get(id) as IDBRequest<Row | undefined>)
    return row ? parseStudy(row.json) : null
  }

  async save(study: Study): Promise<void> {
    const row: Row = {
      id: study.id,
      name: study.name,
      updatedAt: study.updatedAt,
      runs: study.runs.length,
      json: serializeStudy(study),
    }
    await request((await this.store('readwrite')).put(row))
  }

  async remove(id: string): Promise<void> {
    await request((await this.store('readwrite')).delete(id))
  }
}

/** Used when IndexedDB is unavailable (private windows in some browsers); nothing survives a reload. */
export class MemoryStudyStore implements StudyStore {
  private rows = new Map<string, Study>()

  async list(): Promise<StudySummary[]> {
    return [...this.rows.values()]
      .map(({ id, name, updatedAt, runs }) => ({ id, name, updatedAt, runs: runs.length }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async load(id: string): Promise<Study | null> {
    return this.rows.get(id) ?? null
  }

  async save(study: Study): Promise<void> {
    this.rows.set(study.id, study)
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id)
  }
}

export function openStudyStore(): { store: StudyStore; persistent: boolean } {
  try {
    if (typeof indexedDB !== 'undefined') return { store: new IndexedDbStudyStore(), persistent: true }
  } catch {
    // Fall through to the in-memory store.
  }
  return { store: new MemoryStudyStore(), persistent: false }
}
