import {
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

interface ReaderComfortControlsProps {
  readonly preferences: ReaderPreferences
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
}

const FONT_SCALE_LABELS: Record<FontScale, string> = {
  small: '小',
  medium: '中',
  large: '大',
  'extra-large': '特大',
}

const FONT_FAMILY_LABELS: Record<ReaderFontFamily, string> = {
  serif: '襯線',
  'sans-serif': '無襯線',
}

const LINE_SPACING_LABELS: Record<LineSpacing, string> = {
  compact: '緊密',
  comfortable: '舒適',
  spacious: '寬鬆',
}

const LETTER_SPACING_LABELS: Record<ReaderLetterSpacing, string> = {
  compact: '緊密字距',
  normal: '標準字距',
  relaxed: '寬鬆字距',
}

const THEME_LABELS: Record<ReaderTheme, string> = {
  light: '明亮',
  sepia: '護眼',
  dark: '暗黑',
}

const READING_MODE_LABELS: Record<ReadingMode, string> = {
  continuous: '連續捲動',
  paged: '分頁閱讀',
}

export function ReaderComfortControls({
  preferences,
  onChangePreferences,
  onResetPreferences,
}: ReaderComfortControlsProps) {
  const setFontScale = (fontScale: FontScale) => {
    onChangePreferences({ ...preferences, fontScale })
  }

  const setFontFamily = (fontFamily: ReaderFontFamily) => {
    onChangePreferences({ ...preferences, fontFamily })
  }

  const setLineSpacing = (lineSpacing: LineSpacing) => {
    onChangePreferences({ ...preferences, lineSpacing })
  }

  const setLetterSpacing = (letterSpacing: ReaderLetterSpacing) => {
    onChangePreferences({ ...preferences, letterSpacing })
  }

  const setTheme = (theme: ReaderTheme) => {
    onChangePreferences({ ...preferences, theme })
  }

  const setReadingMode = (readingMode: ReadingMode) => {
    onChangePreferences({ ...preferences, readingMode })
  }

  return (
    <div className="reader-comfort-controls" aria-label="閱讀舒適度設定">
      <div className="control-group" role="radiogroup" aria-label="字型大小">
        <span className="control-label">字級：</span>
        <div className="control-options">
          {(['small', 'medium', 'large', 'extra-large'] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              className={`comfort-option ${
                preferences.fontScale === scale ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.fontScale === scale}
              onClick={() => setFontScale(scale)}
            >
              {FONT_SCALE_LABELS[scale]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="radiogroup" aria-label="內文字型">
        <span className="control-label">字型：</span>
        <div className="control-options">
          {READER_FONT_FAMILIES.map((fontFamily) => (
            <button
              key={fontFamily}
              type="button"
              className={`comfort-option ${
                preferences.fontFamily === fontFamily ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.fontFamily === fontFamily}
              onClick={() => setFontFamily(fontFamily)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setFontFamily(fontFamily)
                }
              }}
            >
              {FONT_FAMILY_LABELS[fontFamily]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="radiogroup" aria-label="行距">
        <span className="control-label">行距：</span>
        <div className="control-options">
          {(['compact', 'comfortable', 'spacious'] as const).map((spacing) => (
            <button
              key={spacing}
              type="button"
              className={`comfort-option ${
                preferences.lineSpacing === spacing ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.lineSpacing === spacing}
              onClick={() => setLineSpacing(spacing)}
            >
              {LINE_SPACING_LABELS[spacing]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="radiogroup" aria-label="字距">
        <span className="control-label">字距：</span>
        <div className="control-options">
          {READER_LETTER_SPACINGS.map((letterSpacing) => (
            <button
              key={letterSpacing}
              type="button"
              className={`comfort-option ${
                preferences.letterSpacing === letterSpacing ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.letterSpacing === letterSpacing}
              onClick={() => setLetterSpacing(letterSpacing)}
            >
              {LETTER_SPACING_LABELS[letterSpacing]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="radiogroup" aria-label="閱讀主題">
        <span className="control-label">主題：</span>
        <div className="control-options">
          {(['light', 'sepia', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`comfort-option theme-option-${t} ${
                preferences.theme === t ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.theme === t}
              onClick={() => setTheme(t)}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group" role="radiogroup" aria-label="閱讀模式">
        <span className="control-label">模式：</span>
        <div className="control-options">
          {READER_READING_MODES.map((readingMode) => (
            <button
              key={readingMode}
              type="button"
              className={`comfort-option ${
                preferences.readingMode === readingMode ? 'active' : ''
              }`}
              role="radio"
              aria-checked={preferences.readingMode === readingMode}
              onClick={() => setReadingMode(readingMode)}
            >
              {READING_MODE_LABELS[readingMode]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="button-secondary reset-preferences-button"
        onClick={onResetPreferences}
      >
        重設預設值
      </button>
    </div>
  )
}
