import type { ContentBook } from '../../application/catalog/contentRepository'
import {
  CHAPTER_ACCESS,
  type ChapterAccess,
} from '../../domain/access/chapterAccess'
import { decideChapterAccess } from '../../domain/access/chapterAccessPolicy'

interface BookDetailScreenProps {
  readonly book: ContentBook
  readonly hasSavedPosition: boolean
  readonly continueChapterId?: string
  readonly continueChapterTitle?: string
  readonly sessionReturnStatus?: string
  readonly isInBookshelf?: boolean
  readonly onBack: () => void
  readonly onRead: () => void
  readonly onReadChapter: (chapterId: string) => void
  readonly onToggleBookshelf?: () => void
  readonly backButtonLabel?: string
}

const chapterAccessLabels: Record<ChapterAccess, string> = {
  [CHAPTER_ACCESS.READABLE]: '可閱讀',
  [CHAPTER_ACCESS.PREVIEW]: '試閱',
  [CHAPTER_ACCESS.LOCKED]: '已鎖定',
  [CHAPTER_ACCESS.UNAVAILABLE]: '暫不可用',
}

export function BookDetailScreen({
  book,
  hasSavedPosition,
  continueChapterId,
  continueChapterTitle,
  sessionReturnStatus,
  isInBookshelf = false,
  onBack,
  onRead,
  onReadChapter,
  onToggleBookshelf,
  backButtonLabel = '返回書庫',
}: BookDetailScreenProps) {
  const readButtonText = hasSavedPosition
    ? continueChapterTitle
      ? `繼續閱讀：${continueChapterTitle}`
      : '繼續閱讀'
    : '開始閱讀'
  const orderedChapters = [...book.chapters].sort(
    (left, right) => left.sequence - right.sequence,
  )

  return (
    <section aria-labelledby="book-heading">
      <h1 className="screen-heading" id="book-heading">
        {book.book.title}
      </h1>
      {sessionReturnStatus && (
        <div
          className="session-return-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {sessionReturnStatus}
        </div>
      )}
      <p className="book-meta">
        {book.book.categoryLabel} · {book.book.authorName}
      </p>
      <p className="book-description">{book.description}</p>
      <p>共 {book.chapters.length} 章</p>

      {onToggleBookshelf && (
        <div className="book-detail-shelf-action">
          <button
            aria-pressed={isInBookshelf}
            className="button-secondary"
            type="button"
            onClick={onToggleBookshelf}
          >
            {isInBookshelf ? '移出書架' : '加入書架'}
          </button>
        </div>
      )}

      <section
        className="book-chapter-preview"
        aria-labelledby="chapter-preview-heading"
      >
        <h2 className="section-heading" id="chapter-preview-heading">
          章節預覽
        </h2>
        <ol className="book-chapter-list" aria-label="章節預覽列表">
          {orderedChapters.map((chapter) => {
            const access = decideChapterAccess(chapter.access)
            const accessLabel = chapterAccessLabels[access.access]
            const isContinueChapter =
              hasSavedPosition && chapter.id === continueChapterId
            const actionLabel =
              access.access === CHAPTER_ACCESS.PREVIEW
                ? '開始試閱'
                : '閱讀本章'

            return (
              <li
                key={chapter.id}
                className={`book-chapter-item ${isContinueChapter ? 'is-continue' : ''}`}
                aria-current={isContinueChapter ? 'true' : undefined}
              >
                <div className="book-chapter-copy">
                  <span className="book-chapter-sequence">
                    第 {chapter.sequence} 章
                  </span>
                  <span className="book-chapter-title">{chapter.title}</span>
                  <span className="book-chapter-access">{accessLabel}</span>
                  {isContinueChapter && (
                    <span className="book-chapter-continue">
                      目前閱讀進度
                    </span>
                  )}
                </div>
                {access.canOpen && (
                  <button
                    type="button"
                    className="book-chapter-action"
                    aria-label={`${actionLabel}：${chapter.title}（${accessLabel}）`}
                    onClick={() => onReadChapter(chapter.id)}
                  >
                    {actionLabel}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <div className="actions">
        <button type="button" onClick={onRead} aria-label={readButtonText}>
          {readButtonText}
        </button>
        <button className="button-secondary" type="button" onClick={onBack}>
          {backButtonLabel}
        </button>
      </div>
    </section>
  )
}
