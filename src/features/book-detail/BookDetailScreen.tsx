import type { ContentBook } from '../../application/catalog/contentRepository'

interface BookDetailScreenProps {
  readonly book: ContentBook
  readonly hasSavedPosition: boolean
  readonly onBack: () => void
  readonly onRead: () => void
}

export function BookDetailScreen({
  book,
  hasSavedPosition,
  onBack,
  onRead,
}: BookDetailScreenProps) {
  return (
    <section aria-labelledby="book-heading">
      <h1 className="screen-heading" id="book-heading">
        {book.book.title}
      </h1>
      <p className="book-meta">
        {book.book.categoryLabel} · {book.book.authorName}
      </p>
      <p className="book-description">{book.description}</p>
      <p>共 {book.chapters.length} 章</p>

      <div className="actions">
        <button type="button" onClick={onRead}>
          {hasSavedPosition ? '繼續閱讀' : '開始閱讀'}
        </button>
        <button className="button-secondary" type="button" onClick={onBack}>
          返回書庫
        </button>
      </div>
    </section>
  )
}
