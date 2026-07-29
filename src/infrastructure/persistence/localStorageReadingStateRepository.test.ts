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

  it('persists the current schema version verbatim', () => {
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
    expect(raw.schemaVersion).toBe(2)
    expect(raw.updatedAt).toBeUndefined()
  })

  it('does not persist a paragraphIndex value', () => {
    const repository = new LocalStorageReadingStateRepository(
      window.localStorage,
    )

    repository.save({
      bookId: bookId('book-1'),
      chapterId: chapterId('chapter-2'),
      paragraphIndex: 0,
      chapterProgress: 0.5,
    })

    const raw = JSON.parse(
      window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
    )
    expect(raw.positions['book-1']).toEqual({
      bookId: 'book-1',
      chapterId: 'chapter-2',
      chapterProgress: 0.5,
    })
  })

  describe('schemaVersion 2 chapterProgress', () => {
    it('round-trips a nonzero chapterProgress through save and load', () => {
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      repository.save({
        bookId: bookId('book-1'),
        chapterId: chapterId('chapter-2'),
        paragraphIndex: 0,
        chapterProgress: 0.42,
      })

      expect(repository.load('book-1')).toEqual({
        bookId: 'book-1',
        chapterId: 'chapter-2',
        paragraphIndex: 0,
        chapterProgress: 0.42,
      })
    })

    it('round-trips a nonzero chapterProgress through listSavedPositions for multiple books', () => {
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      repository.save({
        bookId: bookId('book-1'),
        chapterId: chapterId('chapter-2'),
        paragraphIndex: 0,
        chapterProgress: 0.25,
      })
      repository.save({
        bookId: bookId('book-2'),
        chapterId: chapterId('chapter-9'),
        paragraphIndex: 0,
        chapterProgress: 0.75,
      })

      expect(repository.listSavedPositions()).toEqual(
        expect.arrayContaining([
          { bookId: 'book-1', chapterId: 'chapter-2', paragraphIndex: 0, chapterProgress: 0.25 },
          { bookId: 'book-2', chapterId: 'chapter-9', paragraphIndex: 0, chapterProgress: 0.75 },
        ]),
      )
    })

    it('continues reading existing schemaVersion 1 data, treating the missing chapterProgress as 0', () => {
      window.localStorage.setItem(
        READING_STATE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          positions: {
            'book-1': { bookId: 'book-1', chapterId: 'chapter-2' },
          },
        }),
      )
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      expect(repository.load('book-1')).toEqual({
        bookId: 'book-1',
        chapterId: 'chapter-2',
        paragraphIndex: 0,
        chapterProgress: 0,
      })
    })

    it('upgrades stored schemaVersion 1 data to schemaVersion 2 on the next normal save', () => {
      window.localStorage.setItem(
        READING_STATE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          positions: {
            'book-1': { bookId: 'book-1', chapterId: 'chapter-2' },
          },
        }),
      )
      const repository = new LocalStorageReadingStateRepository(
        window.localStorage,
      )

      repository.save({
        bookId: bookId('book-2'),
        chapterId: chapterId('chapter-9'),
        paragraphIndex: 0,
        chapterProgress: 0.1,
      })

      const raw = JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
      )
      expect(raw.schemaVersion).toBe(2)
      expect(raw.positions['book-1']).toEqual({
        bookId: 'book-1',
        chapterId: 'chapter-2',
        chapterProgress: 0,
      })
    })

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'sanitizes an invalid chapterProgress value (%s) passed to save() to 0',
      (invalidProgress) => {
        const repository = new LocalStorageReadingStateRepository(
          window.localStorage,
        )

        repository.save({
          bookId: bookId('book-1'),
          chapterId: chapterId('chapter-2'),
          paragraphIndex: 0,
          chapterProgress: invalidProgress,
        })

        expect(repository.load('book-1')?.chapterProgress).toBe(0)
      },
    )

    it.each([-1, 1.5, null])(
      'sanitizes an invalid stored chapterProgress value (%s) on load to 0',
      (invalidProgress) => {
        window.localStorage.setItem(
          READING_STATE_STORAGE_KEY,
          JSON.stringify({
            schemaVersion: 2,
            positions: {
              'book-1': {
                bookId: 'book-1',
                chapterId: 'chapter-2',
                chapterProgress: invalidProgress,
              },
            },
          }),
        )
        const repository = new LocalStorageReadingStateRepository(
          window.localStorage,
        )

        expect(repository.load('book-1')?.chapterProgress).toBe(0)
      },
    )
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
