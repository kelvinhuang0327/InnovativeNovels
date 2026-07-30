import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READER_PREFERENCES,
  READER_FONT_FAMILIES,
} from './readerPreferences'

describe('ReaderPreferences', () => {
  it('offers exactly the approved font families', () => {
    expect(READER_FONT_FAMILIES).toEqual(['serif', 'sans-serif'])
  })

  it('defaults to the Reader current effective sans-serif family', () => {
    expect(DEFAULT_READER_PREFERENCES.fontFamily).toBe('sans-serif')
  })
})
