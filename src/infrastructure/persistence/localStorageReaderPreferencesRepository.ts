import type { ReaderPreferencesRepository } from '../../application/reading/readerPreferencesRepository'
import {
  DEFAULT_READER_PREFERENCES,
  READER_FONT_FAMILIES,
  READER_LETTER_SPACINGS,
  READER_READING_MODES,
  type FontScale,
  type LineSpacing,
  type ReadingMode,
  type ReaderFontFamily,
  type ReaderLetterSpacing,
  type ReaderPreferences,
  type ReaderTheme,
} from '../../domain/reading/readerPreferences'

export const READER_PREFERENCES_STORAGE_KEY =
  'innovative-novels:reader-preferences:v1'

interface StoredPreferencesEnvelope {
  readonly schemaVersion: 1
  readonly fontFamily: string
  readonly fontScale: string
  readonly letterSpacing: string
  readonly lineSpacing: string
  readonly readingMode?: string
  readonly theme: string
}

const VALID_FONT_FAMILIES = new Set<ReaderFontFamily>(READER_FONT_FAMILIES)
const VALID_LETTER_SPACINGS = new Set<ReaderLetterSpacing>(
  READER_LETTER_SPACINGS,
)
const VALID_READING_MODES = new Set<ReadingMode>(READER_READING_MODES)

const VALID_FONT_SCALES = new Set<FontScale>([
  'small',
  'medium',
  'large',
  'extra-large',
])

const VALID_LINE_SPACINGS = new Set<LineSpacing>([
  'compact',
  'comfortable',
  'spacious',
])

const VALID_THEMES = new Set<ReaderTheme>(['light', 'sepia', 'dark'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePreferences(serialized: string | null): ReaderPreferences {
  if (!serialized) {
    return DEFAULT_READER_PREFERENCES
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      typeof candidate.fontScale !== 'string' ||
      typeof candidate.lineSpacing !== 'string' ||
      typeof candidate.theme !== 'string'
    ) {
      return DEFAULT_READER_PREFERENCES
    }

    const fontFamily: ReaderFontFamily = VALID_FONT_FAMILIES.has(
      candidate.fontFamily as ReaderFontFamily,
    )
      ? (candidate.fontFamily as ReaderFontFamily)
      : DEFAULT_READER_PREFERENCES.fontFamily

    const fontScale: FontScale = VALID_FONT_SCALES.has(
      candidate.fontScale as FontScale,
    )
      ? (candidate.fontScale as FontScale)
      : DEFAULT_READER_PREFERENCES.fontScale

    const letterSpacing: ReaderLetterSpacing = VALID_LETTER_SPACINGS.has(
      candidate.letterSpacing as ReaderLetterSpacing,
    )
      ? (candidate.letterSpacing as ReaderLetterSpacing)
      : DEFAULT_READER_PREFERENCES.letterSpacing

    const lineSpacing: LineSpacing = VALID_LINE_SPACINGS.has(
      candidate.lineSpacing as LineSpacing,
    )
      ? (candidate.lineSpacing as LineSpacing)
      : DEFAULT_READER_PREFERENCES.lineSpacing

    const readingMode: ReadingMode = VALID_READING_MODES.has(
      candidate.readingMode as ReadingMode,
    )
      ? (candidate.readingMode as ReadingMode)
      : DEFAULT_READER_PREFERENCES.readingMode

    const theme: ReaderTheme = VALID_THEMES.has(
      candidate.theme as ReaderTheme,
    )
      ? (candidate.theme as ReaderTheme)
      : DEFAULT_READER_PREFERENCES.theme

    return {
      fontFamily,
      fontScale,
      letterSpacing,
      lineSpacing,
      readingMode,
      theme,
    }
  } catch {
    return DEFAULT_READER_PREFERENCES
  }
}

export class LocalStorageReaderPreferencesRepository
  implements ReaderPreferencesRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  load(): ReaderPreferences {
    try {
      return parsePreferences(
        this.storage.getItem(READER_PREFERENCES_STORAGE_KEY),
      )
    } catch {
      return DEFAULT_READER_PREFERENCES
    }
  }

  save(preferences: ReaderPreferences): void {
    try {
      const envelope: StoredPreferencesEnvelope = {
        schemaVersion: 1,
        fontFamily: preferences.fontFamily,
        fontScale: preferences.fontScale,
        letterSpacing: preferences.letterSpacing,
        lineSpacing: preferences.lineSpacing,
        readingMode: preferences.readingMode,
        theme: preferences.theme,
      }
      this.storage.setItem(
        READER_PREFERENCES_STORAGE_KEY,
        JSON.stringify(envelope),
      )
    } catch {
      // Persistence failures leave app functional with fallback defaults.
    }
  }
}
