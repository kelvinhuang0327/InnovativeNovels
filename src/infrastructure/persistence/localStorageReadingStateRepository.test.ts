import { beforeEach, describe, expect, it } from 'vitest'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import {
  LocalStorageReadingStateRepository,
  READING_STATE_STORAGE_KEY,
} from './localStorageReadingStateRepository'

describe('LocalStorageReadingStateRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips the approved versioned chapter position', () => {
    const repository = new LocalStorageReadingStateRepository(
      window.localStorage,
    )

    repository.save({
      bookId: bookId('book-1'),
      chapterId: chapterId('chapter-2'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })

    expect(repository.load('book-1')).toEqual({
      bookId: 'book-1',
      chapterId: 'chapter-2',
      paragraphIndex: 0,
      chapterProgress: 0,
    })
  })

  it.each([
    '{broken json',
    JSON.stringify({ schemaVersion: 2, positions: {} }),
    JSON.stringify({
      schemaVersion: 1,
      positions: { 'book-1': { bookId: 'other-book', chapterId: 'chapter-1' } },
    }),
  ])('fails safely to no saved position for invalid payload %s', (payload) => {
    window.localStorage.setItem(READING_STATE_STORAGE_KEY, payload)
    const repository = new LocalStorageReadingStateRepository(
      window.localStorage,
    )

    expect(repository.load('book-1')).toBeUndefined()
  })

  it('keeps two saved books independent', () => {
    const repository = new LocalStorageReadingStateRepository(
      window.localStorage,
    )

    repository.save({
      bookId: bookId('book-1'),
      chapterId: chapterId('chapter-2'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })
    repository.save({
      bookId: bookId('book-2'),
      chapterId: chapterId('chapter-9'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })

    expect(repository.load('book-1')).toEqual({
      bookId: 'book-1',
      chapterId: 'chapter-2',
      paragraphIndex: 0,
      chapterProgress: 0,
    })
    expect(repository.load('book-2')).toEqual({
      bookId: 'book-2',
      chapterId: 'chapter-9',
      paragraphIndex: 0,
      chapterProgress: 0,
    })
  })

  it('persists the approved schema version verbatim', () => {
    const repository = new LocalStorageReadingStateRepository(
      window.localStorage,
    )

    repository.save({
      bookId: bookId('book-1'),
      chapterId: chapterId('chapter-2'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })

    const raw = JSON.parse(
      window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
    )
    expect(raw.schemaVersion).toBe(1)
    expect(raw.updatedAt).toBeUndefined()
  })

  describe('listSavedPositions', () => {
    it('returns an empty list when nothing is saved', () => {
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      expect(repository.listSavedPositions()).toEqual([])
    })

    it('returns every saved position across multiple books', () => {
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      repository.save({
        bookId: bookId('book-1'),
        chapterId: chapterId('chapter-2'),
        paragraphIndex: 0,
        chapterProgress: 0,
      })
      repository.save({
        bookId: bookId('book-2'),
        chapterId: chapterId('chapter-9'),
        paragraphIndex: 0,
        chapterProgress: 0,
      })

      const positions = repository.listSavedPositions()

      expect(positions).toHaveLength(2)
      expect(positions).toEqual(
        expect.arrayContaining([
          { bookId: 'book-1', chapterId: 'chapter-2', paragraphIndex: 0, chapterProgress: 0 },
          { bookId: 'book-2', chapterId: 'chapter-9', paragraphIndex: 0, chapterProgress: 0 },
        ]),
      )
    })

    it('falls back to an empty list for a malformed envelope', () => {
      window.localStorage.setItem(READING_STATE_STORAGE_KEY, '{broken json')
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      expect(repository.listSavedPositions()).toEqual([])
    })
  })
})
