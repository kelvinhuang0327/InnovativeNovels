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
            <div>
              <p className="book-meta">{book.book.categoryLabel}</p>
              <p className="continue-reading-title">{book.book.title}</p>
              <p className="continue-reading-chapter">{chapter.title}</p>
            </div>
            <button type="button" onClick={() => onContinueBook(book.book.id)}>
              繼續閱讀
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
