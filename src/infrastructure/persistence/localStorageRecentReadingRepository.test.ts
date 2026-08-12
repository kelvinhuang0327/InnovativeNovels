import { beforeEach, describe, expect, it } from 'vitest'
import {
  LocalStorageRecentReadingRepository,
  MAX_RECENT_READING_BOOKS,
  RECENT_READING_STORAGE_KEY,
} from './localStorageRecentReadingRepository'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

describe('LocalStorageRecentReadingRepository', () => {
  let storage: Storage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('returns an empty history by default', () => {
    expect(new LocalStorageRecentReadingRepository(storage).list()).toEqual([])
  })

  it('records most-recent-first order and moves existing books to the front', () => {
    const repository = new LocalStorageRecentReadingRepository(storage)

    repository.touch('book-a')
    repository.touch('book-b')
    repository.touch('book-a')

    expect(repository.list()).toEqual(['book-a', 'book-b'])
  })

  it('persists order for a new repository instance', () => {
    const firstRepository = new LocalStorageRecentReadingRepository(storage)
    firstRepository.touch('book-a')
    firstRepository.touch('book-b')

    const secondRepository = new LocalStorageRecentReadingRepository(storage)

    expect(secondRepository.list()).toEqual(['book-b', 'book-a'])
    expect(JSON.parse(storage.getItem(RECENT_READING_STORAGE_KEY) ?? '')).toEqual(
      {
        schemaVersion: 1,
        bookIds: ['book-b', 'book-a'],
      },
    )
  })

  it('filters malformed entries, bounds history, and fails safely', () => {
    storage.setItem(
      RECENT_READING_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        bookIds: ['book-a', '', 'book-a', 42, null],
      }),
    )
    const repository = new LocalStorageRecentReadingRepository(storage)
    expect(repository.list()).toEqual(['book-a'])

    repository.touch('')
    expect(repository.list()).toEqual(['book-a'])

    storage.setItem(RECENT_READING_STORAGE_KEY, '{broken json')
    expect(repository.list()).toEqual([])

    storage.setItem(
      RECENT_READING_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        bookIds: Array.from({ length: MAX_RECENT_READING_BOOKS + 3 }, (_, i) =>
          `book-${i}`,
        ),
      }),
    )
    expect(repository.list()).toHaveLength(MAX_RECENT_READING_BOOKS)
  })
})
