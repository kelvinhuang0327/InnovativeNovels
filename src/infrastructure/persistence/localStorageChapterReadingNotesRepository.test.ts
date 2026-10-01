import { beforeEach, describe, expect, it } from 'vitest'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ChapterReadingNote } from '../../domain/reading/chapterReadingNote'
import {
  CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX,
  LocalStorageChapterReadingNotesRepository,
} from './localStorageChapterReadingNotesRepository'

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

function note(book: string, chapter: string, content: string): ChapterReadingNote {
  return {
    bookId: bookId(book),
    chapterId: chapterId(chapter),
    content,
  }
}

function storageKey(book: string, chapter: string): string {
  return `${CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX}${encodeURIComponent(book)}:${encodeURIComponent(chapter)}`
}

describe('LocalStorageChapterReadingNotesRepository', () => {
  let storage: Storage
  let repository: LocalStorageChapterReadingNotesRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repository = new LocalStorageChapterReadingNotesRepository(storage)
  })

  it('returns no note when storage is empty', () => {
    expect(repository.load('book-a', 'chapter-1')).toBeUndefined()
  })

  it('isolates notes by book and chapter and replaces only the requested note', () => {
    const first = note('book-a', 'chapter-1', 'first\nline')
    const second = note('book-a', 'chapter-2', 'second chapter')
    const sameChapterInAnotherBook = note('book-b', 'chapter-1', 'other book')

    repository.save(first)
    repository.save(second)
    repository.save(sameChapterInAnotherBook)
    repository.save(note('book-a', 'chapter-1', 'replacement'))

    expect(repository.load('book-a', 'chapter-1')?.content).toBe('replacement')
    expect(repository.load('book-a', 'chapter-2')).toEqual(second)
    expect(repository.load('book-b', 'chapter-1')).toEqual(sameChapterInAnotherBook)

    repository.remove('book-a', 'chapter-1')

    expect(repository.load('book-a', 'chapter-1')).toBeUndefined()
    expect(repository.load('book-a', 'chapter-2')).toEqual(second)
    expect(repository.load('book-b', 'chapter-1')).toEqual(sameChapterInAnotherBook)
  })

  it('removes a note instead of storing whitespace-only content', () => {
    repository.save(note('book-a', 'chapter-1', 'saved note'))

    repository.save(note('book-a', 'chapter-1', ' \n\t '))

    expect(repository.load('book-a', 'chapter-1')).toBeUndefined()
    expect(storage.getItem(storageKey('book-a', 'chapter-1'))).toBeNull()
  })

  it('ignores malformed records without changing them or hiding another note', () => {
    const validNote = note('book-a', 'chapter-1', 'valid note')
    const malformedKey = storageKey('book-b', 'chapter-1')
    const malformedValue = '{not-json'

    repository.save(validNote)
    storage.setItem(malformedKey, malformedValue)

    expect(repository.load('book-b', 'chapter-1')).toBeUndefined()
    expect(storage.getItem(malformedKey)).toBe(malformedValue)
    expect(repository.load('book-a', 'chapter-1')).toEqual(validNote)
  })

  it('rejects mismatched identity and whitespace-only persisted records', () => {
    storage.setItem(
      storageKey('book-a', 'chapter-1'),
      JSON.stringify({
        bookId: 'book-b',
        chapterId: 'chapter-1',
        content: 'wrong identity',
      }),
    )
    expect(repository.load('book-a', 'chapter-1')).toBeUndefined()

    storage.setItem(
      storageKey('book-a', 'chapter-1'),
      JSON.stringify({
        bookId: 'book-a',
        chapterId: 'chapter-1',
        content: '  \n ',
      }),
    )
    expect(repository.load('book-a', 'chapter-1')).toBeUndefined()
  })
})
