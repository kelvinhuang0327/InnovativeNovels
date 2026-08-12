import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'

interface ContinueReadingShelfProps {
  readonly entries: readonly ContinueReadingEntry[]
  readonly onContinueBook: (bookId: string) => void
}

export function ContinueReadingShelf({
  entries,
  onContinueBook,
}: ContinueReadingShelfProps) {
  return (
    <section
      aria-labelledby="continue-reading-heading"
      className="continue-reading-shelf"
    >
      <h2 className="section-heading" id="continue-reading-heading">
        繼續閱讀
      </h2>
      <ul className="continue-reading-list">
        {entries.map(({ book, chapter }) => (
          <li className="continue-reading-item" key={book.book.id}>
            <div
              aria-hidden="true"
              className="continue-reading-cover"
              data-title={book.book.title}
            >
              <span>IN</span>
            </div>
            <div className="continue-reading-copy">
              <p className="book-meta">{book.book.categoryLabel}</p>
              <p className="continue-reading-title">{book.book.title}</p>
              <p className="continue-reading-author">{book.book.authorName}</p>
              <p className="continue-reading-chapter">
                <span>目前章節 · </span>
                <span>{chapter.title}</span>
              </p>
            </div>
            <button
              className="continue-reading-action"
              onClick={() => onContinueBook(book.book.id)}
              type="button"
            >
              繼續閱讀
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
