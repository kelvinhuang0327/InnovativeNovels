export type FontScale = 'small' | 'medium' | 'large' | 'extra-large'
export type LineSpacing = 'compact' | 'comfortable' | 'spacious'
export type ReaderTheme = 'light' | 'sepia' | 'dark'
export const READER_FONT_FAMILIES = ['serif', 'sans-serif'] as const
export type ReaderFontFamily = (typeof READER_FONT_FAMILIES)[number]

export interface ReaderPreferences {
  readonly fontFamily: ReaderFontFamily
  readonly fontScale: FontScale
  readonly lineSpacing: LineSpacing
  readonly theme: ReaderTheme
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontFamily: 'sans-serif',
  fontScale: 'medium',
  lineSpacing: 'comfortable',
  theme: 'light',
}
