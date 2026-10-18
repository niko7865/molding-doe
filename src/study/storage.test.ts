import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { IndexedDbStudyStore, MemoryStudyStore, type StudyStore } from './storage'
import { makeTestStudy } from './testStudy'

const stores: [string, () => StudyStore][] = [
  ['IndexedDB', () => new IndexedDbStudyStore(new IDBFactory())],
  ['memory', () => new MemoryStudyStore()],
]

describe.each(stores)('%s study store', (_, make) => {
  it('saves, lists newest first, loads and removes', async () => {
    const store = make()
    const a = { ...makeTestStudy(), name: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }
    const b = { ...makeTestStudy(), name: 'B', updatedAt: '2026-02-01T00:00:00.000Z' }
    await store.save(a)
    await store.save(b)
    expect((await store.list()).map((s) => s.name)).toEqual(['B', 'A'])
    expect(await store.load(a.id)).toEqual(a)

    await store.save({ ...a, name: 'A2', updatedAt: '2026-03-01T00:00:00.000Z' })
    expect((await store.list()).map((s) => s.name)).toEqual(['A2', 'B'])

    await store.remove(b.id)
    expect(await store.load(b.id)).toBeNull()
    expect(await store.list()).toHaveLength(1)
  })
})
