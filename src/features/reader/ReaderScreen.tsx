import { useRef, useState } from 'react'
import type {
  BookmarkEntry,
  ChapterPositionProgress,
  OpenedChapter,
  TableOfContentsEntry,
} from '../../application/reading/readingUseCases'
import type { ReaderPreferences } from '../../domain/reading/readerPreferences'
import { ChapterBookmarksModal } from './ChapterBookmarksModal'
import { ReaderComfortControls } from './ReaderComfortControls'
import { TableOfContentsModal } from './TableOfContentsModal'

interface ReaderScreenProps {
  readonly openedChapter: OpenedChapter
  readonly preferences: ReaderPreferences
  readonly isBookmarked: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly tableOfContents: readonly TableOfContentsEntry[]
  readonly chapterPosition: ChapterPositionProgress | undefined
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
  readonly onToggleBookmark: () => void
  readonly onSelectBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly onSelectChapter: (chapterId: string) => void
  readonly onBackToBook: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
}

export function ReaderScreen({
  openedChapter,
  preferences,
  isBookmarked,
  bookmarks,
  tableOfContents,
  chapterPosition,
  onChangePreferences,
  onResetPreferences,
  onToggleBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  onSelectChapter,
  onBackToBook,
  onPrevious,
  onNext,
}: ReaderScreenProps) {
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const tocTriggerRef = useRef<HTMLButtonElement>(null)

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

          <button
            ref={tocTriggerRef}
            type="button"
            className="button-secondary button-open-toc"
            onClick={() => setIsTocOpen(true)}
            aria-label="開啟章節目錄"
          >
            章節目錄
          </button>
        </div>
      </header>

      <h1 className="screen-heading">{openedChapter.chapter.title}</h1>

      {chapterPosition && (
        <div
          className="chapter-position-progress"
          role="progressbar"
          aria-label="目前章節位置"
          aria-valuemin={1}
          aria-valuemax={chapterPosition.totalChapters}
          aria-valuenow={chapterPosition.currentPosition}
          aria-valuetext={`第 ${chapterPosition.currentPosition} / ${chapterPosition.totalChapters} 章`}
        >
          <span aria-hidden="true">
            第 {chapterPosition.currentPosition} / {chapterPosition.totalChapters} 章
          </span>
          <span className="chapter-position-track" aria-hidden="true">
            <span
              className="chapter-position-fill"
              style={{
                width: `${
                  (chapterPosition.currentPosition /
                    chapterPosition.totalChapters) *
                  100
                }%`,
              }}
            />
          </span>
        </div>
      )}

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

      <nav
        className="reader-persistent-navigation"
        aria-label="章節快捷導覽"
        data-testid="reader-persistent-navigation"
      >
        <button
          type="button"
          className="button-secondary button-persistent-nav button-persistent-prev"
          onClick={onPrevious}
          disabled={!openedChapter.hasPrevious}
          aria-disabled={!openedChapter.hasPrevious}
          aria-label="上一章"
        >
          上一章
        </button>

        {chapterPosition ? (
          <span className="persistent-position-text">
            第 {chapterPosition.currentPosition} / {chapterPosition.totalChapters} 章
          </span>
        ) : (
          <span className="persistent-position-text">
            {openedChapter.chapter.title}
          </span>
        )}

        <button
          type="button"
          className="button-persistent-nav button-persistent-next"
          onClick={onNext}
          disabled={!openedChapter.hasNext}
          aria-disabled={!openedChapter.hasNext}
          aria-label="下一章"
        >
          下一章
        </button>
      </nav>

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        已切換至：{openedChapter.chapter.title}
      </div>

      <ChapterBookmarksModal
        isOpen={isBookmarksOpen}
        bookmarks={bookmarks}
        onClose={() => setIsBookmarksOpen(false)}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />

      <TableOfContentsModal
        isOpen={isTocOpen}
        entries={tableOfContents}
        triggerRef={tocTriggerRef}
        onClose={() => setIsTocOpen(false)}
        onSelectChapter={onSelectChapter}
      />
    </section>
  )
}

