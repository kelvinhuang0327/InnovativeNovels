import type { ReaderPreferences } from '../../domain/reading/readerPreferences'

export interface ReaderPreferencesRepository {
  load(): ReaderPreferences
  save(preferences: ReaderPreferences): void
}
