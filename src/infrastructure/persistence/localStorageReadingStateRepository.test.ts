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
})
