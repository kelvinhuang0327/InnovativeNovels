export type FontScale = 'small' | 'medium' | 'large' | 'extra-large'
export type LineSpacing = 'compact' | 'comfortable' | 'spacious'
export type ReaderTheme = 'light' | 'sepia' | 'dark'
export const READER_FONT_FAMILIES = ['serif', 'sans-serif'] as const
export type ReaderFontFamily = (typeof READER_FONT_FAMILIES)[number]
export const READER_LETTER_SPACINGS = [
  'compact',
  'normal',
  'relaxed',
] as const
export type ReaderLetterSpacing = (typeof READER_LETTER_SPACINGS)[number]

export interface ReaderPreferences {
  readonly fontFamily: ReaderFontFamily
  readonly fontScale: FontScale
  readonly letterSpacing: ReaderLetterSpacing
  readonly lineSpacing: LineSpacing
  readonly theme: ReaderTheme
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontFamily: 'sans-serif',
  fontScale: 'medium',
  letterSpacing: 'normal',
  lineSpacing: 'comfortable',
  theme: 'light',
}
