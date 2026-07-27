import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_READER_SESSION_STORAGE_KEY,
  LocalStorageActiveReaderSessionRepository,
} from './localStorageActiveReaderSessionRepository'

describe('LocalStorageActiveReaderSessionRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to no active session', () => {
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    expect(repository.load()).toBeUndefined()
  })

  it('round-trips a saved active BookId', () => {
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    repository.save('book-tide-city')

    expect(repository.load()).toBe('book-tide-city')
  })

  it('persists the approved schema version and shape verbatim', () => {
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    repository.save('book-tide-city')

    const raw = JSON.parse(
      window.localStorage.getItem(ACTIVE_READER_SESSION_STORAGE_KEY) ?? '',
    )
    expect(raw).toEqual({ schemaVersion: 1, activeBookId: 'book-tide-city' })
  })

  it.each([
    '{broken json',
    JSON.stringify({ schemaVersion: 2, activeBookId: 'book-tide-city' }),
    JSON.stringify({ schemaVersion: 1, activeBookId: '' }),
    JSON.stringify({ schemaVersion: 1 }),
  ])('clears and ignores an invalid marker payload %s', (payload) => {
    window.localStorage.setItem(ACTIVE_READER_SESSION_STORAGE_KEY, payload)
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    expect(repository.load()).toBeUndefined()
    expect(
      window.localStorage.getItem(ACTIVE_READER_SESSION_STORAGE_KEY),
    ).toBeNull()
  })

  it('clears the marker on explicit clear', () => {
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    repository.save('book-tide-city')
    repository.clear()

    expect(repository.load()).toBeUndefined()
    expect(
      window.localStorage.getItem(ACTIVE_READER_SESSION_STORAGE_KEY),
    ).toBeNull()
  })

  it('overwrites a previous active BookId with the latest save', () => {
    const repository = new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    )

    repository.save('book-tide-city')
    repository.save('book-frost-sword')

    expect(repository.load()).toBe('book-frost-sword')
  })
})
