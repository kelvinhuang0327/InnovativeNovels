import type { ContentBook } from '../../application/catalog/contentRepository'

interface BookDetailScreenProps {
  readonly book: ContentBook
  readonly hasSavedPosition: boolean
  readonly continueChapterTitle?: string
  readonly sessionReturnStatus?: string
  readonly onBack: () => void
  readonly onRead: () => void
}

export function BookDetailScreen({
  book,
  hasSavedPosition,
  continueChapterTitle,
  sessionReturnStatus,
  onBack,
  onRead,
}: BookDetailScreenProps) {
  const readButtonText = hasSavedPosition
    ? continueChapterTitle
      ? `繼續閱讀：${continueChapterTitle}`
      : '繼續閱讀'
    : '開始閱讀'

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

      <div className="actions">
        <button type="button" onClick={onRead} aria-label={readButtonText}>
          {readButtonText}
        </button>
        <button className="button-secondary" type="button" onClick={onBack}>
          返回書庫
        </button>
      </div>
    </section>
  )
}
