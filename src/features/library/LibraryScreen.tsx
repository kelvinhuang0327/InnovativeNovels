import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import type { RecentReadingEntry } from '../../application/library/libraryUseCases'
import { ContinueReadingShelf } from './ContinueReadingShelf'

interface LibraryScreenProps {
  readonly books: readonly ContentBook[]
  readonly recentReading: readonly RecentReadingEntry[]
  readonly continueReading: readonly ContinueReadingEntry[]
  readonly onBackToBookstore: () => void
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
  readonly onRemoveFromBookshelf: (bookId: string) => void
}

function LibraryBookCard({
  book,
  onOpenBook,
  onRemoveFromBookshelf,
}: {
  readonly book: ContentBook
  readonly onOpenBook: (bookId: string) => void
  readonly onRemoveFromBookshelf: (bookId: string) => void
}) {
  return (
    <li className="library-book-item">
      <div
        aria-hidden="true"
        className="library-book-cover"
        data-title={book.book.title}
      >
        <span>{book.book.categoryLabel}</span>
      </div>
      <div className="library-book-copy">
        <p className="book-meta">{book.book.categoryLabel}</p>
        <h3>{book.book.title}</h3>
        <p className="library-book-author">{book.book.authorName}</p>
        <p className="library-book-count">共 {book.chapters.length} 章</p>
        <div className="library-book-actions">
          <button
            type="button"
            onClick={() => onOpenBook(book.book.id)}
          >
            查看書籍
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => onRemoveFromBookshelf(book.book.id)}
          >
            移出書架
          </button>
        </div>
      </div>
    </li>
  )
}

function RecentReadingCard({
  entry,
  onOpenBook,
  onContinueBook,
}: {
  readonly entry: RecentReadingEntry
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
}) {
  const { book, chapterTitle } = entry

  return (
    <li className="library-recent-item">
      <div
        aria-hidden="true"
        className="library-recent-cover"
        data-title={book.book.title}
      >
        <span>{book.book.categoryLabel}</span>
      </div>
      <div className="library-recent-copy">
        <p className="book-meta">{book.book.categoryLabel}</p>
        <h3>{book.book.title}</h3>
        <p className="library-book-author">{book.book.authorName}</p>
        <p className="library-recent-chapter">
          {chapterTitle ? `目前章節 · ${chapterTitle}` : '尚未儲存閱讀位置'}
        </p>
        <div className="library-book-actions">
          <button
            type="button"
            onClick={() => onContinueBook(book.book.id)}
          >
            {chapterTitle ? '繼續閱讀' : '開始閱讀'}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => onOpenBook(book.book.id)}
          >
            查看書籍
          </button>
        </div>
      </div>
    </li>
  )
}

export function LibraryScreen({
  books,
  recentReading,
  continueReading,
  onBackToBookstore,
  onOpenBook,
  onContinueBook,
  onRemoveFromBookshelf,
}: LibraryScreenProps) {
  return (
    <section
      aria-label="個人閱讀中心"
      className="library-screen"
    >
      <header className="library-header">
        <div>
          <p className="section-kicker">個人閱讀</p>
          <h1 className="screen-heading" id="library-heading">
            我的書架
          </h1>
          <p className="library-supporting-copy">
            把想讀的故事留在身邊，回來就能接著讀。
          </p>
        </div>
      </header>

      {continueReading.length > 0 && (
        <ContinueReadingShelf
          entries={continueReading}
          onContinueBook={onContinueBook}
        />
      )}

      <section
        aria-labelledby="bookshelf-heading"
        className="library-section"
      >
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">收藏的故事</p>
            <h2 className="section-heading" id="bookshelf-heading">
              我的書架
            </h2>
          </div>
          <p className="section-heading-note">{books.length} 本</p>
        </div>

        {books.length === 0 ? (
          <div className="library-empty-state" role="status">
            <p>還沒有收藏小說，從書城挑一本加入書架。</p>
            <button type="button" onClick={onBackToBookstore}>
              前往書城
            </button>
          </div>
        ) : (
          <ul className="library-book-list">
            {books.map((book) => (
              <LibraryBookCard
                book={book}
                key={book.book.id}
                onOpenBook={onOpenBook}
                onRemoveFromBookshelf={onRemoveFromBookshelf}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="recent-reading-heading"
        className="library-section"
      >
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">回到最近打開的故事</p>
            <h2 className="section-heading" id="recent-reading-heading">
              最近閱讀
            </h2>
          </div>
          <p className="section-heading-note">依最近開啟排序</p>
        </div>

        {recentReading.length === 0 ? (
          <div className="library-empty-state" role="status">
            <p>開始閱讀後，最近看過的故事會出現在這裡。</p>
          </div>
        ) : (
          <ul className="library-recent-list">
            {recentReading.map((entry) => (
              <RecentReadingCard
                entry={entry}
                key={entry.book.book.id}
                onContinueBook={onContinueBook}
                onOpenBook={onOpenBook}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
