import {
  formatBookDetailDepthSummary,
  getReadingDepth,
} from '../../application/catalog/catalogUseCases'
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
  const depth = getReadingDepth(book.chapters)
  const chapterCountLabel = `${depth.totalChapters} 章`
  const readableCountLabel = `${depth.openableChapters} 章`
  const depthSummary = formatBookDetailDepthSummary(depth)

  return (
    <section
      aria-labelledby="book-heading"
      className="book-detail-screen"
    >
      <header className="book-detail-hero">
        <div className="book-detail-hero-topline">
          <button
            aria-label={backButtonLabel}
            className="button-secondary book-detail-back"
            type="button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            {backButtonLabel}
          </button>
          <p className="book-detail-kicker">作品詳情</p>
        </div>

        <div className="book-detail-hero-grid">
          <div
            aria-hidden="true"
            className="book-detail-cover"
            data-title={book.book.title}
          >
            <span>IN · {book.book.categoryLabel}</span>
          </div>

          <div className="book-detail-intro">
            <h1 className="book-detail-title" id="book-heading">
              {book.book.title}
            </h1>

            <dl className="book-detail-facts">
              <div>
                <dt>類型</dt>
                <dd>{book.book.categoryLabel}</dd>
              </div>
              <div>
                <dt>作者</dt>
                <dd>{book.book.authorName}</dd>
              </div>
              <div>
                <dt>章節</dt>
                <dd>{chapterCountLabel}</dd>
              </div>
              <div>
                <dt>可閱讀</dt>
                <dd>{readableCountLabel}</dd>
              </div>
            </dl>

            <div className="book-detail-actions">
              <button
                aria-label={readButtonText}
                className="book-detail-read-action"
                type="button"
                onClick={onRead}
              >
                {readButtonText}
              </button>
              {onToggleBookshelf && (
                <button
                  aria-pressed={isInBookshelf}
                  className="button-secondary book-detail-shelf-action"
                  type="button"
                  onClick={onToggleBookshelf}
                >
                  {isInBookshelf ? '移出書架' : '加入書架'}
                </button>
              )}
            </div>

            <p className="book-detail-depth-summary">{depthSummary}</p>

            {hasSavedPosition && (
              <p className="book-detail-progress">
                <span className="book-detail-progress-label">閱讀進度</span>
                {continueChapterTitle
                  ? `目前讀到：${continueChapterTitle}`
                  : '這本書已有閱讀進度'}
              </p>
            )}
          </div>
        </div>
      </header>


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

      <section
        aria-labelledby="book-synopsis-heading"
        className="book-detail-synopsis"
      >
        <p className="section-kicker">故事提要</p>
        <h2 className="section-heading" id="book-synopsis-heading">
          作品簡介
        </h2>
        <p className="book-description">{book.description}</p>
      </section>

      <section
        className="book-chapter-preview"
        aria-labelledby="chapter-directory-heading"
      >
        <div className="section-heading-row book-detail-section-heading">
          <div>
            <p className="section-kicker">沿章節順序閱讀</p>
            <h2 className="section-heading" id="chapter-directory-heading">
              章節目錄
            </h2>
          </div>
          <p className="section-heading-note">共 {chapterCountLabel}</p>
        </div>
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
                data-access={access.access}
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
    </section>
  )
}
