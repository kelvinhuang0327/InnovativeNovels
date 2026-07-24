import { beforeEach, describe, expect, it } from 'vitest'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import {
  CHAPTER_BOOKMARKS_STORAGE_KEY,
  LocalStorageChapterBookmarksRepository,
} from './localStorageChapterBookmarksRepository'

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

describe('LocalStorageChapterBookmarksRepository', () => {
  let storage: Storage
  let repository: LocalStorageChapterBookmarksRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repository = new LocalStorageChapterBookmarksRepository(storage)
  })

  it('returns empty array when no state exists', () => {
    expect(repository.list()).toEqual([])
  })

  it('adds and removes bookmarks correctly', () => {
    const mark1 = { bookId: bookId('b1'), chapterId: chapterId('c1') }
    const mark2 = { bookId: bookId('b1'), chapterId: chapterId('c2') }

    repository.add(mark1)
    repository.add(mark2)

    expect(repository.list()).toHaveLength(2)
    expect(repository.list()[0]).toEqual(mark1)
    expect(repository.list()[1]).toEqual(mark2)

    repository.remove('b1', 'c1')
    expect(repository.list()).toEqual([mark2])
  })

  it('prevents duplicate bookmarks', () => {
    const mark = { bookId: bookId('b1'), chapterId: chapterId('c1') }

    repository.add(mark)
    repository.add(mark)

    expect(repository.list()).toEqual([mark])
  })

  it('handles malformed schema gracefully', () => {
    storage.setItem(CHAPTER_BOOKMARKS_STORAGE_KEY, 'invalid json')
    expect(repository.list()).toEqual([])

    storage.setItem(
      CHAPTER_BOOKMARKS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, bookmarks: [] }),
    )
    expect(repository.list()).toEqual([])
  })
})
