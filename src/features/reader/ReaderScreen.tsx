import { useState } from 'react'
import type {
  BookmarkEntry,
  OpenedChapter,
} from '../../application/reading/readingUseCases'
import type { ReaderPreferences } from '../../domain/reading/readerPreferences'
import { ChapterBookmarksModal } from './ChapterBookmarksModal'
import { ReaderComfortControls } from './ReaderComfortControls'

interface ReaderScreenProps {
  readonly openedChapter: OpenedChapter
  readonly preferences: ReaderPreferences
  readonly isBookmarked: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
  readonly onToggleBookmark: () => void
  readonly onSelectBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly onBackToBook: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
}

export function ReaderScreen({
  openedChapter,
  preferences,
  isBookmarked,
  bookmarks,
  onChangePreferences,
  onResetPreferences,
  onToggleBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  onBackToBook,
  onPrevious,
  onNext,
}: ReaderScreenProps) {
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)

  return (
    <section
      className="reader-screen-container"
      data-theme={preferences.theme}
      data-font-scale={preferences.fontScale}
      data-line-spacing={preferences.lineSpacing}
      aria-label="閱讀器"
    >
      <header className="reader-toolbar">
        <ReaderComfortControls
          preferences={preferences}
          onChangePreferences={onChangePreferences}
          onResetPreferences={onResetPreferences}
        />

        <div className="reader-bookmark-toolbar">
          {!openedChapter.isLocked && (
            <button
              type="button"
              className={`button-bookmark ${isBookmarked ? 'is-active' : ''}`}
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? '移除章節書籤' : '加入章節書籤'}
            >
              {isBookmarked ? '★ 已加入書籤' : '☆ 加入書籤'}
            </button>
          )}

          <button
            type="button"
            className="button-secondary button-open-bookmarks"
            onClick={() => setIsBookmarksOpen(true)}
            aria-label="開啟書籤列表"
          >
            書籤列表 ({bookmarks.length})
          </button>
        </div>
      </header>

      <h1 className="screen-heading">{openedChapter.chapter.title}</h1>

      {openedChapter.isLocked ? (
        <div className="locked-notice" role="note">
          本章尚未開放，沒有載入任何內文。
        </div>
      ) : (
        <article
          className={`reader-prose theme-${preferences.theme} font-scale-${preferences.fontScale} line-spacing-${preferences.lineSpacing}`}
          aria-label="章節內文"
        >
          {openedChapter.prose.map((paragraph) => (
            <p data-testid="chapter-prose" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </article>
      )}

      <nav className="reader-navigation" aria-label="章節導覽">
        {openedChapter.hasPrevious && (
          <button
            className="button-secondary"
            type="button"
            onClick={onPrevious}
          >
            上一章
          </button>
        )}
        {openedChapter.hasNext && (
          <button type="button" onClick={onNext}>
            下一章
          </button>
        )}
        <button
          className="button-secondary"
          type="button"
          onClick={onBackToBook}
        >
          返回書籍
        </button>
      </nav>

      <ChapterBookmarksModal
        isOpen={isBookmarksOpen}
        bookmarks={bookmarks}
        onClose={() => setIsBookmarksOpen(false)}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />
    </section>
  )
}
