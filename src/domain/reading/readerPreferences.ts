export type FontScale = 'small' | 'medium' | 'large' | 'extra-large'
export type LineSpacing = 'compact' | 'comfortable' | 'spacious'
export type ReaderTheme = 'light' | 'sepia' | 'dark'

export interface ReaderPreferences {
  readonly fontScale: FontScale
  readonly lineSpacing: LineSpacing
  readonly theme: ReaderTheme
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontScale: 'medium',
  lineSpacing: 'comfortable',
  theme: 'light',
}
