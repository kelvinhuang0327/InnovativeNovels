import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOOK_SHELF_STORAGE_KEY,
  LocalStorageBookShelfRepository,
} from './localStorageBookShelfRepository'

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

describe('LocalStorageBookShelfRepository', () => {
  let storage: Storage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('returns an empty shelf by default', () => {
    const repository = new LocalStorageBookShelfRepository(storage)

    expect(repository.list()).toEqual([])
    expect(repository.contains('book-a')).toBe(false)
  })

  it('adds, preserves order, prevents duplicates, and removes book IDs', () => {
    const repository = new LocalStorageBookShelfRepository(storage)

    repository.add('book-a')
    repository.add('book-b')
    repository.add('book-a')

    expect(repository.list()).toEqual(['book-a', 'book-b'])
    expect(repository.contains('book-b')).toBe(true)

    repository.remove('book-a')
    expect(repository.list()).toEqual(['book-b'])
  })

  it('persists IDs for a new repository instance', () => {
    const firstRepository = new LocalStorageBookShelfRepository(storage)
    firstRepository.add('book-a')

    const secondRepository = new LocalStorageBookShelfRepository(storage)

    expect(secondRepository.list()).toEqual(['book-a'])
    expect(JSON.parse(storage.getItem(BOOK_SHELF_STORAGE_KEY) ?? '')).toEqual({
      schemaVersion: 1,
      bookIds: ['book-a'],
    })
  })

  it('filters malformed entries and fails safely for malformed envelopes', () => {
    storage.setItem(
      BOOK_SHELF_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        bookIds: ['book-a', '', 'book-a', 42, null],
      }),
    )
    const repository = new LocalStorageBookShelfRepository(storage)
    expect(repository.list()).toEqual(['book-a'])

    storage.setItem(BOOK_SHELF_STORAGE_KEY, '{broken json')
    expect(repository.list()).toEqual([])

    storage.setItem(
      BOOK_SHELF_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, bookIds: ['book-a'] }),
    )
    expect(repository.list()).toEqual([])
  })
})
