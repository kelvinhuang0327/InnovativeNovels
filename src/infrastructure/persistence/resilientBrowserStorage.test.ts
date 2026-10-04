import { describe, expect, it, vi } from 'vitest'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { LocalStorageReadingStateRepository } from './localStorageReadingStateRepository'
import { ResilientBrowserStorage } from './resilientBrowserStorage'

describe('ResilientBrowserStorage', () => {
  it('keeps reading usable in session memory when the browser storage getter throws', () => {
    const storage = new ResilientBrowserStorage(() => {
      throw new Error('storage access is blocked')
    })
    const repository = new LocalStorageReadingStateRepository(storage)
    const onUnavailable = vi.fn()
    storage.subscribe(onUnavailable)

    repository.save({
      bookId: bookId('book-session-only'),
      chapterId: chapterId('chapter-session-only'),
      paragraphIndex: 0,
      chapterProgress: 0.42,
    })

    expect(repository.load('book-session-only')).toEqual({
      bookId: 'book-session-only',
      chapterId: 'chapter-session-only',
      paragraphIndex: 0,
      chapterProgress: 0.42,
    })
    expect(storage.getSnapshot()).toBe(false)
    expect(onUnavailable).toHaveBeenCalledOnce()
  })

  it('keeps a failed persistent write available in memory for the current session', () => {
    const persistentStorage = {
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('storage quota exceeded')
      }),
      get length() {
        return 0
      },
    } as unknown as Storage
    const storage = new ResilientBrowserStorage(() => persistentStorage)
    const repository = new LocalStorageReadingStateRepository(storage)

    repository.save({
      bookId: bookId('book-session-only'),
      chapterId: chapterId('chapter-session-only'),
      paragraphIndex: 0,
      chapterProgress: 0.75,
    })

    expect(repository.load('book-session-only')?.chapterProgress).toBe(0.75)
    expect(storage.getSnapshot()).toBe(false)
    expect(persistentStorage.setItem).toHaveBeenCalledOnce()
  })
})
