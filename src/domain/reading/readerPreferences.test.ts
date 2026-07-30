import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READER_PREFERENCES,
  READER_FONT_FAMILIES,
  READER_READING_MODES,
} from './readerPreferences'

describe('ReaderPreferences', () => {
  it('offers exactly the approved font families', () => {
    expect(READER_FONT_FAMILIES).toEqual(['serif', 'sans-serif'])
  })

  it('defaults to the Reader current effective sans-serif family', () => {
    expect(DEFAULT_READER_PREFERENCES.fontFamily).toBe('sans-serif')
  })

  it('offers exactly continuous and paged reading modes with continuous as the default', () => {
    expect(READER_READING_MODES).toEqual(['continuous', 'paged'])
    expect(DEFAULT_READER_PREFERENCES.readingMode).toBe('continuous')
  })
})
