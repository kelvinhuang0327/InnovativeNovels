import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_READER_PREFERENCES } from '../../domain/reading/readerPreferences'
import {
  LocalStorageReaderPreferencesRepository,
  READER_PREFERENCES_STORAGE_KEY,
} from './localStorageReaderPreferencesRepository'

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

describe('LocalStorageReaderPreferencesRepository', () => {
  let storage: Storage
  let repository: LocalStorageReaderPreferencesRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repository = new LocalStorageReaderPreferencesRepository(storage)
  })

  it('returns default preferences when no state exists', () => {
    expect(repository.load()).toEqual(DEFAULT_READER_PREFERENCES)
  })

  it('persists and restores valid preferences', () => {
    const preferences = {
      fontScale: 'large' as const,
      lineSpacing: 'spacious' as const,
      theme: 'sepia' as const,
    }
    repository.save(preferences)
    expect(repository.load()).toEqual(preferences)
  })

  it('falls back safely when schema is malformed or invalid JSON', () => {
    storage.setItem(READER_PREFERENCES_STORAGE_KEY, 'invalid-json{')
    expect(repository.load()).toEqual(DEFAULT_READER_PREFERENCES)

    storage.setItem(
      READER_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, fontScale: 'small' }),
    )
    expect(repository.load()).toEqual(DEFAULT_READER_PREFERENCES)
  })

  it('falls back safely for invalid enum values', () => {
    storage.setItem(
      READER_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        fontScale: 'gigantic',
        lineSpacing: 'comfortable',
        theme: 'dark',
      }),
    )
    expect(repository.load()).toEqual({
      fontScale: 'medium',
      lineSpacing: 'comfortable',
      theme: 'dark',
    })
  })
})
